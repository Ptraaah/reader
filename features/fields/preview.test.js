import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render } from '../../src/render.js';
import { slides } from '../../src/slides.js';
import { frame, run, preview, settle, assertElement, assertNotElement } from '../../test/dom.js';

/**
 * The fields of `markdown` as rendered, in a page with preview.js loaded:
 * `await fill(i, value)` types `value` into the i-th and clicks away, and
 * `edits` is what it asked to be written by the end of that turn.
 */
function page(markdown) {
  const { window, document, posted } = frame(render(markdown).body);
  run(window, 'static/preview-api.js', 'features/fields/preview.js');
  const fields = [...document.querySelectorAll('.field')];
  // What it asked to be written, as it went up to the page around it.
  const edits = [];
  const heard = () => edits.splice(0, Infinity, ...posted.filter((m) => m.type === 'edit').flatMap((m) => m.edits));

  const open = (i) => {
    fields[i].click();
    return fields[i].querySelector('.field-value textarea');
  };
  const fill = async (i, value) => {
    const input = open(i);
    input.value = value;
    input.blur();
    await settle();
    heard();
  };
  const press = async (input, key) => {
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    await settle();
    heard();
  };
  return { fields, edits, open, fill, press };
}

const lines = (edits) => edits.map((e) => e.after[0]);

test('a field on a line of its own is written with its value after its colons', async () => {
  const { edits, fill } = page('@ Name: Josh\n\n@ Notes ::: it went\n');
  await fill(0, 'Ann');
  await fill(1, 'it went well');
  assert.deepEqual(edits, [
    { from: 0, to: 1, before: ['@ Name: Josh'], after: ['@ Name: Ann'] },
    { from: 2, to: 3, before: ['@ Notes ::: it went'], after: ['@ Notes ::: it went well'] },
  ]);
});

test('a field emptied is written as only its label and colons', async () => {
  const { edits, fill } = page('@ Name: Josh\n');
  await fill(0, '');
  assert.deepEqual(lines(edits), ['@ Name:']);
});

test('a field filled is written again from what it was last written as', async () => {
  const { edits, fill } = page('@ Name: Josh\n');
  await fill(0, 'Ann');
  await fill(0, 'Bea');
  assert.deepEqual(edits.map((e) => [e.before[0], e.after[0]]), [['@ Name: Josh', '@ Name: Ann'], ['@ Name: Ann', '@ Name: Bea']]);
});

test('what\'s typed is written on one line, and nothing is written when it\'s the same', async () => {
  const { edits, fill } = page('@ Name: Josh\n');
  await fill(0, '  Josh  ');
  assert.deepEqual(edits, []);
  await fill(0, ' two\n  lines ');
  assert.deepEqual(lines(edits), ['@ Name: two lines']);
});

test('Esc puts a field back as it was, and writes nothing', async () => {
  const { fields, edits, open, press } = page('@ Name: Josh\n');
  const input = open(0);
  input.value = 'Ann';
  await press(input, 'Escape');
  assert.deepEqual(edits, []);
  assert.equal(fields[0].querySelector('.field-value').textContent, 'Josh');
});

test('a hinted blank keeps its hint while it\'s typed in, and writes it back with its label', async () => {
  const { edits, open, fill } = page('@ Hours {e.g. 7.5}:\n@ Name: Josh\n');
  assert.equal(open(0).placeholder, 'e.g. 7.5');
  assert.equal(open(1).placeholder, '');
  await fill(0, '8');
  assert.deepEqual(lines(edits), ['@ Hours {e.g. 7.5}: 8']);
});

test('a field in a sentence is written into its place, and the ones after it move along', async () => {
  const { fields, edits, fill } = page('I am [@ name: Josh] and [@ age:] years, from [@ city: x].\n');
  await fill(0, 'Joshua');
  await fill(2, 'Provo');
  await fill(1, '40');
  await fill(0, '');
  assert.deepEqual(lines(edits), [
    'I am [@ name: Joshua] and [@ age:] years, from [@ city: x].',
    'I am [@ name: Joshua] and [@ age:] years, from [@ city: Provo].',
    'I am [@ name: Joshua] and [@ age: 40] years, from [@ city: Provo].',
    'I am [@ name] and [@ age: 40] years, from [@ city: Provo].',
  ]);
  // Each knows where it is on the line as now written.
  const now = edits.at(-1).after[0];
  for (const f of fields) {
    assert.equal(f.dataset.text, now);
    assert.match(now.slice(Number(f.dataset.start), Number(f.dataset.end)), /^\[@ \w+(: [^\]]+)?\]$/);
  }
});

test('in a sentence, brackets typed go round, so as not to end the field', async () => {
  const { edits, fill } = page('Say [@ what: x] now.\n');
  await fill(0, 'a [b] c');
  assert.deepEqual(lines(edits), ['Say [@ what: a (b) c] now.']);
});

