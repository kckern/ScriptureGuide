import scriptdata from '../data/scriptdata.mjs';
import yaml from 'js-yaml';
import { writeFileSync, mkdirSync } from 'fs';

// Bible books are the first 66 in scriptdata
const BIBLE_BOOK_COUNT = 66;

// LDS-specific books: Book of Mormon (1 Nephi through Moroni), D&C, Pearl of Great Price
// These are books 67 onward up to but not including JST and Apocrypha
const LDS_BOOKS = [
  '1 Nephi', '2 Nephi', 'Jacob', 'Enos', 'Jarom', 'Omni', 'Words of Mormon',
  'Mosiah', 'Alma', 'Helaman', '3 Nephi', '4 Nephi', 'Mormon', 'Ether', 'Moroni',
  'Doctrine and Covenants', 'Moses', 'Abraham',
  'Joseph Smith—Matthew', 'Joseph Smith—History', 'Articles of Faith'
];

const bookNames = Object.keys(scriptdata);
const books = [];

// First, calculate where Bible ends (verse ID after Bible)
let verseId = 1;
for (let i = 0; i < BIBLE_BOOK_COUNT; i++) {
  const chapters = scriptdata[bookNames[i]];
  const totalVerses = chapters.reduce((sum, v) => sum + v, 0);
  verseId += totalVerses;
}

const ldsStartId = verseId;
console.log('LDS books start at verse ID:', ldsStartId);

// Now process LDS books
let order = BIBLE_BOOK_COUNT + 1;
for (const bookName of LDS_BOOKS) {
  const chapters = scriptdata[bookName];
  if (!chapters) {
    console.log(`Warning: Book "${bookName}" not found in scriptdata`);
    continue;
  }

  const key = bookName.toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

  const firstVerseId = verseId;
  const totalVerses = chapters.reduce((sum, v) => sum + v, 0);

  books.push({
    key: key,
    order: order,
    chapters: chapters.length,
    verses: chapters,
    first_verse_id: firstVerseId
  });

  verseId += totalVerses;
  order++;
}

const structure = {
  canon: 'lds',
  name: 'LDS Restoration Scripture',
  description: 'Book of Mormon, Doctrine and Covenants, Pearl of Great Price',
  extends: 'bible',
  id_format: 'integer',
  id_start: ldsStartId,
  id_end: verseId - 1,
  books: books
};

mkdirSync('data/canons/lds', { recursive: true });
writeFileSync('data/canons/lds/_lds.yml', yaml.dump(structure, { lineWidth: 200, noRefs: true }));
console.log('Created data/canons/lds/_lds.yml with ' + books.length + ' books');
console.log('LDS verse ID range:', ldsStartId, '-', verseId - 1);
