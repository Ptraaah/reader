import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render } from '../../src/render.js';
import { slides } from '../../src/slides.js';
import { preview, settle, assertElement } from '../../test/dom.js';
import { duration } from './index.js';

const para = (src, env) => render(src, env).body.match(/<p>([\s\S]*?)<\/p>/)[1];

test('a duration is hours, minutes and seconds, any left out, as a clock shows it and as it\'s said', () => {
  assert.deepEqual(duration('2m'), { seconds: 120, shown: '2:00', spoken: '2 minutes' });
  assert.deepEqual(duration('90s'), { seconds: 90, shown: '1:30', spoken: '1 minute 30 seconds' });
  assert.deepEqual(duration('1m30s'), { seconds: 90, shown: '1:30', spoken: '1 minute 30 seconds' });
  assert.deepEqual(duration('1h'), { seconds: 3600, shown: '1:00:00', spoken: '1 hour' });
  assert.deepEqual(duration('1h 5s'), { seconds: 3605, shown: '1:00:05', spoken: '1 hour 5 seconds' });
  assert.deepEqual(duration('5s'), { seconds: 5, shown: '0:05', spoken: '5 seconds' });
  for (const not of ['', '0s', '0m0s', 'soon', '2', '2 min', '30s1m', '1.5m', '-1m', '2m 2m']) assert.equal(duration(not), null, not);
});

test('timer:[2m] is its time, a Start button, and a Reset for once there\'s something to reset, in a group named for how long', () => {
  const key = render('# Warmup\n\ntimer:[2m]').body.match(/data-key="([^"]*)"/)[1];
  assert.equal(para('# Warmup\n\ntimer:[2m]'),
    `<span class="timer" role="group" aria-label="Timer, 2 minutes" data-seconds="120" data-key="${key}">`
    + '<span class="timer-time" role="timer">2:00</span><button type="button" class="timer-go">Start</button>'
    + '<button type="button" class="timer-reset" hidden>Reset</button></span>');
});

test('each is known by its length, which of that length, and its section, so lines typed above leave it be', () => {
  const keys = (src) => [...render(src).body.matchAll(/data-key="([^"]*)"/g)].map((m) => m[1]);
  const src = '# A\n\ntimer:[2m] timer:[90s] timer:[2m]\n\n## B\n\ntimer:[2m]\n';
  const [a, b] = [keys('# A\n\ntimer:[2m]')[0], keys('# B\n\ntimer:[2m]')[0]].map((k) => k.split('/')[1]);
  assert.notEqual(a, b);
  assert.deepEqual(keys(src), [`120/${a}/0`, `90/${a}/0`, `120/${a}/1`, `120/${b}/0`]);
  assert.deepEqual(keys(src.replace('# A\n', '# A\n\nMore words.\n')), keys(src));
});

test('what isn\'t a duration stays as typed, as does one in code or escaped', () => {
  for (const src of ['timer:[soon]', 'timer:[]', 'timer:[0s]', 'xtimer:[2m]', '\\timer:[2m]', 'timer:2m[x]', '`timer:[2m]`']) {
    assert.doesNotMatch(render(src).body, /class="timer"/, src);
  }
  assert.doesNotMatch(render('```\ntimer:[2m]\n```\n').body, /class="timer"/);
});

test('a task\'s box is named with how long its timer runs', () => {
  assert.match(render('- [ ] Breathe timer:[90s]\n').body, /aria-label="Breathe 1 minute 30 seconds"/);
});

test('it runs on a slide and in a record, where nothing can be worked, but an exported page only says how long', () => {
  const start = /<button type="button" class="timer-go">Start<\/button>/;
  assert.match(slides('# Warmup\n\ntimer:[2m]\n').slides[0].body, start);
  const record = '---\nopen-until: 2026-10-28 04:00\n---\n\n- [ ] Breathe timer:[2m]\n';
  const closed = render(record, { now: new Date(2026, 9, 29).getTime() }).body;
  assert.match(closed, / disabled/, 'the record is shut');
  assert.match(closed, start);
  assert.equal(para('timer:[2m] then timer:[1m30s]', { exported: true }), '<span class="timer">2 minutes</span> then <span class="timer">1 minute 30 seconds</span>');
});

// The frame's clock and its timeouts, moved on by hand; and what's played.
function clock(window) {
  let now = 1_000_000;
  const due = [];
  window.Date.now = () => now;
  window.setTimeout = (fn, ms = 0) => { due.push({ at: now + ms, fn }); return due.length; };
  window.clearTimeout = (id) => { if (due[id - 1]) due[id - 1].fn = null; };
  let every = null;
  window.setInterval = (fn) => { every = fn; return -1; };
  window.clearInterval = () => { every = null; };
  const played = [];
  window.Tone.play = (hz, opts) => { played.push([hz, opts.seconds]); return Promise.resolve(); };
  window.Tone.wake = () => {};
  return {
    played,
    pass(ms) {
      now += ms;
      for (const d of due) if (d.fn && d.at <= now) { const fn = d.fn; d.fn = null; fn(); }
      every?.();
    },
  };
}

