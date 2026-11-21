#!/usr/bin/env node
// Writes test/fixtures/blocks/*.json: stored verse rows for the structured-blocks tests
// (src/api/v1/blocks.js). Uses the app's MySQL settings (MYSQL_* env, src/config), for
// example the local sg-full copy:
//   MYSQL_HOST=127.0.0.1 MYSQL_PORT=3310 MYSQL_DATABASE=sgfull MYSQL_USER=root \
//   MYSQL_PASSWORD=… node scripts/blocks-fixtures.mjs
//
// The fixtures are committed to a public repo, so rows read from the database come only from
// the public versions (data/seeds/manifest.json publicVersions). Markers that only licensed
// versions use (¶◄, ¶↪, ‾¶, ¶◤, ｢n｣, 「」, 〔〕, {}, ⦅⦆, the printer's manuscript, the Earliest
// Text's sense lines, 2HRBOM's compound rows) get hand-made rows below: the markers are laid out
// as those versions lay them out, around invented text.
import { mkdir, writeFile, readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '../test/fixtures/blocks');
const MANIFEST = join(here, '../../../data/seeds/manifest.json');

// name → [version, first verse id, last verse id, what it shows]
const FROM_DATABASE = {
  'web-john1': ['WEB', 26046, 26054, 'John 1:1-9: §¶ section start, then verses that continue one paragraph'],
  'web-ps103': ['WEB', 15551, 15555, 'Psalm 103:1-5: a superscription without §, ¶▼ poetry, /_ indented lines'],
  'web-ps1': ['WEB', 13941, 13943, 'Psalm 1:1-3: a § subtitle with ｟｠ small caps, then poetry'],
  'web-lev10': ['WEB', 2980, 2982, 'Leviticus 10:2-4: ¶▼ poetry and ¶► prose again inside one verse'],
  'kjv-ps23': ['KJV', 14237, 14242, 'Psalm 23: one ¶ paragraph per verse'],
  '1830-1ne1': ['1830', 31103, 31104, '1 Nephi 1:1-2: §¶ and ｟｠ small caps'],
  '1835-lines': ['1835', 90888, 90889, 'D&C 1835 section 5: / and /_ line breaks in prose, | as a space'],
};

