import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { app, globals, assertNotElement } from './dom.js';

// The mode a file opens in, by its `type:` (#57): a workbook in Work, slides
// in Edit, a document in whichever was last chosen.

mock.timers.enable({ apis: ['setTimeout'] });

const { document } = globals(app());
const TEXT = {
  'journal.md': readFileSync(new URL('./fixtures/journal.md', import.meta.url), 'utf8'),
  'talk.md': '---\ntype: slides\n---\n\n# One\n\n---\n\n# Two\n',
  'notes.md': '# Notes\n\n<!-- a note -->\n\n---\n\n# More\n',
};
globalThis.fetch = async (url) => {
  const ask = String(url);
  const file = decodeURIComponent(/path=([^&]*)/.exec(ask)?.[1] ?? '');
  const out = ask.startsWith('/api/info') ? { name: 'notes', root: '/notes' }
    : ask.startsWith('/api/tree') ? { files: Object.keys(TEXT).map((path) => ({ path, type: 'md', mtime: 1 })) }
    : ask.startsWith('/api/render') ? { css: '', body: '<div class="gm-doc"><p>A</p></div>', title: 'A', deck: false }
    : { text: TEXT[file] ?? '# A\n', mtime: 1 };
  return { ok: true, json: async () => out };
};

const { el, state, remembered } = await import('../static/app/state.js');
Object.defineProperty(el.preview, 'contentWindow', { value: { postMessage() {} } });
await import('../static/app/main.js');
const { open } = await import('../static/app/files.js');
const settled = () => new Promise(setImmediate);
await settled();

const working = () => {
  assert.equal(el.split.classList.contains('work-mode'), state.working);
  return state.working;
};

test('the daily journal, a workbook, opens in Work without that being remembered as chosen', async () => {
  await open('notes.md');
  assert.equal(working(), false);
  await open('journal.md');
  assert.equal(working(), true);
  assert.notEqual(remembered('reader:mode'), 'work');
  // A document after it is back in the mode last chosen.
  await open('notes.md');
  assert.equal(working(), false);
});

test('slides open in Edit, to write, and a document in Work once Work was chosen', async () => {
  el.workBtn.click();
  assert.equal(remembered('reader:mode'), 'work');
  await open('talk.md');
  assert.equal(working(), false);
  assert.equal(el.editor.readOnly, false);
  await open('notes.md');
  assert.equal(working(), true);
});

test('a file whose type leaves Work doesn\'t take the keyboard into the editor', async () => {
  assert.equal(working(), true);
  el.filter.focus();
  await open('talk.md');
  assert.equal(working(), false);
  assertNotElement(document.activeElement, el.editor, 'the editor took the keyboard');
});
