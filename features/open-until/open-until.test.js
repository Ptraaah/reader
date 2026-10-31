import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { render } from '../../src/render.js';
import { slides, pages } from '../../src/slides.js';
import { preview, settle, assertNotElement } from '../../test/dom.js';
import { readUntil, closingTime, deadline } from './index.js';

const at = (...parts) => new Date(...parts).getTime();
const FORM = '---\ntitle: Sign-up\nopen-until: 2026-10-28 04:00\n---\n\n- [ ] Bring a dish\n\n@ Name {e.g. Ada}:\n\n@ Size: ( ) big ( ) small\n\nOn date:2026-11-10[].\n\n```sudoku\n```\n';
const BEFORE = at(2026, 9, 28, 3, 13);
const AFTER = at(2026, 9, 28, 4, 0);

test('it\'s open until a time on a day, or to the end of a day, by the clock where it\'s read', () => {
  assert.deepEqual(readUntil('2026-10-28 04:00'), { year: 2026, month: 10, day: 28, hour: 4, minute: 0 });
  assert.deepEqual(readUntil('2026-10-27'), { year: 2026, month: 10, day: 27, hour: null, minute: null });
  assert.deepEqual(readUntil('2026-10-28T16:30'), { year: 2026, month: 10, day: 28, hour: 16, minute: 30 });
  for (const no of ['2026-02-30', '2026-10-28 24:00', '2026-10-28 4:60', 'tomorrow', '28/10/2026']) assert.equal(readUntil(no), null, no);
  assert.equal(closingTime(readUntil('2026-10-28 04:00')), at(2026, 9, 28, 4, 0));
  assert.equal(closingTime(readUntil('2026-10-27')), at(2026, 9, 28), 'a day alone closes as the next begins');
  assert.equal(deadline(readUntil('2026-10-28 16:30')), '16:30 on 28 October 2026');
  assert.equal(deadline(readUntil('2026-10-27')), 'the end of 27 October 2026');
});

test('the byline says until when it can be edited, in place of the line as written', () => {
  const { body } = render(FORM, { now: BEFORE });
  assert.match(body, /<div class="gm-byline"><span class="open-until" data-until="2026-10-28 04:00" data-closed="Closed at 4:00 on 28 October 2026">Editable Until 4:00 on 28 October 2026<span class="open-until-away"><\/span><\/span><\/div>/);
  assert.doesNotMatch(body, /open-until: /);
  assert.match(render('---\nopen-until: "2026-10-27"\n---\n\nx\n', { now: at(2026, 9, 27, 12) }).body, />Editable Until the End of 27 October 2026</);
  // One it can't read is shown as written, so whoever wrote it sees it wasn't.
  assert.match(render('---\nopen-until: Friday\n---\n\nx\n').body, /<span>open-until: Friday<\/span>/);
});

test('until then the page is worked as any is', () => {
  const { body } = render(FORM, { now: BEFORE });
  assert.doesNotMatch(body, /disabled/);
  assert.match(body, /role="textbox" aria-label="Name" data-hint="e.g. Ada"/);
  assert.match(body, /class="date"[^>]* tabindex="0"/);
  assert.match(body, /class="puzzle"[^>]* data-from=/);
});

test('from then it\'s a record: as it was left, nothing to type, tick or play, no hint, and the byline says since when', () => {
  const { body } = render(FORM, { now: AFTER });
  assert.match(body, /<span class="open-until open-until-closed" role="note" tabindex="0" aria-label="No Longer Editable. Closed at 4:00 on 28 October 2026"[^>]*>No Longer Editable<\/span>/);
  assert.equal(body.match(/<input[^>]*>/g).length, 3);
  assert.ok(body.match(/<input[^>]*>/g).every((i) => / disabled/.test(i)));
  assert.doesNotMatch(body, /role="textbox"|data-hint|task-reset/);
  assert.match(body, /<span class="field-value" data-value=""><\/span><span class="field-blank vh">blank<\/span>/);
  assert.doesNotMatch(body, /class="date"[^>]* tabindex/);
  assert.doesNotMatch(body, /class="puzzle"[^>]* data-from=/);
});

test('a workbook says it atop each page, and a deck\'s slides are shut by it too, though they don\'t say it', () => {
  const book = '---\ntype: workbook\nopen-until: 2026-10-27\n---\n\n# One\n\n- [ ] a\n\n---\n\n# Two\n\n```sudoku\n```\n';
  const open = pages(book, { now: at(2026, 9, 27, 23, 59) }).pages;
  assert.equal(open.length, 2);
  for (const p of open) assert.match(p.body, /<div class="gm-speaker">\n<p class="open-until" data-until="2026-10-27"[^>]*>Editable Until the End of 27 October 2026/);
  const shut = pages(book, { now: at(2026, 9, 28) }).pages;
  for (const p of shut) assert.match(p.body, /<p class="open-until open-until-closed"[^>]*>No Longer Editable<\/p>/);
  const deck = slides(book.replace('workbook', 'slides'), { now: at(2026, 9, 28) }).slides;
  assert.doesNotMatch(deck.map((s) => s.body).join(''), /open-until/);
  assert.doesNotMatch(deck[1].body, /data-from=/, 'a puzzle on a slide is played, but not in a record');
});

// Each frame's clock keeps ticking, a minute at a time, till it's closed.
const frames = [];
after(() => Promise.all(frames.map((w) => w.happyDOM.close())));