const parts = (el) => ({
  time: el.querySelector('.timer-time').textContent,
  go: el.querySelector('.timer-go').textContent,
  reset: !el.querySelector('.timer-reset').hidden,
  up: el.querySelector('.timer-up')?.textContent ?? null,
});

test('in the preview it doesn\'t start by itself; Start counts down, Pause holds it, Resume goes on', async () => {
  const p = preview();
  const t = clock(p.window);
  p.show(render('# Warmup\n\ntimer:[2m]\n').body);
  const el = p.document.querySelector('.timer');
  assert.deepEqual(parts(el), { time: '2:00', go: 'Start', reset: false, up: null });
  t.pass(5000);
  assert.equal(parts(el).time, '2:00', 'not started');
  el.querySelector('.timer-go').click();
  assert.deepEqual(parts(el), { time: '2:00', go: 'Pause', reset: true, up: null });
  t.pass(30_500);
  p.show(render('# Warmup\n\ntimer:[2m]\n').body);
  const again = p.document.querySelector('.timer');
  assert.deepEqual(parts(again), { time: '1:30', go: 'Pause', reset: true, up: null }, 'running on across a render');
  again.querySelector('.timer-go').click();
  t.pass(60_000);
  assert.deepEqual(parts(again), { time: '1:30', go: 'Resume', reset: true, up: null });
  assert.ok(again.classList.contains('timer-paused'));
  again.querySelector('.timer-go').click();
  t.pass(1000);
  assert.equal(parts(again).time, '1:29');
  await settle();
  assert.deepEqual(p.posted.filter((m) => m.type === 'edit'), [], 'running it changes nothing in the file');
});

test('at zero it stops, says so on the page and once aloud, and sounds; Reset sets it back', () => {
  const p = preview();
  const t = clock(p.window);
  p.show(render('# Warmup\n\ntimer:[90s] timer:[2m]\n').body);
  const [short, long] = p.document.querySelectorAll('.timer');
  short.querySelector('.timer-go').click();
  long.querySelector('.timer-go').click();
  const said = p.document.querySelector('html > .vh');
  assert.equal(said.parentNode, p.document.documentElement, 'outside the page a render replaces');
  t.pass(89_000);
  assert.equal(said.textContent, '', 'nothing is said as it counts');
  t.pass(1000);
  assert.deepEqual(parts(short), { time: '0:00', go: 'Start', reset: true, up: 'Time’s up' });
  assert.ok(short.classList.contains('timer-done'));
  assert.equal(said.textContent, 'Timer, 1 minute 30 seconds: time’s up');
  t.pass(1000);
  assert.deepEqual(t.played, [[880, 0.4], [880, 0.4], [880, 0.4]]);
  assert.equal(parts(long).time, '0:29', 'the other runs on');
  short.querySelector('.timer-reset').click();
  assert.deepEqual(parts(short), { time: '1:30', go: 'Start', reset: false, up: null });
  assertElement(p.document.activeElement, short.querySelector('.timer-go'), 'the keyboard isn\'t left on a button that\'s gone');
  t.pass(30_000);
  assert.equal(said.textContent, 'Timer, 2 minutes: time’s up');
});

test('leaving the page doesn\'t stop it: it sounds at zero, and shows where it got to on coming back', () => {
  const p = preview();
  const t = clock(p.window);
  const warmup = render('# Warmup\n\ntimer:[2m]\n').body;
  p.show(warmup);
  p.document.querySelector('.timer-go').click();
  p.show(render('# Gratitude\n\ntimer:[2m]\n').body);
  assert.equal(parts(p.document.querySelector('.timer')).go, 'Start', 'another page\'s timer is its own');
  t.pass(120_000);
  assert.equal(t.played.length, 1);
  p.show(warmup);
  assert.deepEqual(parts(p.document.querySelector('.timer')), { time: '0:00', go: 'Start', reset: true, up: 'Time’s up' });
});

test('on a slide, Start runs it, and neither the click nor Enter moves the deck', () => {
  const p = preview();
  const t = clock(p.window);
  p.show(slides('# Warmup\n\ntimer:[1m]\n\n---\n\n# Next\n').slides[0].body, { deck: true });
  const go = p.document.querySelector('.timer-go');
  go.click();
  go.dispatchEvent(new p.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  t.pass(10_000);
  assert.equal(parts(p.document.querySelector('.timer')).time, '0:50');
  assert.deepEqual(p.posted.filter((m) => m.type === 'click' || m.type === 'key'), []);
});
