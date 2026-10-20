// scripts/migrate-to-yaml.mjs
/**
 * Migrate existing scriptdata.mjs to YAML structure
 * Run: node scripts/migrate-to-yaml.mjs
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';

// Import existing data
import scriptdata from '../data/scriptdata.mjs';

const DATA_DIR = 'data';

// Bible books are the first 66 in scriptdata
const BIBLE_BOOK_COUNT = 66;

// LDS-specific books: Book of Mormon (1 Nephi through Moroni), D&C, Pearl of Great Price
const LDS_BOOKS = [
  '1 Nephi', '2 Nephi', 'Jacob', 'Enos', 'Jarom', 'Omni', 'Words of Mormon',
  'Mosiah', 'Alma', 'Helaman', '3 Nephi', '4 Nephi', 'Mormon', 'Ether', 'Moroni',
  'Doctrine and Covenants', 'Moses', 'Abraham',
  'Joseph Smith\u2014Matthew', 'Joseph Smith\u2014History', 'Articles of Faith'
];

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function writeYaml(path, data) {
  const content = yaml.dump(data, {
    lineWidth: 120,
    noRefs: true,
    sortKeys: false
  });
  writeFileSync(path, content);
  console.log(`Wrote: ${path}`);
}

function nameToKey(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

// Generate Bible structure
function generateBibleStructure() {
  const bookNames = Object.keys(scriptdata);
  const books = [];
  let verseId = 1;

  for (let i = 0; i < BIBLE_BOOK_COUNT; i++) {
    const bookName = bookNames[i];
    const chapters = scriptdata[bookName];
    const key = nameToKey(bookName);
    const firstVerseId = verseId;
    const totalVerses = chapters.reduce((sum, v) => sum + v, 0);

    books.push({
      key: key,
      order: i + 1,
      chapters: chapters.length,
      verses: chapters,
      first_verse_id: firstVerseId
    });

    verseId += totalVerses;
  }

  return {
    canon: 'bible',
    name: 'Holy Bible (KJV)',
    description: 'King James Version - 66 books, Genesis through Revelation',
    id_format: 'integer',
    id_start: 1,
    id_end: verseId - 1,
    books
  };
}

// Generate LDS structure
function generateLDSStructure() {
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
  let order = BIBLE_BOOK_COUNT + 1;

  for (const bookName of LDS_BOOKS) {
    const chapters = scriptdata[bookName];
    if (!chapters) {
      console.log(`Warning: Book "${bookName}" not found in scriptdata`);
      continue;
    }

    const key = nameToKey(bookName);
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

  return {
    canon: 'lds',
    name: 'LDS Restoration Scripture',
    description: 'Book of Mormon, Doctrine and Covenants, Pearl of Great Price',
    extends: 'bible',
    id_format: 'integer',
    id_start: ldsStartId,
    id_end: verseId - 1,
    books
  };
}

// Main migration
function migrate() {
  console.log('Migrating scripture data to YAML...\n');

  // Create directories
  ensureDir(join(DATA_DIR, 'shared'));
  ensureDir(join(DATA_DIR, 'canons', 'bible'));
  ensureDir(join(DATA_DIR, 'canons', 'lds'));

  // Generate and write structures
  const bibleStructure = generateBibleStructure();
  writeYaml(
    join(DATA_DIR, 'canons', 'bible', '_bible.yml'),
    bibleStructure
  );
  console.log(`Bible: ${bibleStructure.books.length} books, ${bibleStructure.id_end} verses`);

  const ldsStructure = generateLDSStructure();
  writeYaml(
    join(DATA_DIR, 'canons', 'lds', '_lds.yml'),
    ldsStructure
  );
  console.log(`LDS: ${ldsStructure.books.length} books, verse IDs ${ldsStructure.id_start}-${ldsStructure.id_end}`);

  console.log('\nMigration complete!');
}

migrate();
