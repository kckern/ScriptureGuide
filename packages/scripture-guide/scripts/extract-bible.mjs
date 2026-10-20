import scriptdata from '../data/scriptdata.mjs';
import yaml from 'js-yaml';
import { writeFileSync, mkdirSync } from 'fs';

// Bible books are the first 66 in scriptdata
const BIBLE_BOOK_COUNT = 66;

const bookNames = Object.keys(scriptdata);
const books = [];
let verseId = 1;

for (let i = 0; i < BIBLE_BOOK_COUNT; i++) {
  const bookName = bookNames[i];
  const chapters = scriptdata[bookName]; // Array of verse counts per chapter
  const key = bookName.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/_$/, '');

  const firstVerseId = verseId;

  // Calculate total verses in this book
  const totalVerses = chapters.reduce((sum, v) => sum + v, 0);

  books.push({
    key: key,
    order: i + 1,
    chapters: chapters.length,
    verses: chapters, // Array of verse counts per chapter
    first_verse_id: firstVerseId
  });

  verseId += totalVerses;
}

const structure = {
  canon: 'bible',
  name: 'Holy Bible (KJV)',
  description: 'King James Version - 66 books, Genesis through Revelation',
  id_format: 'integer',
  id_start: 1,
  id_end: verseId - 1,
  books: books
};

mkdirSync('data/canons/bible', { recursive: true });
writeFileSync('data/canons/bible/_bible.yml', yaml.dump(structure, { lineWidth: 200, noRefs: true }));
console.log('Created data/canons/bible/_bible.yml');
console.log('Total verses:', verseId - 1);
