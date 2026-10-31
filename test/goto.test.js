import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app, globals, assertElement } from './dom.js';

const window = globals(app());
const { document } = window;
const { el, state } = await import('../static/app/state.js');
const { wireGoTo, openGoTo } = await import('../static/app/goto.js');
wireGoTo();
state.current = { path: 'a.md', type: 'md' };
el.editor.disabled = false;
el.editor.value = '# One\n\ntext\n\n## Two\n\n## Three\n';

const press = (key) => el.gotoInput.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }));
const type = (text) => {
  el.gotoInput.value = text;
  el.gotoInput.dispatchEvent(new window.Event('input'));
};

test('Go to is a dialog of a box that suggests places from a list', () => {
  assert.equal(el.goto.getAttribute('role'), 'dialog');
  assert.equal(el.gotoInput.getAttribute('role'), 'combobox');
  assert.equal(el.gotoList.getAttribute('role'), 'listbox');
  assert.equal(el.gotoInput.getAttribute('aria-controls'), 'gotoList');
});

test('the place chosen is the box\'s active one, and moves with the arrows', () => {
  openGoTo();
  assertElement(document.activeElement, el.gotoInput);
  assert.equal(el.gotoInput.getAttribute('aria-expanded'), 'true');
  const options = () => [...el.gotoList.querySelectorAll('[role=option]')];
  assert.deepEqual(options().map((o) => o.textContent), ['One', 'Two', 'Three'].map((t, i) => `${t}line ${[1, 5, 7][i]}`));
  const active = () => document.getElementById(el.gotoInput.getAttribute('aria-activedescendant'));
  assert.equal(active(), options()[0]);
  press('ArrowDown');
  assert.equal(active(), options()[1]);
  assert.deepEqual(options().map((o) => o.getAttribute('aria-selected')), ['false', 'true', 'false']);
});

test('with nothing to choose, nothing is active', () => {
  type('nowhere');
  assert.equal(el.gotoInput.hasAttribute('aria-activedescendant'), false);
  assert.equal(el.gotoList.querySelector('.none').getAttribute('aria-disabled'), 'true');
  press('Escape');
  assert.equal(el.goto.hidden, true);
  assert.equal(el.gotoInput.getAttribute('aria-expanded'), 'false');
});
