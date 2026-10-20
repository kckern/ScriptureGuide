// build/generate-coc-lds-mapping.cjs
// Generates COC↔LDS Book of Mormon mapping from PDF cross-reference data
// Output: Compressed YAML format for _mapping.yml

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// PDF Cross-Reference Data (from BofM_RLDS-LDSCrossReference.pdf)
// New format: [book, coc_start_chap, coc_start_verse, coc_end_chap, coc_end_verse, lds_chapter, lds_start, lds_end]
// This format properly handles cross-chapter spans
const CROSS_REFERENCE = [
  // 1 Nephi
  ['1_nephi', 1, 1, 1, 23, 1, 1, 20],
  ['1_nephi', 1, 24, 1, 58, 2, 1, 24],
  ['1_nephi', 1, 59, 1, 98, 3, 1, 31],
  ['1_nephi', 1, 99, 1, 145, 4, 1, 38],
  ['1_nephi', 1, 146, 1, 174, 5, 1, 22],
  ['1_nephi', 2, 1, 2, 6, 6, 1, 6],
  ['1_nephi', 2, 7, 2, 39, 7, 1, 22],
  ['1_nephi', 2, 40, 2, 91, 8, 1, 38],
  ['1_nephi', 2, 92, 2, 100, 9, 1, 6],  // Chapter 2 has 100 verses
  ['1_nephi', 3, 1, 3, 36, 10, 1, 22],
  ['1_nephi', 3, 37, 3, 95, 11, 1, 36],
  ['1_nephi', 3, 96, 3, 134, 12, 1, 23],
  ['1_nephi', 3, 135, 3, 200, 13, 1, 42],
  ['1_nephi', 3, 201, 3, 255, 14, 1, 30],  // Chapter 3 has 255 verses
  ['1_nephi', 4, 1, 4, 62, 15, 1, 36],  // Chapter 4 has 62 verses
  ['1_nephi', 5, 1, 5, 54, 16, 1, 39],
  ['1_nephi', 5, 55, 5, 167, 17, 1, 55],
  ['1_nephi', 5, 168, 5, 217, 18, 1, 25],
  ['1_nephi', 5, 218, 6, 7, 19, 1, 24],   // Cross-chapter: 5:218-6:7
  ['1_nephi', 6, 8, 6, 29, 20, 1, 22],
  ['1_nephi', 6, 30, 6, 56, 21, 1, 26],
  ['1_nephi', 7, 1, 7, 68, 22, 1, 31],    // Chapter 7 has 68 verses

  // 2 Nephi
  ['2_nephi', 1, 1, 1, 58, 1, 1, 32],
  ['2_nephi', 1, 59, 1, 126, 2, 1, 30],   // Chapter 1 has 126 verses
  ['2_nephi', 2, 1, 2, 48, 3, 1, 25],     // Chapter 2 has 48 verses
  ['2_nephi', 3, 1, 3, 64, 4, 1, 35],     // Chapter 3 has 64 verses
  ['2_nephi', 4, 1, 4, 51, 5, 1, 34],
  ['2_nephi', 5, 1, 5, 45, 6, 1, 18],
  ['2_nephi', 5, 46, 5, 69, 7, 1, 11],
  ['2_nephi', 5, 70, 5, 114, 8, 1, 25],
  ['2_nephi', 6, 1, 6, 106, 9, 1, 54],
  ['2_nephi', 7, 1, 7, 43, 10, 1, 25],    // Chapter 7 has 43 verses
  ['2_nephi', 8, 1, 8, 16, 11, 1, 8],
  ['2_nephi', 8, 17, 8, 38, 12, 1, 22],
  ['2_nephi', 8, 39, 8, 64, 13, 1, 26],
  ['2_nephi', 8, 65, 8, 70, 14, 1, 6],
  ['2_nephi', 8, 71, 8, 100, 15, 1, 30],
  ['2_nephi', 9, 1, 9, 13, 16, 1, 13],
  ['2_nephi', 9, 14, 9, 38, 17, 1, 25],
  ['2_nephi', 9, 39, 9, 60, 18, 1, 22],
  ['2_nephi', 9, 61, 9, 81, 19, 1, 21],
  ['2_nephi', 9, 82, 9, 115, 20, 1, 34],
  ['2_nephi', 9, 116, 9, 131, 21, 1, 16],
  ['2_nephi', 9, 132, 9, 137, 22, 1, 6],
  ['2_nephi', 10, 1, 10, 22, 23, 1, 22],
  ['2_nephi', 10, 23, 10, 54, 24, 1, 32],
  ['2_nephi', 11, 1, 11, 57, 25, 1, 30],
  ['2_nephi', 11, 58, 11, 115, 26, 1, 33],
  ['2_nephi', 11, 116, 11, 160, 27, 1, 35],
  ['2_nephi', 12, 1, 12, 41, 28, 1, 32],
  ['2_nephi', 12, 42, 12, 74, 29, 1, 14],
  ['2_nephi', 12, 75, 12, 98, 30, 1, 18],  // Chapter 12 has 98 verses
  ['2_nephi', 13, 1, 13, 31, 31, 1, 21],   // Chapter 13 has 31 verses
  ['2_nephi', 14, 1, 14, 12, 32, 1, 9],
  ['2_nephi', 15, 1, 15, 18, 33, 1, 15],

  // Jacob
  ['jacob', 1, 1, 1, 19, 1, 1, 19],
  ['jacob', 2, 1, 2, 47, 2, 1, 35],
  ['jacob', 2, 48, 2, 69, 3, 1, 14],       // Chapter 2 has 69 verses
  ['jacob', 3, 1, 3, 29, 4, 1, 18],
  ['jacob', 3, 30, 3, 151, 5, 1, 77],      // Chapter 3 has 151 verses
  ['jacob', 4, 1, 4, 18, 6, 1, 13],
  ['jacob', 5, 1, 5, 45, 7, 1, 27],        // Chapter 5 has 45 verses

  // Enos (single chapter with 45 verses)
  ['enos', 1, 1, 1, 45, 1, 1, 27],

  // Jarom (single chapter with 32 verses)
  ['jarom', 1, 1, 1, 32, 1, 1, 15],

  // Omni (single chapter with 52 verses)
  ['omni', 1, 1, 1, 52, 1, 1, 30],

  // Words of Mormon (single chapter with 27 verses)
  ['words_of_mormon', 1, 1, 1, 27, 1, 1, 18],

  // Mosiah
  ['mosiah', 1, 1, 1, 27, 1, 1, 18],
  ['mosiah', 1, 28, 1, 91, 2, 1, 41],
  ['mosiah', 1, 92, 1, 129, 3, 1, 27],     // Chapter 1 has 129 verses
  ['mosiah', 2, 1, 2, 49, 4, 1, 30],       // Chapter 2 has 49 verses
  ['mosiah', 3, 1, 3, 21, 5, 1, 15],
  ['mosiah', 4, 1, 4, 9, 6, 1, 7],         // Chapter 4 has 9 verses
  ['mosiah', 5, 1, 5, 52, 7, 1, 33],
  ['mosiah', 5, 53, 5, 86, 8, 1, 21],
  ['mosiah', 6, 1, 6, 25, 9, 1, 19],
  ['mosiah', 6, 26, 6, 58, 10, 1, 22],
  ['mosiah', 7, 1, 7, 44, 11, 1, 29],
  ['mosiah', 7, 45, 7, 99, 12, 1, 37],
  ['mosiah', 7, 100, 8, 14, 13, 1, 35],    // Cross-chapter: 7:100-8:14
  ['mosiah', 8, 15, 8, 27, 14, 1, 12],
  ['mosiah', 8, 28, 8, 69, 15, 1, 31],
  ['mosiah', 8, 70, 8, 91, 16, 1, 15],
  ['mosiah', 9, 1, 9, 27, 17, 1, 20],
  ['mosiah', 9, 28, 9, 73, 18, 1, 35],
  ['mosiah', 9, 74, 9, 107, 19, 1, 29],
  ['mosiah', 9, 108, 9, 139, 20, 1, 26],
  ['mosiah', 9, 140, 9, 181, 21, 1, 36],
  ['mosiah', 10, 1, 10, 19, 22, 1, 16],
  ['mosiah', 11, 1, 11, 43, 23, 1, 39],
  ['mosiah', 11, 44, 11, 76, 24, 1, 25],
  ['mosiah', 11, 77, 11, 104, 25, 1, 24],
  ['mosiah', 11, 105, 11, 149, 26, 1, 39],
  ['mosiah', 11, 150, 11, 207, 27, 1, 37],
  ['mosiah', 12, 1, 13, 2, 28, 1, 20],     // Cross-chapter: 12:1-13:2
  ['mosiah', 13, 3, 13, 68, 29, 1, 47],

  // Alma
  ['alma', 1, 1, 1, 52, 1, 1, 33],
  ['alma', 1, 53, 1, 97, 2, 1, 38],
  ['alma', 1, 98, 1, 129, 3, 1, 27],       // Chapter 1 has 129 verses
  ['alma', 2, 1, 2, 28, 4, 1, 20],
  ['alma', 3, 1, 3, 108, 5, 1, 62],
  ['alma', 4, 1, 4, 9, 6, 1, 8],           // Chapter 4 has 9 verses
  ['alma', 5, 1, 5, 44, 7, 1, 27],
  ['alma', 6, 1, 6, 42, 8, 1, 32],
  ['alma', 7, 1, 7, 50, 9, 1, 34],         // Chapter 7 has 50 verses
  ['alma', 8, 1, 8, 47, 10, 1, 32],
  ['alma', 8, 48, 8, 108, 11, 1, 46],      // Chapter 8 has 108 verses
  ['alma', 9, 1, 9, 61, 12, 1, 37],
  ['alma', 9, 62, 10, 31, 13, 1, 31],      // Cross-chapter: 9:62-10:31
  ['alma', 10, 32, 10, 85, 14, 1, 29],
  ['alma', 10, 86, 10, 111, 15, 1, 19],
  ['alma', 11, 1, 11, 32, 16, 1, 21],      // Chapter 11 has 32 verses
  ['alma', 12, 1, 12, 61, 17, 1, 39],
  ['alma', 12, 62, 12, 125, 18, 1, 43],
  ['alma', 12, 126, 12, 180, 19, 1, 36],
  ['alma', 12, 181, 12, 219, 20, 1, 30],   // Chapter 12 has 219 verses
  ['alma', 13, 1, 13, 29, 21, 1, 23],
  ['alma', 13, 30, 13, 82, 22, 1, 35],
  ['alma', 14, 1, 14, 20, 23, 1, 18],
  ['alma', 14, 21, 14, 58, 24, 1, 30],
  ['alma', 14, 59, 14, 78, 25, 1, 17],
  ['alma', 14, 79, 14, 127, 26, 1, 37],    // Chapter 14 has 127 verses
  ['alma', 15, 1, 15, 35, 27, 1, 30],
  ['alma', 15, 36, 15, 51, 28, 1, 14],
  ['alma', 15, 52, 15, 68, 29, 1, 17],     // Chapter 15 has 68 verses
  ['alma', 16, 1, 16, 77, 30, 1, 60],
  ['alma', 16, 78, 16, 120, 31, 1, 38],
  ['alma', 16, 121, 16, 173, 32, 1, 43],
  ['alma', 16, 174, 16, 200, 33, 1, 23],
  ['alma', 16, 201, 16, 239, 34, 1, 41],
  ['alma', 16, 240, 16, 260, 35, 1, 16],   // Chapter 16 has 260 verses
  ['alma', 17, 1, 17, 30, 36, 1, 30],
  ['alma', 17, 31, 17, 83, 37, 1, 47],     // Chapter 17 has 83 verses
  ['alma', 18, 1, 18, 17, 38, 1, 15],      // Chapter 18 has 17 verses
  ['alma', 19, 1, 19, 27, 39, 1, 19],
  ['alma', 19, 28, 19, 61, 40, 1, 26],
  ['alma', 19, 62, 19, 80, 41, 1, 15],
  ['alma', 19, 81, 19, 115, 42, 1, 31],    // Chapter 19 has 115 verses
  ['alma', 20, 1, 20, 60, 43, 1, 54],
  ['alma', 20, 61, 20, 99, 44, 1, 24],     // Chapter 20 has 99 verses
  ['alma', 21, 1, 21, 28, 45, 1, 24],
  ['alma', 21, 29, 21, 77, 46, 1, 41],
  ['alma', 21, 78, 21, 122, 47, 1, 36],
  ['alma', 21, 123, 21, 148, 48, 1, 25],
  ['alma', 21, 149, 21, 186, 49, 1, 30],
  ['alma', 22, 1, 22, 44, 50, 1, 40],
  ['alma', 23, 1, 23, 44, 51, 1, 37],
  ['alma', 24, 1, 24, 49, 52, 1, 40],
  ['alma', 24, 50, 24, 79, 53, 1, 23],
  ['alma', 25, 1, 25, 26, 54, 1, 24],
  ['alma', 25, 27, 25, 63, 55, 1, 35],
  ['alma', 26, 1, 26, 69, 56, 1, 57],
  ['alma', 26, 70, 26, 117, 57, 1, 36],
  ['alma', 26, 118, 26, 168, 58, 1, 41],   // Chapter 26 has 168 verses
  ['alma', 27, 1, 27, 13, 59, 1, 13],
  ['alma', 27, 14, 27, 58, 60, 1, 36],     // Chapter 27 has 58 verses
  ['alma', 28, 1, 28, 26, 61, 1, 21],      // Chapter 28 has 26 verses
  ['alma', 29, 1, 29, 62, 62, 1, 52],      // Chapter 29 has 62 verses
  ['alma', 30, 1, 30, 21, 63, 1, 17],      // Chapter 30 has 21 verses

  // Helaman
  ['helaman', 1, 1, 1, 36, 1, 1, 34],
  ['helaman', 1, 37, 1, 52, 2, 1, 14],
  ['helaman', 2, 1, 2, 34, 3, 1, 37],
  ['helaman', 2, 35, 2, 62, 4, 1, 26],
  ['helaman', 2, 63, 2, 117, 5, 1, 52],
  ['helaman', 2, 118, 2, 168, 6, 1, 41],
  ['helaman', 3, 1, 3, 31, 7, 1, 29],
  ['helaman', 3, 32, 3, 66, 8, 1, 28],
  ['helaman', 3, 67, 3, 111, 9, 1, 41],
  ['helaman', 3, 112, 3, 132, 10, 1, 19],
  ['helaman', 4, 1, 4, 47, 11, 1, 38],
  ['helaman', 4, 48, 4, 73, 12, 1, 26],
  ['helaman', 5, 1, 5, 53, 13, 1, 39],
  ['helaman', 5, 54, 5, 86, 14, 1, 31],
  ['helaman', 5, 87, 5, 108, 15, 1, 17],
  ['helaman', 5, 109, 5, 140, 16, 1, 25],

  // 3 Nephi
  ['3_nephi', 1, 1, 1, 37, 1, 1, 30],
  ['3_nephi', 1, 38, 1, 57, 2, 1, 19],
  ['3_nephi', 2, 1, 2, 38, 3, 1, 26],
  ['3_nephi', 2, 39, 2, 81, 4, 1, 33],
  ['3_nephi', 2, 82, 2, 109, 5, 1, 26],
  ['3_nephi', 3, 1, 3, 35, 6, 1, 30],
  ['3_nephi', 3, 36, 3, 70, 7, 1, 26],
  ['3_nephi', 4, 1, 4, 25, 8, 1, 25],
  ['3_nephi', 4, 26, 4, 52, 9, 1, 22],
  ['3_nephi', 4, 53, 4, 75, 10, 1, 19],
  ['3_nephi', 5, 1, 5, 43, 11, 1, 41],
  ['3_nephi', 5, 44, 5, 92, 12, 1, 48],
  ['3_nephi', 5, 93, 6, 12, 13, 1, 34],    // Cross-chapter: 5:93-6:12
  ['3_nephi', 6, 13, 6, 37, 14, 1, 27],
  ['3_nephi', 7, 1, 7, 23, 15, 1, 24],
  ['3_nephi', 7, 24, 7, 45, 16, 1, 20],
  ['3_nephi', 8, 1, 8, 27, 17, 1, 25],
  ['3_nephi', 8, 28, 8, 74, 18, 1, 39],    // Chapter 8 has 74 verses
  ['3_nephi', 9, 1, 9, 36, 19, 1, 36],
  ['3_nephi', 9, 37, 9, 85, 20, 1, 46],
  ['3_nephi', 9, 86, 10, 8, 21, 1, 29],    // Cross-chapter: 9:86-10:8
  ['3_nephi', 10, 9, 10, 25, 22, 1, 17],
  ['3_nephi', 10, 26, 11, 1, 23, 1, 14],   // Cross-chapter: 10:26-11:1
  ['3_nephi', 11, 2, 11, 21, 24, 1, 18],
  ['3_nephi', 11, 22, 11, 27, 25, 1, 6],
  ['3_nephi', 11, 28, 12, 13, 26, 1, 21],  // Cross-chapter: 11:28-12:13
  ['3_nephi', 12, 14, 13, 11, 27, 1, 33],  // Cross-chapter: 12:14-13:11
  ['3_nephi', 13, 12, 13, 53, 28, 1, 40],
  ['3_nephi', 13, 54, 13, 62, 29, 1, 9],
  ['3_nephi', 14, 1, 14, 2, 30, 1, 2],     // Chapter 14 has 2 verses

  // 4 Nephi (single chapter with 59 verses)
  ['4_nephi', 1, 1, 1, 59, 1, 1, 49],

  // Mormon
  ['mormon', 1, 1, 1, 20, 1, 1, 19],
  ['mormon', 1, 21, 1, 62, 2, 1, 29],
  ['mormon', 1, 63, 1, 89, 3, 1, 22],
  ['mormon', 2, 1, 2, 25, 4, 1, 23],
  ['mormon', 2, 26, 2, 54, 5, 1, 24],
  ['mormon', 3, 1, 3, 23, 6, 1, 22],
  ['mormon', 3, 24, 3, 32, 7, 1, 10],       // Chapter 3 has 32 verses
  ['mormon', 4, 1, 4, 56, 8, 1, 41],
  ['mormon', 4, 57, 4, 103, 9, 1, 37],

  // Ether
  ['ether', 1, 1, 1, 21, 1, 1, 43],
  ['ether', 1, 22, 1, 59, 2, 1, 25],
  ['ether', 1, 60, 1, 93, 3, 1, 28],
  ['ether', 1, 94, 1, 116, 4, 1, 19],       // Chapter 1 has 116 verses
  ['ether', 2, 1, 2, 5, 5, 1, 6],
  ['ether', 3, 1, 3, 36, 6, 1, 30],
  ['ether', 3, 37, 3, 66, 7, 1, 27],
  ['ether', 3, 67, 3, 102, 8, 1, 26],
  ['ether', 4, 1, 4, 42, 9, 1, 35],
  ['ether', 4, 43, 4, 89, 10, 1, 34],
  ['ether', 4, 90, 4, 115, 11, 1, 23],
  ['ether', 5, 1, 5, 41, 12, 1, 41],
  ['ether', 6, 1, 6, 35, 13, 1, 31],
  ['ether', 6, 36, 6, 71, 14, 1, 31],
  ['ether', 6, 72, 6, 109, 15, 1, 34],

  // Moroni
  ['moroni', 1, 1, 1, 4, 1, 1, 4],
  ['moroni', 2, 1, 2, 3, 2, 1, 3],
  ['moroni', 3, 1, 3, 3, 3, 1, 4],
  ['moroni', 4, 1, 4, 4, 4, 1, 3],
  ['moroni', 5, 1, 5, 3, 5, 1, 2],
  ['moroni', 6, 1, 6, 9, 6, 1, 9],
  ['moroni', 7, 1, 7, 53, 7, 1, 48],
  ['moroni', 8, 1, 8, 35, 8, 1, 30],
  ['moroni', 9, 1, 9, 28, 9, 1, 26],
  ['moroni', 10, 1, 10, 30, 10, 1, 34],     // Chapter 10 has 30 verses
];

