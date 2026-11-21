import { readFileSync } from 'node:fs';
import { describe, test, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';

// The "Copy passage" button under the passage (scripture.ejs), handled by SGCopy.copyPassage in
// public/js/copySelection.js. The fixtures are #container as the browser had it after the page's
// scripts ran (per-verse copy buttons added, two-column blocks split), saved from the local app:
//   one-verse      /kjv/john.3.16
//   paragraphs     /niv/john.3.14-17
//   psalm          /nrsv/ps.103.1-5
//   two-sections   /john.3.16;rom.8.28
//   compound       /cev/gen.7.4-14 (verses merged into one line: "5–6")
//   two-columns    /kjv/john.3.1-12 (1280×500 window: a second block with a running head)
const here = new URL('.', import.meta.url);
const read = rel => readFileSync(new URL(rel, here), 'utf8');
const SRC = read('../../public/js/copySelection.js');
const fixture = name => read(`../fixtures/copyPassage/${name}.html`);

// The button as scripture.ejs renders it
const VIEW = read('../../src/presentation/views/scripture.ejs');
const BUTTON = VIEW.match(/<button[^]*?<\/button>/)[0];

function load(name, { clipboard } = {}) {
  const dom = new JSDOM(`<!doctype html><html><body>${fixture(name)}\n${BUTTON}</body></html>`, { runScripts: 'outside-only' });
  const win = dom.window;
  if (clipboard !== undefined) Object.defineProperty(win.navigator, 'clipboard', { value: clipboard, configurable: true });
  // Timers run by hand
  const timers = [];
  win.setTimeout = (fn, ms) => { timers.push({ fn, ms, on: true }); return timers.length; };
  win.clearTimeout = id => { if (timers[id - 1]) timers[id - 1].on = false; };
  win.eval(SRC);
  const run = () => timers.splice(0).forEach(t => t.on && t.fn());
  return { win, doc: win.document, C: win.SGCopy, timers, run, button: win.document.querySelector('button.passage-copy') };
}
const text = name => load(name).C.passageText();

const JOHN3 = [
  'There was a man of the Pharisees, named Nicodemus, a ruler of the Jews:',
  'The same came to Jesus by night, and said unto him, Rabbi, we know that thou art a teacher come from God: for no man can do these miracles that thou doest, except God be with him.',
  'Jesus answered and said unto him, Verily, verily, I say unto thee, Except a man be born again, he cannot see the kingdom of God.',
  'Nicodemus saith unto him, How can a man be born when he is old? can he enter the second time into his mother’s womb, and be born?',
  'Jesus answered, Verily, verily, I say unto thee, Except a man be born of water and of the Spirit, he cannot enter into the kingdom of God.',
  'That which is born of the flesh is flesh; and that which is born of the Spirit is spirit.',
  'Marvel not that I said unto thee, Ye must be born again.',
  'The wind bloweth where it listeth, and thou hearest the sound thereof, but canst not tell whence it cometh, and whither it goeth: so is every one that is born of the Spirit.',
  'Nicodemus answered and said unto him, How can these things be?',
  'Jesus answered and said unto him, Art thou a master of Israel, and knowest not these things?',
  'Verily, verily, I say unto thee, We speak that we do know, and testify that we have seen; and ye receive not our witness.',
  'If I have told you earthly things, and ye believe not, how shall ye believe, if I tell you of heavenly things?',
];

describe('passageText', () => {
  test('one verse: the text and its reference, no verse number', () => {
    expect(text('one-verse')).toBe('For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life. (John 3:16)');
  });

  test('paragraphs stay apart with a blank line; verses in a paragraph run on; the version is named', () => {
    expect(text('paragraphs')).toBe([
      '14 Just as Moses lifted up the snake in the wilderness, so the Son of Man must be lifted up, 15 that everyone who believes may have eternal life in him.”',
      '',
      '16 For God so loved the world that he gave his one and only Son, that whoever believes in him shall not perish but have eternal life. 17 For God did not send his Son into the world to condemn the world, but to save the world through him.',
      '(John 3:14–17, NIV)',
    ].join('\n'));
  });

  test('poetry keeps each line; the number goes on the first line of its verse', () => {
    expect(text('psalm')).toBe([
      '1 §Of David.',
      '',
      'Bless the Lord, O my soul,',
      'and all that is within me,',
      'bless his holy name.',
      '2 Bless the Lord, O my soul,',
      'and do not forget all his benefits—',
      '3 who forgives all your iniquity,',
      'who heals all your diseases,',
      '4 who redeems your life from the Pit,',
      'who crowns you with steadfast love and mercy,',
      '5 who satisfies you with good as long as you live',
      'so that your youth is renewed like the eagle’s.',
      '(Psalms 103:1–5, NRSV)',
    ].join('\n'));
  });

  test('two sections: one block each, with its own reference', () => {
    expect(text('two-sections')).toBe([
      'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life. (John 3:16)',
      '',
      'And we know that all things work together for good to them that love God, to them who are the called according to his purpose. (Romans 8:28)',
    ].join('\n'));
  });

  test('merged verses keep their label ("5–6") and count in the reference', () => {
    expect(text('compound')).toBe([
      '4 Seven days from now I will send rain that will last for forty days and nights, and I will destroy all other living creatures I have made.',
      '',
      '5–6 Noah was six hundred years old when he went into the boat to escape the flood, and he did everything the Lord had told him to do. 7 His wife, his sons, and his daughters-in-law all went inside with him. 8–9 He obeyed God and took a male and a female of each kind of animal and bird into the boat with him. 10 Seven days later a flood began to cover the earth.',
      '',
      '11–12 Noah was six hundred years old when the water under the earth started gushing out everywhere. The sky opened like windows, and rain poured down for forty days and nights. All this began on the seventeenth day of the second month of the year. 13 On that day Noah and his wife went into the boat with their three sons, Shem, Ham, and Japheth, and their wives. 14 They took along every kind of animal, tame and wild, including the birds.',
      '(Genesis 7:4–14, CEV)',
    ].join('\n'));
  });

  test('two columns: one line per verse, across the blocks, without the running heads', () => {
    expect(text('two-columns')).toBe(JOHN3.map((t, i) => `${i + 1} ${t}`).join('\n') + '\n(John 3:1–12)');
  });

  test('with verse numbers shown, they are not copied twice', () => {
    const { doc, C } = load('paragraphs');
    // as main.js setVerseNumbers adds them
    doc.querySelectorAll('.verse').forEach(v => v.insertAdjacentHTML('afterbegin', `<sup class='vnum'>${v.getAttribute('verse_label')} <sup></sup></sup>`));
    expect(C.passageText()).toBe(text('paragraphs'));
  });

  test('a single verse of poetry keeps its lines', () => {
    const { doc, C } = load('psalm');
    doc.querySelectorAll('.verse:not(.v_15552)').forEach(v => v.remove());
    expect(C.passageText()).toBe('Bless the Lord, O my soul,\nand do not forget all his benefits— (Psalms 103:2, NRSV)');
  });

  test('no verses: nothing', () => {
    const { doc, C } = load('one-verse');
    doc.querySelector('.verse').remove();
    expect(C.passageText()).toBe('');
  });
});

describe('the button', () => {
  test('is a real button with an accessible name, the icon and the label', () => {
    const { button } = load('one-verse');
    expect(button.getAttribute('type')).toBe('button');
    expect(button.getAttribute('aria-label')).toBeTruthy();
    expect(button.querySelector('img').getAttribute('src')).toBe('/img/copy.svg');
    expect(button.querySelector('img').getAttribute('alt')).toBe('');
    expect(button.textContent.trim()).toBe('Copy passage');
  });

  test('a click copies the passage, shows "Copied", and goes back after about 2 seconds', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    const { button, timers, run } = load('paragraphs', { clipboard: { writeText } });
    button.click();
    await vi.waitFor(() => expect(button.textContent.trim()).toBe('Copied'));
    expect(writeText).toHaveBeenCalledWith(text('paragraphs'));
    expect(button.querySelector('img').getAttribute('src')).toBe('/img/check.svg');
    expect(button.classList.contains('is-copied')).toBe(true);
    expect(timers.at(-1).ms).toBeGreaterThanOrEqual(1500);
    expect(timers.at(-1).ms).toBeLessThanOrEqual(2500);
    run();
    expect(button.textContent.trim()).toBe('Copy passage');
    expect(button.querySelector('img').getAttribute('src')).toBe('/img/copy.svg');
    expect(button.classList.contains('is-copied')).toBe(false);
  });

  test('a second click before it goes back starts the wait again', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    const { C, button, timers } = load('one-verse', { clipboard: { writeText } });
    await C.copyPassage(button);
    await C.copyPassage(button);
    expect(timers.filter(t => t.on)).toHaveLength(1);
  });

  test('without navigator.clipboard it copies through a hidden textarea and execCommand', async () => {
    const { doc, C, button } = load('one-verse', { clipboard: undefined });
    let copied = null;
    doc.execCommand = vi.fn(cmd => {
      const ta = doc.activeElement;
      copied = cmd === 'copy' && ta && ta.tagName === 'TEXTAREA' ? ta.value : null;
      return true;
    });
    expect(await C.copyPassage(button)).toBe(true);
    expect(copied).toBe(text('one-verse'));
    expect(doc.querySelectorAll('textarea')).toHaveLength(0);
    expect(button.textContent.trim()).toBe('Copied');
  });

  test('when navigator.clipboard refuses, the fallback copies', async () => {
    const writeText = vi.fn(() => Promise.reject(new Error('NotAllowedError')));
    const { doc, C, button } = load('one-verse', { clipboard: { writeText } });
    doc.execCommand = vi.fn(() => true);
    expect(await C.copyPassage(button)).toBe(true);
    expect(writeText).toHaveBeenCalled();
    expect(doc.execCommand).toHaveBeenCalledWith('copy');
    expect(button.textContent.trim()).toBe('Copied');
  });

  test('when both fail it reads "Copy failed", then goes back', async () => {
    const writeText = vi.fn(() => Promise.reject(new Error('NotAllowedError')));
    const { doc, C, button, run } = load('one-verse', { clipboard: { writeText } });
    doc.execCommand = vi.fn(() => { throw new Error('not supported'); });
    expect(await C.copyPassage(button)).toBe(false);
    expect(button.textContent.trim()).toBe('Copy failed');
    expect(button.classList.contains('is-failed')).toBe(true);
    expect(button.querySelector('img').getAttribute('src')).toBe('/img/copy.svg');
    expect(doc.querySelectorAll('textarea')).toHaveLength(0);
    run();
    expect(button.textContent.trim()).toBe('Copy passage');
    expect(button.classList.contains('is-failed')).toBe(false);
  });

  test('the per-verse copy still works next to it', () => {
    const writeText = vi.fn(() => Promise.resolve());
    const { doc, C } = load('compound', { clipboard: { writeText } });
    C.click(doc.querySelector('.v_164 + .copyprose img'), {});
    expect(writeText).toHaveBeenCalledWith('Seven days from now I will send rain that will last for forty days and nights, and I will destroy all other living creatures I have made. (Genesis 7:4, CEV)');
  });
});

describe('the page', () => {
  const layout = read('../../src/presentation/views/layouts/main.ejs');
  const ui = read('../../public/css/ui.css');
  test('the old inline function and styles are gone', () => {
    expect(layout).not.toContain('copyContainerToClipbord');
    expect(layout).not.toContain('containerCopy');
    expect(VIEW).not.toContain('containerCopy');
  });
  test('ui.css styles the button in the interface font, with hover and focus states', () => {
    const at = ui.indexOf('.passage-copy {');
    expect(at).toBeGreaterThan(-1);
    expect(ui.slice(at, ui.indexOf('}', at))).toContain("font-family: 'Roboto Condensed', 'Arial Narrow', sans-serif;");
    expect(ui).toContain('.passage-copy:hover');
    expect(ui).toContain('.passage-copy:focus-visible');
  });
});
