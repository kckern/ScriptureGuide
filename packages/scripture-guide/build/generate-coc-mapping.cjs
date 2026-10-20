// build/generate-coc-mapping.cjs
const fs = require('fs');
const path = require('path');

const BOOKS = [
  { slug: '1nephi', name: '1 Nephi' },
  { slug: '2nephi', name: '2 Nephi' },
  { slug: 'jacob', name: 'Jacob' },
  { slug: 'enos', name: 'Enos' },
  { slug: 'jarom', name: 'Jarom' },
  { slug: 'omni', name: 'Omni' },
  { slug: 'wofm', name: 'Words of Mormon' },
  { slug: 'mosiah', name: 'Mosiah' },
  { slug: 'alma', name: 'Alma' },
  { slug: 'helaman', name: 'Helaman' },
  { slug: '3nephi', name: '3 Nephi' },
  { slug: '4nephi', name: '4 Nephi' },
  { slug: 'mormon', name: 'Mormon' },
  { slug: 'ether', name: 'Ether' },
  { slug: 'moroni', name: 'Moroni' }
];

// Parse LDS data from lds.txt
const parseLdsFile = (filepath) => {
  const content = fs.readFileSync(filepath, 'utf-8');
  const lines = content.split('\n').slice(1); // skip header
  const verses = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    const verse_id = parseInt(parts[0]);
    const book_id = parseInt(parts[2]);
    const chapter = parseInt(parts[3]);
    const verse = parseInt(parts[4]);
    const text = parts[6] || '';

    // Book IDs 67-81 are Book of Mormon (1 Nephi through Moroni)
    if (book_id >= 67 && book_id <= 81) {
      verses.push({
        verse_id,
        book_id,
        chapter,
        verse,
        text: normalizeText(text)
      });
    }
  }

  return verses;
};

// Normalize text for comparison
const normalizeText = (text) => {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 150);
};

// Fetch RLDS book from centerplace.org
const fetchRldsBook = async (slug) => {
  const url = `https://centerplace.org/hs/bm/${slug}.htm`;
  console.log(`  Fetching ${url}...`);

  const response = await fetch(url);
  const html = await response.text();
  return parseRldsHtml(html);
};

// Parse RLDS HTML to extract verses
const parseRldsHtml = (html) => {
  const verses = [];

  // Pattern: chapter:verse followed by text
  // Example: "1:1 I, Nephi, having been born..."
  const pattern = /(\d+):(\d+)\s+([^<\n]+)/g;
  let match;

  while ((match = pattern.exec(html)) !== null) {
    verses.push({
      chapter: parseInt(match[1]),
      verse: parseInt(match[2]),
      text: normalizeText(match[3])
    });
  }

  return verses;
};

// Calculate Jaccard similarity between two texts
const textSimilarity = (a, b) => {
  if (!a || !b) return 0;
  const wordsA = new Set(a.split(' ').filter(w => w.length > 2));
  const wordsB = new Set(b.split(' ').filter(w => w.length > 2));
  const intersection = [...wordsA].filter(x => wordsB.has(x)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return union > 0 ? intersection / union : 0;
};

// Align verses using text similarity
const alignVerses = (ldsVerses, rldsVerses) => {
  const cocToLds = {};
  const ldsToCoc = {};

  let ldsIndex = 0;

  for (let cocIndex = 0; cocIndex < rldsVerses.length; cocIndex++) {
    const rlds = rldsVerses[cocIndex];
    const cocNum = cocIndex + 1; // 1-indexed

    // Find matching LDS verse(s)
    const matches = [];
    let bestSim = 0;

    // Look ahead up to 3 verses
    for (let i = ldsIndex; i < Math.min(ldsIndex + 3, ldsVerses.length); i++) {
      const sim = textSimilarity(rlds.text, ldsVerses[i].text);
      if (sim > 0.3) {
        matches.push(ldsVerses[i]);
        if (sim > bestSim) bestSim = sim;
      }
    }

    // If no good match, just take the next LDS verse
    if (matches.length === 0 && ldsIndex < ldsVerses.length) {
      matches.push(ldsVerses[ldsIndex]);
    }

    // Record mapping
    const ldsIds = matches.map(m => m.verse_id);
    const partial = matches.length !== 1;

    cocToLds[cocNum] = { lds: ldsIds, partial };

    // Build reverse index
    for (const ldsVerse of matches) {
      if (!ldsToCoc[ldsVerse.verse_id]) {
        ldsToCoc[ldsVerse.verse_id] = { coc: [], partial: false };
      }
      if (!ldsToCoc[ldsVerse.verse_id].coc.includes(cocNum)) {
        ldsToCoc[ldsVerse.verse_id].coc.push(cocNum);
      }
      if (partial) {
        ldsToCoc[ldsVerse.verse_id].partial = true;
      }
    }

    // Advance LDS index
    if (matches.length > 0) {
      const lastMatch = matches[matches.length - 1];
      const lastIdx = ldsVerses.findIndex(v => v.verse_id === lastMatch.verse_id);
      if (lastIdx >= ldsIndex) {
        ldsIndex = lastIdx + 1;
      }
    }
  }

  return { cocToLds, ldsToCoc };
};

// Main generation function
const generateMapping = async () => {
  console.log('=== COC Mapping Generator ===\n');

  // Parse LDS data
  console.log('Step 1: Parsing LDS data from lds.txt...');
  const ldsPath = path.join(__dirname, '..', 'lds.txt');

  if (!fs.existsSync(ldsPath)) {
    console.error('ERROR: lds.txt not found at', ldsPath);
    process.exit(1);
  }

  const ldsVerses = parseLdsFile(ldsPath);
  console.log(`  Found ${ldsVerses.length} LDS Book of Mormon verses\n`);

  // Fetch RLDS data
  console.log('Step 2: Fetching RLDS data from centerplace.org...');
  const allRlds = [];

  for (const book of BOOKS) {
    try {
      const verses = await fetchRldsBook(book.slug);
      console.log(`    ${book.name}: ${verses.length} verses`);
      allRlds.push(...verses);
    } catch (err) {
      console.error(`    ERROR fetching ${book.name}: ${err.message}`);
    }
  }

  console.log(`  Total RLDS verses: ${allRlds.length}\n`);

  // Align verses
  console.log('Step 3: Aligning verses...');
  const { cocToLds, ldsToCoc } = alignVerses(ldsVerses, allRlds);
  console.log(`  Mapped ${Object.keys(cocToLds).length} COC verses\n`);

  // Write output
  console.log('Step 4: Writing data/coc-mapping.mjs...');
  const output = `// Auto-generated COC↔LDS mapping
// Generated: ${new Date().toISOString()}
// DO NOT EDIT - regenerate with: node build/generate-coc-mapping.cjs

export default {
  cocToLds: ${JSON.stringify(cocToLds, null, 2)},
  ldsToCoc: ${JSON.stringify(ldsToCoc, null, 2)}
};
`;

  const outPath = path.join(__dirname, '..', 'data', 'coc-mapping.mjs');
  fs.writeFileSync(outPath, output);
  console.log(`  Written to ${outPath}\n`);

  // Summary
  const partialCount = Object.values(cocToLds).filter(m => m.partial).length;
  console.log('=== Summary ===');
  console.log(`Total COC verses: ${Object.keys(cocToLds).length}`);
  console.log(`Partial mappings: ${partialCount}`);
  console.log(`Exact mappings: ${Object.keys(cocToLds).length - partialCount}`);
  console.log('\nDone!');
};

generateMapping().catch(err => {
  console.error('Generation failed:', err);
  process.exit(1);
});