/** The frame showing FORM as the server drew it at `drawn`, its clock at `now`. */
function showing(drawn, now) {
  const p = preview();
  frames.push(p.window);
  let clock = now;
  p.window.Date.now = () => clock;
  p.show(render(FORM, { now: drawn }).body);
  const notice = () => p.document.querySelector('.open-until');
  return { ...p, notice, set: (t) => { clock = t; } };
}

test('in the frame, the notice says how far away the time is, and the page is open', () => {
  const { window, document, notice } = showing(BEFORE, BEFORE);
  assert.equal(notice().textContent, 'Editable Until 4:00 on 28 October 2026, 47 Minutes Away');
  assert.equal(window.Preview.closed, false);
  assert.equal(window.Preview.workable, true);
  assert.equal(document.documentElement.classList.contains('closed'), false);
  const away = (t) => {
    const p = showing(BEFORE, t);
    return p.notice().querySelector('.open-until-away').textContent;
  };
  assert.equal(away(at(2026, 9, 25, 22, 0)), ', Two Days Away');
  assert.equal(away(at(2026, 9, 27, 18, 0)), ', 10 Hours Away');
  assert.equal(away(at(2026, 9, 28, 3, 0)), ', One Hour Away');
  assert.equal(away(at(2026, 9, 28, 3, 59, 30)), ', Less Than a Minute Away');
});

test('in the frame, a page the server drew open is shut by the reader\'s clock, if it\'s past', () => {
  const { window, document, notice } = showing(BEFORE, AFTER);
  assert.equal(window.Preview.closed, true);
  assert.equal(window.Preview.workable, false);
  assert.equal(document.documentElement.classList.contains('closed'), true);
  assert.equal(notice().textContent, 'No Longer Editable');
  assert.equal(notice().getAttribute('aria-label'), 'No Longer Editable. Closed at 4:00 on 28 October 2026');
  assert.equal(notice().tabIndex, 0);
});

test('when the time comes while it\'s showing, the page shuts: a blank being typed in is kept and closed, and nothing is left to work', async () => {
  const p = showing(BEFORE, AFTER - 30);
  const { window, document, notice, posted } = p;
  assert.equal(window.Preview.closed, false);
  document.querySelector('.field').click();
  const input = document.querySelector('.field textarea');
  input.value = 'Ada';
  p.set(AFTER);
  await new Promise((r) => setTimeout(r, 80));
  await settle();
  assert.equal(window.Preview.closed, true);
  assert.equal(notice().textContent, 'No Longer Editable');
  assert.equal(document.querySelector('.field textarea'), null);
  assert.deepEqual(posted.filter((m) => m.type === 'edit').flatMap((m) => m.edits.map((e) => e.after[0])), ['@ Name {e.g. Ada}: Ada']);
  for (const box of document.querySelectorAll('input')) assert.equal(box.disabled, true);
  assert.equal(document.querySelector('.field-value[tabindex], .date[tabindex], .puzzle[tabindex]'), null);
  document.querySelector('.field').click();
  assert.equal(document.querySelector('.field textarea'), null, 'no blank opens');
  // A render puts back the page as the server draws it, and it's judged again.
  p.show(render(FORM, { now: BEFORE }).body);
  assert.equal(window.Preview.closed, true);
  assert.equal(document.querySelector('.field-value[tabindex]'), null);
});

test('a page drawn shut stays shut, whatever the reader\'s clock says', () => {
  const { window, notice } = showing(AFTER, BEFORE);
  assert.equal(window.Preview.closed, true);
  assert.equal(notice().textContent, 'No Longer Editable');
});

test('a page without a time is never closed, nor one whose time is put off', () => {
  const p = showing(BEFORE, AFTER);
  assert.equal(p.window.Preview.closed, true);
  p.show(render(FORM.replace('2026-10-28 04:00', '2026-10-29'), { now: BEFORE }).body);
  assert.equal(p.window.Preview.closed, false);
  assert.equal(p.window.Preview.workable, true);
  assert.ok(p.document.querySelector('.field-value[tabindex="0"]'), 'its blanks are typed in again');
  p.show(render('# Just a page\n\n- [ ] a\n').body);
  assert.equal(p.window.Preview.closed, false);
});

test('a puzzle in a record is drawn as it was left, and can\'t be played: no keys, no keyboard, nothing written', async () => {
  const board = '```sudoku\n5 3 . | . 7 . | . . .\n6 . . | 1 9 5 | . . .\n. 9 8 | . . . | . 6 .\n8 . . | . 6 . | . . 3\n4 . . | 8 . 3 | . . 1\n7 . . | . 2 . | . . 6\n. 6 . | . . . | 2 8 .\n. . . | 4 1 9 | . . 5\n. . . | . 8 . | . 7 9\n```\n';
  const md = `---\nopen-until: 2026-10-28 04:00\n---\n\n${board}`;
  const p = preview();
  frames.push(p.window);
  let clock = AFTER - 30;
  p.window.Date.now = () => clock;
  p.show(render(md, { now: BEFORE }).body);
  const host = p.document.querySelector('.puzzle');
  assert.equal(host.tabIndex, 0);
  host.focus();
  clock = AFTER;
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(p.window.Preview.closed, true);
  assert.equal(host.hasAttribute('tabindex'), false);
  assert.equal(host.hasAttribute('role'), false);
  assertNotElement(p.document.activeElement, host);
  const key = (k) => host.dispatchEvent(new p.window.KeyboardEvent('keydown', { key: k, code: `Digit${k}`, bubbles: true, cancelable: true }));
  key('6');
  await settle();
  assert.deepEqual(p.posted.filter((m) => m.type === 'edit'), []);
  assert.ok(host.querySelector('.sudoku-grid'), 'still drawn');
});