// Load canon structure files
const loadYaml = (filepath) => {
  const content = fs.readFileSync(filepath, 'utf-8');
  return yaml.load(content);
};

// Get first verse ID for a book from canon structure
const getBookFirstVerseId = (canon, bookKey) => {
  const book = canon.books.find(b => b.key === bookKey);
  return book ? book.first_verse_id : null;
};

// Get verse count per chapter for a book
const getBookVerses = (canon, bookKey) => {
  const book = canon.books.find(b => b.key === bookKey);
  return book ? book.verses : [];
};

// Calculate absolute verse ID from book, chapter, verse
const getVerseId = (canon, bookKey, chapter, verse) => {
  const book = canon.books.find(b => b.key === bookKey);
  if (!book) return null;

  let id = book.first_verse_id;
  // Add verses from previous chapters
  for (let c = 0; c < chapter - 1; c++) {
    id += book.verses[c];
  }
  // Add verse offset within chapter
  id += verse - 1;
  return id;
};

// Calculate COC verse count for a cross-chapter span
const getCocVerseCount = (rldsCanon, book, startChap, startVerse, endChap, endVerse) => {
  const bookData = rldsCanon.books.find(b => b.key === book);
  if (!bookData) return 0;

  if (startChap === endChap) {
    return endVerse - startVerse + 1;
  }

  // Cross-chapter span
  let count = 0;
  // Verses from start chapter
  count += bookData.verses[startChap - 1] - startVerse + 1;
  // Full chapters in between
  for (let c = startChap; c < endChap - 1; c++) {
    count += bookData.verses[c];
  }
  // Verses from end chapter
  count += endVerse;
  return count;
};

