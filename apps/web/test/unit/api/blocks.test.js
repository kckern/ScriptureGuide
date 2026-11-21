import { describe, test, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { buildBlocks, blockPieces } from '../../../src/api/v1/blocks.js';
import { plainText, isFillerText } from '../../../src/domain/rules/legacyText.js';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '../../fixtures/blocks');
const FIXTURES = Object.fromEntries(readdirSync(DIR).filter(f => f.endsWith('.json'))
  .map(f => JSON.parse(readFileSync(join(DIR, f), 'utf8'))).map(fx => [fx.name, fx]));
const blocksOf = name => buildBlocks(FIXTURES[name].rows);

const words = s => s.split(/\s+/).filter(Boolean);
const text = pieces => pieces.flatMap(p => p.runs).map(r => r.text).join('');
// A compact view: type, style, indent and the text of each block (or of each line)
const shape = blocks => blocks.map(b => {
  const out = { type: b.type };
  if ('style' in b) out.style = b.style;
  if (b.indent) out.indent = b.indent;
  if (b.lines) out.lines = b.lines.map(l => [l.indent, text(l.pieces)]);
  else out.text = text(b.pieces);
  return out;
});

// The words plainText gives the rows (the v1 text so far). flattenText keeps { and } (ASCII),
// and drops ~~struck~~ text, which the runs keep as strike.
const expectedWords = rows => rows.flatMap(r => words(plainText(r.text))).map(w => w.replace(/[{}]/g, '')).filter(Boolean);
const lineGroups = blocks => blocks.flatMap(b => (b.lines ? b.lines.map(l => l.pieces) : [b.pieces]));
const runWords = blocks => lineGroups(blocks).flatMap(pieces => words(plainText(text(pieces.map(p => ({ runs: p.runs.filter(r => r.mark !== 'strike') }))))))
  .map(w => w.replace(/[{}]/g, '')).filter(Boolean);
const BLOCK_MARKERS = /[¶§▼►◄↪◤▲‾_/\\|▫]/u;
const MARK_SYMBOLS = /~~|[｟｠〔〕「」《》⦅⦆｢｣{}]/u;
// Fixtures whose text has an unbalanced mark, kept as plain text
const UNBALANCED = new Set(['marks', 'printer']);

describe('buildBlocks: every fixture', () => {
  for (const [name, fx] of Object.entries(FIXTURES)) {
    test(`${name}: no text lost, no markers left, one verse start per verse`, () => {
      const blocks = buildBlocks(fx.rows);
      // Compared without spaces: plainText runs a label into the subtitle after it ("1–)A")
      expect(runWords(blocks).join('')).toBe(expectedWords(fx.rows).join(''));
      for (const run of blocks.flatMap(b => blockPieces(b)).flatMap(p => p.runs)) {
        expect(run.text).not.toMatch(BLOCK_MARKERS);
        if (!UNBALANCED.has(name)) expect(run.text).not.toMatch(MARK_SYMBOLS);
        expect(run.text).not.toBe('');
      }
      const pieces = blocks.flatMap(b => blockPieces(b));
      // A row with no words (filler, or only "¶") has no piece
      const withText = fx.rows.filter(r => !isFillerText(r.text) && plainText(r.text)).map(r => r.verse_id);
      expect(pieces.filter(p => p.start).map(p => p.id)).toEqual(withText);
      // The start piece is each verse's first
      for (const id of withText) expect(pieces.find(p => p.id === id).start).toBe(true);
      // Joined runs read with single spaces, no space at either end
      for (const pieces of lineGroups(blocks)) expect(text(pieces)).toBe(text(pieces).replace(/\s+/g, ' ').trim());
    });
  }
});

