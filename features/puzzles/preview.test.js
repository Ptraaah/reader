import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render } from '../../src/render.js';
import { preview, assertElement } from '../../test/dom.js';

const SUDOKU = `\`\`\`sudoku
5 3 . | . 7 . | . . .
6 . . | 1 9 5 | . . .
. 9 8 | . . . | . 6 .
8 . . | . 6 . | . . 3
4 . . | 8 . 3 | . . 1
7 . . | . 2 . | . . 6
. 6 . | . . . | 2 8 .
. . . | 4 1 9 | . . 5
. . . | . 8 . | . 7 9
\`\`\`
`;

/** The preview frame showing `markdown`'s puzzle: `press(key)` presses it there. */
function playing(markdown) {
  const p = preview();
  p.show(render(markdown).body);
  const host = p.document.querySelector('.puzzle');
  const press = (key, opts = {}) => {
    const e = new p.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts });
    (p.document.activeElement ?? host).dispatchEvent(e);
    return e;
  };
  const said = () => p.document.querySelector('html > .vh')?.textContent.trim() ?? '';
  return { ...p, host, press, said };
}

test('a puzzle is an application named by its kind, and its board is named too', () => {
  const { host } = playing(SUDOKU);
  assert.equal(host.getAttribute('role'), 'application');
  assert.equal(host.getAttribute('aria-label'), 'Sudoku');
  const board = host.querySelector('.sudoku-grid');
  assert.equal(board.getAttribute('role'), 'img');
  assert.equal(board.getAttribute('aria-label'), 'Sudoku board');
});

test('a key a puzzle takes says where it left it, and nothing is said while it isn\'t played', () => {
  const { host, press, said } = playing(SUDOKU);
  assert.equal(said(), '');
  host.focus();
  press('ArrowRight');
  assert.equal(said(), 'Row 1, column 4: empty');
  press('6', { code: 'Digit6' });
  assert.equal(said(), 'Row 1, column 4: 6');
  press('7', { code: 'Digit7' });
  assert.equal(said(), 'Row 1, column 4: 7, repeated');
  press('ArrowLeft');
  press('ArrowLeft');
  assert.equal(said(), 'Row 1, column 2: 3, given');
});

/** Puzzles say how they stand after where a key left them: the first part is checked. */
const saysFirst = (said, where) => assert.equal(said().slice(0, where.length), where);

test('train tracks say which square a key left them on, and the track in it', () => {
  const { host, press, said } = playing(`\`\`\`tracks
1 1 3
━ · ·  3
· · ·  1
· · ·  1
A: left 1  B: bottom 3
\`\`\`
`);
  host.focus();
  press('ArrowRight');
  saysFirst(said, 'Row 1, column 2: empty');
  press('ArrowLeft');
  saysFirst(said, 'Row 1, column 1: track right to left, given');
  press('ArrowDown');
  saysFirst(said, 'Row 2, column 1: empty');
});

test('a maze says which ways are open where a key left it', () => {
  // A fork near S: an arrow runs along the corridor only as far as the next turn-off.
  const { host, press, said } = playing(`\`\`\`maze
+--+--+--+
|S       |
+  +  +  +
|       E|
+--+--+--+
\`\`\`
`);
  host.focus();
  press('ArrowRight');
  saysFirst(said, 'Open down, left, right');
});

test('a maze counts one step as a step', () => {
  const { host, press, document } = playing(`\`\`\`maze
+--+--+--+
|S       |
+  +  +  +
|       E|
+--+--+--+
\`\`\`
`);
  host.focus();
  press('ArrowRight');
  assert.match(document.querySelector('.puzzle-bar').textContent, /^1 step · /);
});

test('a word search says which letter a key left it on, and where a word being circled starts', () => {
  const { host, press, said } = playing(`\`\`\`wordsearch
B E L I E V E
H O N E S T Q
A B L E X Y Z
words: ABLE, BELIEVE, HONEST, ZEST
\`\`\`
`);
  host.focus();
  press('ArrowRight');
  saysFirst(said, 'Row 1, column 2: E');
  press('ArrowLeft');
  press('ArrowDown');
  saysFirst(said, 'Row 2, column 1: H');
  press('Enter');
  press('ArrowRight');
  saysFirst(said, 'Row 2, column 2: O, from row 2, column 1');
});

test('a coordinate graph says which point a key left the pencil at', () => {
  const { host, press, said } = playing(`\`\`\`coord
grid: 10 x 8
(1, 1) (5, 1) (5, 4)
(7, 2) (9, 2)
\`\`\`
`);
  host.focus();
  press('ArrowRight');
  saysFirst(said, 'At (1, 0)');
  press('ArrowUp');
  saysFirst(said, 'At (1, 1)');
});

test('Esc hands the keys back but keeps the puzzle in focus, and Enter takes them again', () => {
  const { document, host, press, said } = playing(SUDOKU);
  host.focus();
  assert.ok(press('Escape').defaultPrevented);
  assertElement(document.activeElement, host);
  assert.equal(said(), 'Keys handed back. Enter to play');
  // The page has them now: an arrow isn't the puzzle's, nor another Esc.
  assert.ok(!press('ArrowRight').defaultPrevented);
  assert.ok(!press('Escape').defaultPrevented);
  assert.ok(press('Enter').defaultPrevented);
  assert.ok(press('ArrowRight').defaultPrevented);
  assert.equal(said(), 'Row 1, column 4: empty');
});