// Generate verse-level mappings from block data
const generateMappings = (rldsCanon, ldsCanon) => {
  const cocToLds = new Map(); // COC verse ID -> [LDS verse IDs]

  for (const block of CROSS_REFERENCE) {
    const [book, cocStartChap, cocStartVerse, cocEndChap, cocEndVerse, ldsChap, ldsStart, ldsEnd] = block;

    // Calculate verse counts
    const cocCount = getCocVerseCount(rldsCanon, book, cocStartChap, cocStartVerse, cocEndChap, cocEndVerse);
    const ldsCount = ldsEnd - ldsStart + 1;

    // Get base verse IDs
    const cocBaseId = getVerseId(rldsCanon, book, cocStartChap, cocStartVerse);
    const ldsBaseId = getVerseId(ldsCanon, book, ldsChap, ldsStart);

    if (!cocBaseId || !ldsBaseId) {
      console.warn(`  Warning: Could not resolve IDs for ${book} COC ${cocStartChap}:${cocStartVerse}-${cocEndChap}:${cocEndVerse}`);
      continue;
    }

    // Map verses within this block
    for (let i = 0; i < cocCount; i++) {
      const cocId = cocBaseId + i;

      // Proportional mapping
      const ldsOffset = Math.floor(i * ldsCount / cocCount);
      const ldsId = ldsBaseId + ldsOffset;

      // Check if next COC verse maps to same LDS verse (for multi detection)
      const nextLdsOffset = Math.floor((i + 1) * ldsCount / cocCount);

      if (!cocToLds.has(cocId)) {
        cocToLds.set(cocId, []);
      }

      // Add LDS ID if not already present
      const existing = cocToLds.get(cocId);
      if (!existing.includes(ldsId)) {
        existing.push(ldsId);
      }

      // If this COC verse spans multiple LDS verses
      if (cocCount < ldsCount) {
        // Add additional LDS verses this COC verse maps to
        for (let j = ldsOffset; j < nextLdsOffset && j < ldsCount; j++) {
          const additionalLdsId = ldsBaseId + j;
          if (!existing.includes(additionalLdsId)) {
            existing.push(additionalLdsId);
          }
        }
      }
    }
  }

  return cocToLds;
};