// Hand-made rows: invented text, real marker layouts. verse_id and verse are made up too.
const row = (verse_id, verse, text, format = 'prose', p = '', s = '') => ({ verse_id, version: 'HANDMADE', chapter: 1, verse, book_title: 'Handmade', text, format, p, s });
const HAND_MADE = {
  'flush': ['Like KRSEB, SEBOM, REBOM: §¶◄ and ¶◄ flush paragraphs, ¶▼◄ flush poetry', [
    row(1, 1, '§¶◄The river ran past the mill, and the miller watched it.', 'prose', '¶', '§'),
    row(2, 2, 'He counted the boats as they went by.'),
    row(3, 3, '¶◄In the spring the water rose over the bank.', 'prose', '¶'),
    row(4, 4, '¶▼◄Sing of the river,/_sing of the mill.', 'prose', '¶'),
  ]],
  'indent': ['Like REBOM and ABWRKS: ¶↪ an indented block after a lead-in, and the indent format', [
    row(1, 1, 'Yea, the miller said:¶↪Hear me, for the wheel is old and the stones are worn.', 'prose', '¶'),
    row(2, 2, 'The grain will not keep through the winter.', 'prose'),
    row(3, 3, '¶〔A letter came to the miller from the town.〕', 'indent', '¶'),
    row(4, 4, '〔It asked for flour before the frost.〕', 'indent'),
    row(5, 5, '¶And the miller answered the letter.', 'prose', '¶'),
  ]],
  'nogap': ['Like ANCHOR and ABWRKS: ‾¶ no-gap paragraphs, in prose and in a poetry verse', [
    row(1, 1, '¶The road went up the hill.', 'prose', '¶'),
    row(2, 2, '‾¶At the top there was a gate.', 'prose', '¶'),
    row(3, 3, '‾¶Open the gate,/I said to the keeper,/let the cart go through.', 'poetry', '¶'),
  ]],
  'linebreak': ['Like ABWRKS: ¶◤ line-break paragraphs, _ after the marker, ¶▼ inside the verse, / at a verse end and \\', [
    row(1, 1, '¶◤_And the keeper said unto him: ¶▼Will ye pay me /That the gate may open /And the cart go by?', 'prose', '¶'),
    row(2, 2, '¶◤_And he paid the keeper.', 'prose', '¶'),
    row(3, 3, '¶_The cart went on over the hill /', 'poetry', '¶'),
    row(4, 4, 'Down into the valley. / \\And the sun went down.', 'poetry'),
  ]],
  'notes': ['Like SEBOM and KRSEB: ｢n｣ note marks, 「」 bold, ⦅⦆ names, nested marks', [
    row(1, 1, '§¶◄The baker ⦅Tomas｢12｣⦆ rose early｢13｣ and lit the oven.', 'prose', '¶', '§'),
    row(2, 2, 'He said, 「Bread for 「⦅the town⦆」 before the sun」.｢14｣', 'prose'),
  ]],
  'marks': ['Like NWT84, ABWRKS: {} small, 〔〕 italic, nested {｟｠}, an unbalanced mark', [
    row(1, 1, '¶The {｟Keeper｠} of the bridge said, 〔Pass over.〕', 'prose', '¶'),
    row(2, 2, 'And they passed {over the bridge.)', 'prose'),
  ]],
  'printer': ["Like the printer's manuscript: ~~struck~~ text, || line ends, 《》 insertions", [
    row(1, 1, 'I the miller haveing ~~bin~~||been born by the river therefore I learned some||what of the wheel & the 《grinding of the》 stones in my||days ', 'prose'),
    row(2, 2, 'yea||I kept the mill ~~of~~ or ~~《the》~~ the 《old》 mill of my father ', 'prose'),
    row(3, 3, '& when I had||~~said~~ 《spake》 these words~~ I went', 'prose'),
  ]],
  'earliest': ['Like the Earliest Text: sense lines, §¶ and ¶ starting sense blocks', [
    row(1, 1, '§¶I the miller having been born by the river,/therefore I learned somewhat of the wheel./And having seen many floods in my days,/I make a record of the mill.', 'sense', '¶', '§'),
    row(2, 2, '/Yea, I make a record in the words of my father.', 'sense'),
    row(3, 3, '¶For it came to pass in the first year/of the new wheel/—my father having kept the mill all his days—/that the river rose.', 'sense', '¶'),
  ]],
  'compound': ['Like 2HRBOM: verses merged into the one before ("*" rows) and an all-filler row', [
    row(1, 1, '¶The farmers came to the mill with their grain and waited for the flour.', 'prose', '¶'),
    row(2, 2, '*'),
    row(3, 3, '¶They paid the miller and went home.', 'prose', '¶'),
    row(4, 4, ' / '),
    row(5, 5, 'The road was long.', 'prose'),
  ]],
  'heads': ['Like NRSV and ANCHOR: a label before §, ▲ verse heads, §¶ mid-verse', [
    row(1, 1, '｟Part｠ ｟Two｠(Songs 1–3)§A song of the mill.¶▼The wheel turns,/_the water falls.', 'prose', '¶', '§'),
    row(2, 2, '/The stones grind§¶▲Then the miller rested.', 'poetry', '¶', '§'),
  ]],
};

async function fromDatabase() {
  const { default: db, closePool } = await import('../src/data/db/connection.js');
  const { publicVersions } = JSON.parse(await readFile(MANIFEST, 'utf8'));
  const out = {};
  try {
    for (const [name, [version, first, last, about]] of Object.entries(FROM_DATABASE)) {
      if (!publicVersions.includes(version)) throw new Error(`${name}: ${version} is not a public version`);
      const rows = await db.query(
        `SELECT s.verse_id, s.version, v.chapter, v.verse, b.book_title, s.text, s.format, s.p, s.s
         FROM scripture_verses s JOIN lds_scriptures_verses v ON v.verse_id = s.verse_id
         JOIN lds_scriptures_books b ON b.book_id = v.book_id
         WHERE s.version = ? AND s.verse_id BETWEEN ? AND ? ORDER BY s.verse_id`,
        [version, first, last]
      );
      if (!rows.length) throw new Error(`${name}: no rows`);
      out[name] = { name, about, version, source: 'sg-full', rows: rows.map(r => ({ ...r })) };
    }
  } finally {
    await closePool();
  }
  return out;
}

const cases = await fromDatabase();
for (const [name, [about, rows]] of Object.entries(HAND_MADE)) {
  cases[name] = { name, about, version: 'HANDMADE', source: 'hand-made', rows };
}
await mkdir(OUT, { recursive: true });
for (const [name, data] of Object.entries(cases)) {
  await writeFile(join(OUT, `${name}.json`), JSON.stringify(data, null, 1) + '\n');
}
console.log(`Wrote ${Object.keys(cases).length} fixtures to ${OUT}`);
