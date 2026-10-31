import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render } from '../../src/render.js';
import { slides } from '../../src/slides.js';
import { preview, settle, assertNotElement } from '../../test/dom.js';

const STEPS = '## Soup\n\n1) [ ] Chop.\n2) [ ] Fry.\n3) [ ] Simmer.\n\n@ Notes: x\n';

/** The preview showing STEPS: `press` presses a key in the page, `lit` is the step lit, from 1. */
function page(m = {}) {
  const p = preview();
  p.show(render(STEPS).body, m);
  const steps = () => [...p.document.querySelectorAll('li.step')];
  const press = (key, keys = {}, on = p.document.body) => {
    const e = new p.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...keys });
    on.dispatchEvent(e);
    return e.defaultPrevented;
  };
  const lit = () => steps().findIndex((li) => li.classList.contains('step-current')) + 1;
  return { ...p, steps, press, lit };
}

test('j and k light the next step and the one before, from the first, and no further than either end', () => {
  const { press, lit } = page();
  assert.equal(lit(), 0);
  assert.equal(press('j'), true);
  assert.equal(lit(), 1);
  press('j');
  press('j');
  press('j');
  assert.equal(lit(), 3);
  press('k');
  assert.equal(lit(), 2);
  press('k');
  press('k');
  assert.equal(lit(), 1);
});

test('x marks the lit step done, and lights the next not done', async () => {
  const { press, lit, steps, posted } = page();
  assert.equal(press('x'), true, 'nothing lit: the key is the steps\', and does nothing');
  await settle();
  assert.deepEqual(posted.filter((m) => m.type === 'edit'), []);
  press('j');
  press('j');
  press('x');
  await settle();
  assert.deepEqual(posted.filter((m) => m.type === 'edit').map((m) => m.edits.map((e) => e.after[0])), [['2) [x] Fry.']]);
  assert.deepEqual(steps().map((li) => li.classList.contains('step-done')), [false, true, false]);
  assert.equal(lit(), 3);
});

test('the keys are left alone with a modifier, while typing, and on a slide', () => {
  const { press, lit, document } = page();
  for (const keys of [{ metaKey: true }, { ctrlKey: true }, { altKey: true }]) assert.equal(press('j', keys), false);
  document.querySelector('.field').click();
  assert.equal(press('j', {}, document.querySelector('.field textarea')), false);
  assert.equal(lit(), 0);
  const deck = page({ deck: true });
  deck.press('j');
  assert.equal(deck.lit(), 0);
});

test('the keys are the steps\' only on the page itself or a step\'s box, not on another control', () => {
  const p = preview();
  p.show(render(`${STEPS}\n* [ ] a plain box\n\n[a link](x.md)\n`).body);
  const press = (key, on) => {
    const e = new p.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    on.dispatchEvent(e);
    return e.defaultPrevented;
  };
  const lit = () => [...p.document.querySelectorAll('li.step')].findIndex((li) => li.classList.contains('step-current')) + 1;
  assert.equal(press('j', p.document.querySelector('li.task:not(.step) .task-box')), false);
  assert.equal(press('x', p.document.querySelector('a')), false);
  assert.equal(lit(), 0);
  assert.equal(press('j', p.document.querySelector('li.step .task-box')), true);
  assert.equal(lit(), 1);
});

test('x marks the lit step done with the keyboard on a step\'s own box, as Tab leaves it', async () => {
  const { press, steps, posted, document } = page();
  const box = document.querySelector('li.step .task-box');
  box.focus();
  assert.equal(press('j', {}, box), true);
  assert.equal(press('x', {}, box), true);
  await settle();
  assert.deepEqual(posted.filter((m) => m.type === 'edit').map((m) => m.edits.map((e) => e.after[0])), [['1) [x] Chop.']]);
  assert.deepEqual(steps().map((li) => li.classList.contains('step-done')), [true, false, false]);
});

test('the lit step is the current one, and j, k and x say where they left the steps', () => {
  const { press, steps, document } = page();
  const said = () => document.querySelector('html > .vh')?.textContent.trim();
  press('j');
  assert.equal(steps()[0].getAttribute('aria-current'), 'step');
  assert.equal(said(), 'Step 1 of 3: Chop.');
  press('j');
  assert.equal(steps()[0].hasAttribute('aria-current'), false);
  assert.equal(said(), 'Step 2 of 3: Fry.');
  press('x');
  assert.equal(said(), 'Step 2 done. Step 3 of 3: Simmer.');
  press('k');
  assert.equal(said(), 'Step 2 of 3, done: Fry.');
});

test('on a slide, a step\'s badge only says whether it\'s done: a click or Space ticks nothing, and a click on the step moves the deck', async () => {
  const p = preview();
  p.show(slides(`${STEPS}\n---\n\n# Next\n`).slides[0].body, { deck: true });
  p.posted.length = 0;
  const box = p.document.querySelector('li.step .task-box');
  box.focus();
  assertNotElement(p.document.activeElement, box, 'the keyboard doesn\'t reach it');
  box.click();
  box.dispatchEvent(new p.window.KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
  p.document.body.dispatchEvent(new p.window.KeyboardEvent('keydown', { key: 'x', bubbles: true, cancelable: true }));
  await settle();
  assert.deepEqual(p.posted.filter((m) => m.type === 'edit'), []);
  assert.equal(box.checked, false);
  assert.equal(p.document.querySelector('li.step-done'), null);
  // The step itself isn't the steps' to light there: a click on it moves the deck.
  p.document.querySelectorAll('li.step')[2].click();
  assert.equal(p.document.querySelectorAll('li.step')[2].classList.contains('step-current'), false);
  assert.equal(p.posted.filter((m) => m.type === 'click').length, 1);
});