// Compress mappings into runs, singles, and multi
const compressMappings = (cocToLds) => {
  const runs = [];
  const singles = [];
  const multi = [];

  // Sort by COC ID
  const sortedIds = [...cocToLds.keys()].sort((a, b) => a - b);

  let i = 0;
  while (i < sortedIds.length) {
    const cocId = sortedIds[i];
    const ldsIds = cocToLds.get(cocId);

    // Multi-mapping?
    if (ldsIds.length > 1) {
      multi.push([cocId, ldsIds.sort((a, b) => a - b)]);
      i++;
      continue;
    }

    const ldsId = ldsIds[0];

    // Try to find a run
    let runLength = 1;
    while (i + runLength < sortedIds.length) {
      const nextCocId = sortedIds[i + runLength];
      const nextLdsIds = cocToLds.get(nextCocId);

      // Must be 1:1 and sequential
      if (nextLdsIds.length !== 1) break;
      if (nextCocId !== cocId + runLength) break;
      if (nextLdsIds[0] !== ldsId + runLength) break;

      runLength++;
    }

    if (runLength >= 3) {
      // Worth making a run
      runs.push([cocId, ldsId, runLength]);
      i += runLength;
    } else {
      // Singles
      for (let j = 0; j < runLength; j++) {
        singles.push([sortedIds[i + j], cocToLds.get(sortedIds[i + j])[0]]);
      }
      i += runLength;
    }
  }

  return { runs, singles, multi };
};

