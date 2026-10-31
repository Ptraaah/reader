import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app, globals, assertElement } from './dom.js';

const { document } = globals(app());
const { el, remembered, remember } = await import('../static/app/state.js');
const { toggleSidebar, toggleDrawer, toggleHelp, wireDrawer, restoreLayout } = await import('../static/app/modes.js');
wireDrawer();

test('☰ says whether the file list is showing', () => {
  assert.equal(el.sidebarToggle.getAttribute('aria-expanded'), 'true');
  toggleSidebar();
  assert.equal(el.sidebarToggle.getAttribute('aria-expanded'), 'false');
  toggleSidebar();
  assert.equal(el.sidebarToggle.getAttribute('aria-expanded'), 'true');
});

test('hiding the list with the keyboard in it leaves the keyboard on ☰', () => {
  el.filter.focus();
  toggleSidebar(true);
  assertElement(document.activeElement, el.sidebarToggle);
  toggleSidebar(false);
});

test('the list over the panes closes once Tab leaves it, not as it moves within it', async () => {
  const settled = () => new Promise((r) => setTimeout(r, 5));
  toggleDrawer(true);
  el.newBtn.focus();
  await settled();
  assert.equal(el.split.classList.contains('list-open'), true);
  el.helpToggle.focus();
  await settled();
  assert.equal(el.split.classList.contains('list-open'), false);
});

test('what a control is called is said in words, not by a mark', () => {
  const name = (node) => node.getAttribute('aria-label') || node.textContent.trim();
  assert.equal(name(el.gutterToggle), 'Line numbers');
  assert.equal(name(el.sidebar), 'Files');
  assert.equal(name(el.newName), 'New file\'s name');
  assert.equal(name(el.editor), 'Editor');
  assert.equal(el.dirtyDot.querySelector(':not([aria-hidden])').textContent, 'Not saved');
});

test('Formatting says whether the help is showing', () => {
  assert.equal(el.helpToggle.getAttribute('aria-expanded'), 'false');
  toggleHelp();
  assert.equal(el.help.hidden, false);
  assert.equal(el.helpToggle.getAttribute('aria-expanded'), 'true');
  toggleHelp();
  assert.equal(el.help.hidden, true);
  assert.equal(el.helpToggle.getAttribute('aria-expanded'), 'false');
});

test('the layout is remembered, and put back as the app opens', () => {
  toggleSidebar(true);
  assert.equal(remembered('reader:sidebar'), 'hidden');
  toggleSidebar(false);
  remember('reader:sidebar', 'hidden');
  remember('reader:help', 'shown');
  restoreLayout();
  assert.equal(el.split.classList.contains('no-sidebar'), true);
  assert.equal(el.help.hidden, false);
  toggleSidebar(false);
  toggleHelp(false);
  localStorage.clear();
});

test('without storage, nothing is remembered and nothing breaks', () => {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { get() { throw new Error('no storage here'); }, configurable: true });
  try {
    remember('reader:sidebar', 'hidden');
    assert.equal(remembered('reader:sidebar'), null);
    restoreLayout();
    toggleSidebar(true);
    toggleSidebar(false);
  } finally {
    Object.defineProperty(globalThis, 'localStorage', had);
  }
});