describe('buildBlocks: shapes', () => {
  test('WEB John 1:1-9: one paragraph; verses without ¶ continue it', () => {
    const blocks = blocksOf('web-john1');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: 'paragraph', style: null });
    expect(blocks[0].pieces.map(p => [p.verse, p.start])).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9].map(v => [v, true]));
    expect(blocks[0].pieces[0]).toEqual({ id: 26046, verse: 1, start: true, runs: [{ text: 'In the beginning was the Word, and the Word was with God, and the Word was God.' }] });
    // A continuing verse starts with one space
    expect(blocks[0].pieces[1].runs[0].text).toBe(' The same was in the beginning with God.');
  });

  test('WEB Psalm 103:1-5: the superscription (no §) is a paragraph, then poetry with indented lines', () => {
    const blocks = blocksOf('web-ps103');
    expect(shape(blocks)).toEqual([
      { type: 'paragraph', style: null, text: 'By David.' },
      { type: 'poetry', style: null, lines: [
        [0, 'Praise Yahweh, my soul!'], [1, 'All that is within me, praise his holy name!'],
        [0, 'Praise Yahweh, my soul,'], [1, 'and don’t forget all his benefits;'],
        [0, 'who forgives all your sins;'], [1, 'who heals all your diseases;'],
        [0, 'who redeems your life from destruction;'], [1, 'who crowns you with loving kindness and tender mercies;'],
        [0, 'who satisfies your desire with good things,'], [1, 'so that your youth is renewed like the eagle’s.'],
      ] },
    ]);
    expect(blocks[0].pieces[0].start).toBe(true);
    expect(blocks[1].lines[0].pieces[0]).toMatchObject({ id: 15551, verse: 1, start: false });
    expect(blocks[1].lines[2].pieces[0]).toMatchObject({ id: 15552, verse: 2, start: true });
  });

  test('WEB Psalm 1:1-3: a § subtitle with small caps, then poetry', () => {
    const blocks = blocksOf('web-ps1');
    expect(blocks[0]).toEqual({ type: 'subtitle', pieces: [{ id: 13941, verse: 1, start: true, runs: [{ text: 'Book', mark: 'smallcaps' }, { text: ' I' }] }] });
    expect(shape(blocks.slice(1))).toEqual([{ type: 'poetry', style: null, lines: [
      [0, 'Blessed is the man who doesn’t walk in the counsel of the wicked,'], [1, 'nor stand on the path of sinners,'], [1, 'nor sit in the seat of scoffers;'],
      [0, 'but his delight is in Yahweh’s law.'], [1, 'On his law he meditates day and night.'],
      [0, 'He will be like a tree planted by the streams of water,'], [1, 'that produces its fruit in its season,'], [1, 'whose leaf also does not wither.'], [1, 'Whatever he does shall prosper.'],
    ] }]);
  });

  test('WEB Leviticus 10:2-4: ¶▼ and ¶► inside a verse; the next verse continues the prose', () => {
    expect(shape(blocksOf('web-lev10'))).toEqual([
      { type: 'paragraph', style: null, text: 'Fire came out from before Yahweh, and devoured them, and they died before Yahweh.' },
      { type: 'paragraph', style: null, text: 'Then Moses said to Aaron, “This is what Yahweh spoke of, saying,' },
      { type: 'poetry', style: null, lines: [[0, '‘I will show myself holy to those who come near me,'], [1, 'and before all the people I will be glorified.’”']] },
      { type: 'paragraph', style: null, text: 'Aaron held his peace. Moses called Mishael and Elzaphan, the sons of Uzziel the uncle of Aaron, and said to them, “Draw near, carry your brothers from before the sanctuary out of the camp.”' },
    ]);
  });

  test('KJV Psalm 23: a paragraph per verse', () => {
    const blocks = blocksOf('kjv-ps23');
    expect(blocks.map(b => [b.type, b.pieces.map(p => p.verse)])).toEqual([1, 2, 3, 4, 5, 6].map(v => ['paragraph', [v]]));
  });

  test('1830 1 Nephi 1:1-2: small caps', () => {
    const [block] = blocksOf('1830-1ne1');
    expect(block.pieces[0].runs.slice(0, 2)).toEqual([{ text: 'I, Nephi', mark: 'smallcaps' }, { text: ', having been born of goodly parents, therefore I was taught somewhat in all the learning of my father; and having seen many afflictions in the course of my days—nevertheless, having been highly favored of the Lord in all my days; yea, having had a great knowledge of the goodness and the mysteries of God, therefore I make a record of my proceedings in my days;' }]);
    expect(block.pieces[1].runs).toEqual([{ text: ' yea, I make a record in the language of my father, which consists of the learning of the Jews and the language of the Egyptians.' }]);
  });

  test('1835: / in prose starts a line-break paragraph, /_ an indented one', () => {
    const blocks = shape(blocksOf('1835-lines'));
    expect(blocks[1]).toEqual({ type: 'paragraph', style: null, text: 'The twelve counsellors then proceeded to cast lots, or ballot, to ascertain who should speak first, and the following was the result; namely:— Oliver Cowdery, No. 1' });
    expect(blocks[2]).toEqual({ type: 'paragraph', style: 'linebreak', indent: 1, text: 'John Johnson' });
    expect(blocks.slice(-4)).toEqual([
      { type: 'paragraph', style: 'linebreak', text: 'After prayer the conference adjourned.' },
      { type: 'paragraph', style: 'linebreak', text: 'Oliver Cowdery,' },
      { type: 'paragraph', style: 'linebreak', text: 'Orson Hyde,' },
      { type: 'paragraph', style: 'linebreak', text: 'Clerks.' },
    ]);
  });

  test('flush: §¶◄ and ¶◄ start flush paragraphs; ¶▼◄ in a prose verse is a flush paragraph (as on the site)', () => {
    expect(shape(blocksOf('flush'))).toEqual([
      { type: 'paragraph', style: 'flush', text: 'The river ran past the mill, and the miller watched it. He counted the boats as they went by.' },
      { type: 'paragraph', style: 'flush', text: 'In the spring the water rose over the bank. And the miller said:' },
      { type: 'paragraph', style: 'flush', text: 'Thus saith the river: I will turn the wheel.' },
    ]);
  });

  test('indent: ¶↪ and the indent format are indent paragraphs; prose after them is a new paragraph', () => {
    const blocks = blocksOf('indent');
    expect(shape(blocks)).toEqual([
      { type: 'paragraph', style: null, text: 'Yea, the miller said:' },
      { type: 'paragraph', style: 'indent', text: 'Hear me, for the wheel is old and the stones are worn.' },
      { type: 'paragraph', style: null, text: 'The grain will not keep through the winter.' },
      { type: 'paragraph', style: 'indent', text: 'A letter came to the miller from the town. It asked for flour before the frost.' },
      { type: 'paragraph', style: null, text: 'And the miller answered the letter.' },
    ]);
    expect(blocks[3].pieces[1].runs).toEqual([{ text: ' ' }, { text: 'It asked for flour before the frost.', mark: 'em' }]);
  });

  test('nogap: ‾¶ is a prose no-gap paragraph, in a poetry verse too (as on the site)', () => {
    expect(shape(blocksOf('nogap'))).toEqual([
      { type: 'paragraph', style: null, text: 'The road went up the hill.' },
      { type: 'paragraph', style: 'nogap', text: 'At the top there was a gate.' },
      { type: 'paragraph', style: 'nogap', text: 'Open the gate,' },
      { type: 'paragraph', style: 'linebreak', text: 'I said to the keeper,' },
      { type: 'paragraph', style: 'linebreak', text: 'let the cart go through.' },
    ]);
  });

  test('linebreak: ¶◤ paragraphs, _ indents, a / at a verse end breaks before the next verse', () => {
    expect(shape(blocksOf('linebreak'))).toEqual([
      { type: 'paragraph', style: 'linebreak', indent: 1, text: 'And the keeper said unto him:' },
      { type: 'poetry', style: null, lines: [[0, 'Will ye pay me'], [0, 'That the gate may open'], [0, 'And the cart go by?']] },
      { type: 'paragraph', style: 'linebreak', indent: 1, text: 'And he paid the keeper.' },
      { type: 'poetry', style: null, lines: [[1, 'The cart went on over the hill'], [0, 'Down into the valley.'], [0, 'And the sun went down.']] },
    ]);
  });

  test('notes: ｢n｣ marks are dropped; bold and sans; nested bold takes the outer mark', () => {
    const [block] = blocksOf('notes');
    expect(block.style).toBe('flush');
    expect(block.pieces.flatMap(p => p.runs)).toEqual([
      { text: 'The baker ' }, { text: 'Tomas', mark: 'sans' }, { text: ' rose early and lit the oven.' },
      { text: ' He said, ' }, { text: 'Bread for the town before the sun', mark: 'strong' }, { text: '.' },
    ]);
  });

  test('marks: small, em, nested small caps inside small, an unbalanced mark kept as text', () => {
    const [block] = blocksOf('marks');
    expect(block.pieces.flatMap(p => p.runs)).toEqual([
      { text: 'The ' }, { text: 'Keeper', mark: 'small' }, { text: ' of the bridge said, ' }, { text: 'Pass over.', mark: 'em' },
      { text: ' And they passed {over the bridge.)' },
    ]);
  });

  test("printer's manuscript: struck text, line ends as spaces, insertions as sup", () => {
    const blocks = blocksOf('printer');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].pieces[0].runs.slice(0, 4)).toEqual([{ text: 'I the miller haveing ' }, { text: 'bin', mark: 'strike' }, { text: ' been born by the river therefore I learned some what of the wheel & the ' }, { text: 'grinding of the', mark: 'sup' }]);
    expect(blocks[0].pieces[2].runs).toEqual([{ text: ' & when I had ' }, { text: 'said', mark: 'strike' }, { text: ' ' }, { text: 'spake', mark: 'sup' }, { text: ' these words~~ I went' }]);
  });

  test('earliest: sense lines; ¶ starts a new sense block', () => {
    expect(shape(blocksOf('earliest'))).toEqual([
      { type: 'sense', style: null, lines: [
        [0, 'I the miller having been born by the river,'], [0, 'therefore I learned somewhat of the wheel.'], [0, 'And having seen many floods in my days,'], [0, 'I make a record of the mill.'],
        [0, 'Yea, I make a record in the words of my father.'],
      ] },
      { type: 'sense', style: null, lines: [[0, 'For it came to pass in the first year'], [0, 'of the new wheel'], [0, '—my father having kept the mill all his days—'], [0, 'that the river rose.']] },
    ]);
  });

  test('compound: "*" and filler rows add nothing', () => {
    expect(blocksOf('compound').map(b => b.pieces.map(p => p.verse))).toEqual([[1], [3, 5]]);
  });

  test('heads: a label before §, a subtitle, §¶ and ▲¶ start new stanzas', () => {
    expect(shape(blocksOf('heads'))).toEqual([
      { type: 'paragraph', style: null, text: 'Part Two(Songs 1–3)' },
      { type: 'subtitle', text: 'A song of the mill.' },
      { type: 'poetry', style: null, lines: [[0, 'The wheel turns,'], [1, 'the water falls.'], [0, 'The stones grind.']] },
      { type: 'poetry', style: null, lines: [[0, 'Then the miller rested.']] },
      { type: 'poetry', style: null, lines: [[0, 'See, the miller comes,'], [0, 'his cart behind him.']] },
      { type: 'subtitle', text: 'Songs 4–6' },
      { type: 'subtitle', text: 'A song of the river.' },
      { type: 'poetry', style: null, lines: [[0, 'The river runs,'], [1, 'and runs on.']] },
    ]);
  });

  test('a mark across lines is closed and opened again on each line', () => {
    const last = blocksOf('heads').at(-1);
    expect(last.lines.map(l => l.pieces[0].runs)).toEqual([
      [{ text: 'The river ' }, { text: 'runs,', mark: 'em' }],
      [{ text: 'and runs', mark: 'em' }, { text: ' on.' }],
    ]);
  });

  test('WEB Song of Songs 1:4-5: a ► outside a ¶ marker switches to prose, as ¶► does', () => {
    expect(shape(blocksOf('web-song1'))).toEqual([
      { type: 'poetry', style: null, lines: [[0, 'Take me away with you.'], [1, 'Let us hurry.'], [1, 'The king has brought me into his rooms.']] },
      { type: 'paragraph', style: null, text: 'Friends' },
      { type: 'poetry', style: null, lines: [[0, 'We will be glad and rejoice in you.'], [1, 'We will praise your love more than wine!']] },
      { type: 'paragraph', style: null, text: 'Beloved' },
      { type: 'paragraph', style: null, text: 'They are right to love you.' },
      { type: 'poetry', style: null, lines: [[0, 'I am dark, but lovely,'], [1, 'you daughters of Jerusalem,'], [1, 'like Kedar’s tents,'], [1, 'like Solomon’s curtains.']] },
    ]);
  });

  test('no rows, no blocks', () => expect(buildBlocks([])).toEqual([]));
});