// Main
const main = () => {
  console.log('=== COC↔LDS BOM Mapping Generator ===\n');

  // Load canon structures
  console.log('Loading canon structures...');
  const rldsCanon = loadYaml(path.join(__dirname, '../data/canons/rlds/_rlds.yml'));
  const ldsCanon = loadYaml(path.join(__dirname, '../data/canons/lds/_lds.yml'));

  console.log(`  RLDS canon: ${rldsCanon.books.length} books`);
  console.log(`  LDS canon: ${ldsCanon.books.length} books\n`);

  // Generate mappings
  console.log('Generating verse-level mappings from PDF cross-reference...');
  const cocToLds = generateMappings(rldsCanon, ldsCanon);
  console.log(`  Generated ${cocToLds.size} COC verse mappings\n`);

  // Compress
  console.log('Compressing into runs/singles/multi...');
  const { runs, singles, multi } = compressMappings(cocToLds);
  console.log(`  Runs: ${runs.length}`);
  console.log(`  Singles: ${singles.length}`);
  console.log(`  Multi: ${multi.length}\n`);

  // Load existing mapping file
  console.log('Loading existing _mapping.yml...');
  const mappingPath = path.join(__dirname, '../data/canons/rlds/_mapping.yml');
  const existingContent = fs.readFileSync(mappingPath, 'utf-8');
  const existingMapping = yaml.load(existingContent);

  // Get bible mappings (handle both flat and nested structure)
  const bibleRuns = existingMapping.bible?.runs || existingMapping.runs || [];
  const bibleSingles = existingMapping.bible?.singles || existingMapping.singles || [];
  const bibleMulti = existingMapping.bible?.multi || existingMapping.multi || [];

  // Write updated file with nested structure
  console.log('Writing updated _mapping.yml with nested structure...');

  // Build output manually for better formatting
  let output = `# RLDS ↔ External Canon Mappings
# Generated: ${new Date().toISOString()}
#
# Format:
#   runs: [source_start, target_start, length] - sequential 1:1 mappings
#   singles: [source, target] - isolated 1:1 mappings
#   multi: [source, [target_ids]] - one source verse maps to multiple target verses

# Maps TO Bible canon (JST ↔ KJV)
# RLDS verse IDs 1-31333 (JST) map to Bible verse IDs
bible:
  runs:
`;

  // Add bible runs
  for (const run of bibleRuns) {
    output += `    - [${run.join(', ')}]\n`;
  }

  output += `  singles:\n`;
  for (const single of bibleSingles) {
    output += `    - [${single.join(', ')}]\n`;
  }

  output += `  multi:\n`;
  for (const m of bibleMulti) {
    const [src, targets] = m;
    output += `    - [${src}, [${targets.join(', ')}]]\n`;
  }

  output += `
# Maps TO LDS canon (COC BOM ↔ LDS BOM)
# RLDS verse IDs 31334-39975 (BOM) map to LDS verse IDs 31103-37706
lds:
  runs:
`;

  for (const run of runs) {
    output += `    - [${run.join(', ')}]\n`;
  }

  output += `  singles:\n`;
  for (const single of singles) {
    output += `    - [${single.join(', ')}]\n`;
  }

  output += `  multi:\n`;
  for (const m of multi) {
    const [src, targets] = m;
    output += `    - [${src}, [${targets.join(', ')}]]\n`;
  }

  fs.writeFileSync(mappingPath, output);
  console.log(`  Written to ${mappingPath}\n`);

  // Summary
  const totalCocVerses = cocToLds.size;
  const totalLdsVerses = new Set([...cocToLds.values()].flat()).size;

  console.log('=== Summary ===');
  console.log(`COC verses mapped: ${totalCocVerses}`);
  console.log(`LDS verses covered: ${totalLdsVerses}`);
  console.log(`Compression: ${runs.length} runs, ${singles.length} singles, ${multi.length} multi`);
  console.log('\nDone!');
};

main();