test('the keyboard reaching a blank opens it, and Enter writes it and leaves the keyboard there to open it again', async () => {
  const { fields, edits, press } = page('@ Name: Josh\n\n!REPL:\n');
  const slot = fields[0].querySelector('.field-value');
  slot.focus();
  let input = slot.querySelector('textarea');
  assert.equal(input.getAttribute('aria-label'), 'Name');
  input.value = 'Ann';
  await press(input, 'Enter');
  assert.deepEqual(lines(edits), ['@ Name: Ann']);
  assertElement(slot.ownerDocument.activeElement, slot);
  assert.equal(slot.querySelector('textarea'), null);
  await press(slot, 'Enter');
  input = slot.querySelector('textarea');
  assertElement(slot.ownerDocument.activeElement, input);
  // A term not yet defined is a blank named by the term.
  await press(input, 'Escape');
  const blank = fields[1].querySelector('.field-value');
  blank.focus();
  assert.equal(blank.querySelector('textarea').getAttribute('aria-label'), 'REPL');
});

test('a blank written keeps the keyboard through the render that follows', () => {
  const p = preview();
  p.show(render('@ Name: Josh\n').body);
  p.document.querySelector('.field-value').focus();
  const input = p.document.querySelector('.field-value textarea');
  input.value = 'Ann';
  input.dispatchEvent(new p.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  p.show(render('@ Name: Ann\n').body);
  const slot = p.document.querySelector('.field-value');
  assert.equal(slot.textContent, 'Ann');
  assertElement(p.document.activeElement, slot);
  assert.equal(slot.querySelector('textarea'), null);
});

test('a field\'s choice picks, writing its line; on a slide, none does, by a click or a key', async () => {
  const md = '# One\n\n@ Session: ( ) Sat AM (x) Sat PM\n';
  const p = preview();
  p.show(render(md).body);
  const picks = () => [...p.document.querySelectorAll('.field-choice > input')];
  picks()[0].click();
  await settle();
  assert.deepEqual(p.posted.filter((m) => m.type === 'edit').flatMap((m) => m.edits.map((e) => e.after[0])), ['@ Session: (x) Sat AM ( ) Sat PM']);
  p.show(slides(`${md}\n---\n\n# Next\n`).slides[0].body, { deck: true });
  p.posted.length = 0;
  for (const pick of picks()) {
    pick.focus();
    assertNotElement(p.document.activeElement, pick, 'the keyboard doesn\'t reach it');
    pick.dispatchEvent(new p.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    pick.click();
    pick.closest('label').click();
  }
  await settle();
  assert.deepEqual(p.posted.filter((m) => m.type === 'edit'), []);
  assert.deepEqual(picks().map((x) => x.checked), [false, true]);
});

test('a number field takes only a number, and writes it back as number:', async () => {
  const { fields, edits, open, fill } = page('@ Age {e.g. 12}: number:[]\n@ Score: number:12[a dozen]\n');
  const input = open(0);
  assert.equal(input.inputMode, 'decimal');
  for (const typed of ['1', '12', '12a', '12.']) {
    input.value = typed;
    input.dispatchEvent(new input.ownerDocument.defaultView.Event('input'));
  }
  assert.equal(input.value, '12.');
  input.blur();
  await settle();
  await fill(1, '');
  assert.deepEqual(edits.map((e) => [e.before[0], e.after[0]]), [
    ['@ Age {e.g. 12}: number:[]', '@ Age {e.g. 12}: number:12[]'],
    ['@ Score: number:12[a dozen]', '@ Score: number:[]'],
  ]);
  assert.equal(fields[0].querySelector('.field-value').textContent, '12');
});

test('a number field opens on its number, not what is shown for it, and what is not one is put back', async () => {
  const { edits, open, fill } = page('@ Score: number:12[a dozen]\n');
  assert.equal(open(0).value, '12');
  open(0).blur();
  await settle();
  await fill(0, '-');
  assert.deepEqual(edits, []);
});

test('a date field picks a day into its place on the line, and Tab goes past it', async () => {
  const p = preview();
  p.show(render('@ Name: Josh\n@ When {a Friday}: date:[]\n@ Age: number:[]\n').body);
  const date = p.document.querySelector('.field[data-kind="date"] .date');
  let answered = null;
  p.document.addEventListener('preview:answered', (e) => { answered = e.target; });
  date.click();
  p.document.querySelector('.date-cal-grid button[data-date$="-10"]').click();
  await settle();
  assert.equal(answered, date, 'a day picked says it answered what it is in');
  const [edit] = p.posted.filter((m) => m.type === 'edit').flatMap((m) => m.edits);
  assert.equal(edit.before[0], '@ When {a Friday}: date:[]');
  assert.match(edit.after[0], /^@ When \{a Friday\}: date:\d{4}-\d{2}-10\[\]$/);
  p.document.querySelector('.field').click();
  const input = p.document.querySelector('.field textarea');
  input.dispatchEvent(new p.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
  assert.ok(p.document.querySelector('.field[data-kind="number"] textarea'), 'Tab goes on to the next blank');
});
