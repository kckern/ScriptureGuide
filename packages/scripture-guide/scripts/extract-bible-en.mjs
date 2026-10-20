import yaml from 'js-yaml';
import { writeFileSync, readFileSync } from 'fs';

// Read existing scriptregex.mjs to extract English book patterns
const scriptregexContent = readFileSync('data/scriptregex.mjs', 'utf8');

// Parse the en_books array (simplified extraction)
const books = {
  genesis: { name: 'Genesis', abbreviations: ['gen', 'gn'] },
  exodus: { name: 'Exodus', abbreviations: ['ex', 'exod', 'exo'] },
  leviticus: { name: 'Leviticus', abbreviations: ['lev', 'lv'] },
  numbers: { name: 'Numbers', abbreviations: ['num', 'nu', 'nm'] },
  deuteronomy: { name: 'Deuteronomy', abbreviations: ['deut', 'dt'] },
  joshua: { name: 'Joshua', abbreviations: ['josh', 'jos'] },
  judges: { name: 'Judges', abbreviations: ['judg', 'jdg'] },
  ruth: { name: 'Ruth', abbreviations: ['ruth', 'ru'] },
  '1_samuel': { name: '1 Samuel', abbreviations: ['1 sam', '1sam', '1 sm'] },
  '2_samuel': { name: '2 Samuel', abbreviations: ['2 sam', '2sam', '2 sm'] },
  '1_kings': { name: '1 Kings', abbreviations: ['1 kgs', '1kgs', '1 ki'] },
  '2_kings': { name: '2 Kings', abbreviations: ['2 kgs', '2kgs', '2 ki'] },
  '1_chronicles': { name: '1 Chronicles', abbreviations: ['1 chr', '1chr', '1 ch'] },
  '2_chronicles': { name: '2 Chronicles', abbreviations: ['2 chr', '2chr', '2 ch'] },
  ezra: { name: 'Ezra', abbreviations: ['ezr'] },
  nehemiah: { name: 'Nehemiah', abbreviations: ['neh', 'ne'] },
  esther: { name: 'Esther', abbreviations: ['est', 'esth'] },
  job: { name: 'Job', abbreviations: ['job', 'jb'] },
  psalms: { name: 'Psalms', abbreviations: ['ps', 'pss', 'psa', 'psalm'], singular: 'Psalm' },
  proverbs: { name: 'Proverbs', abbreviations: ['prov', 'prv', 'pr'] },
  ecclesiastes: { name: 'Ecclesiastes', abbreviations: ['eccl', 'ecc', 'ec'] },
  song_of_solomon: { name: 'Song of Solomon', abbreviations: ['song', 'sos', 'ss'], alternates: ['song of songs', 'canticles'] },
  isaiah: { name: 'Isaiah', abbreviations: ['isa', 'is'] },
  jeremiah: { name: 'Jeremiah', abbreviations: ['jer', 'je'] },
  lamentations: { name: 'Lamentations', abbreviations: ['lam', 'la'] },
  ezekiel: { name: 'Ezekiel', abbreviations: ['ezek', 'eze', 'ez'] },
  daniel: { name: 'Daniel', abbreviations: ['dan', 'dn'] },
  hosea: { name: 'Hosea', abbreviations: ['hos', 'ho'] },
  joel: { name: 'Joel', abbreviations: ['joel', 'jl'] },
  amos: { name: 'Amos', abbreviations: ['amos', 'am'] },
  obadiah: { name: 'Obadiah', abbreviations: ['obad', 'ob'] },
  jonah: { name: 'Jonah', abbreviations: ['jonah', 'jon'] },
  micah: { name: 'Micah', abbreviations: ['mic', 'mc'] },
  nahum: { name: 'Nahum', abbreviations: ['nah', 'na'] },
  habakkuk: { name: 'Habakkuk', abbreviations: ['hab', 'hb'] },
  zephaniah: { name: 'Zephaniah', abbreviations: ['zeph', 'zep'] },
  haggai: { name: 'Haggai', abbreviations: ['hag', 'hg'] },
  zechariah: { name: 'Zechariah', abbreviations: ['zech', 'zec'] },
  malachi: { name: 'Malachi', abbreviations: ['mal', 'ml'] },
  matthew: { name: 'Matthew', abbreviations: ['matt', 'mat', 'mt'] },
  mark: { name: 'Mark', abbreviations: ['mark', 'mrk', 'mk'] },
  luke: { name: 'Luke', abbreviations: ['luke', 'luk', 'lk'] },
  john: { name: 'John', abbreviations: ['john', 'jhn', 'jn'] },
  acts: { name: 'Acts', abbreviations: ['acts', 'act'], alternates: ['acts of the apostles'] },
  romans: { name: 'Romans', abbreviations: ['rom', 'ro'] },
  '1_corinthians': { name: '1 Corinthians', abbreviations: ['1 cor', '1cor', '1 co'] },
  '2_corinthians': { name: '2 Corinthians', abbreviations: ['2 cor', '2cor', '2 co'] },
  galatians: { name: 'Galatians', abbreviations: ['gal', 'ga'] },
  ephesians: { name: 'Ephesians', abbreviations: ['eph', 'ep'] },
  philippians: { name: 'Philippians', abbreviations: ['phil', 'php'] },
  colossians: { name: 'Colossians', abbreviations: ['col', 'co'] },
  '1_thessalonians': { name: '1 Thessalonians', abbreviations: ['1 thess', '1thess', '1 th'] },
  '2_thessalonians': { name: '2 Thessalonians', abbreviations: ['2 thess', '2thess', '2 th'] },
  '1_timothy': { name: '1 Timothy', abbreviations: ['1 tim', '1tim', '1 ti'] },
  '2_timothy': { name: '2 Timothy', abbreviations: ['2 tim', '2tim', '2 ti'] },
  titus: { name: 'Titus', abbreviations: ['titus', 'tit'] },
  philemon: { name: 'Philemon', abbreviations: ['phlm', 'phm'] },
  hebrews: { name: 'Hebrews', abbreviations: ['heb', 'he'] },
  james: { name: 'James', abbreviations: ['james', 'jas', 'jm'] },
  '1_peter': { name: '1 Peter', abbreviations: ['1 pet', '1pet', '1 pe'] },
  '2_peter': { name: '2 Peter', abbreviations: ['2 pet', '2pet', '2 pe'] },
  '1_john': { name: '1 John', abbreviations: ['1 john', '1john', '1 jn'] },
  '2_john': { name: '2 John', abbreviations: ['2 john', '2john', '2 jn'] },
  '3_john': { name: '3 John', abbreviations: ['3 john', '3john', '3 jn'] },
  jude: { name: 'Jude', abbreviations: ['jude', 'jud'] },
  revelation: { name: 'Revelation', abbreviations: ['rev', 're', 'apoc'], alternates: ['revelations', 'apocalypse'] }
};

const output = {
  canon: 'bible',
  language: 'en',
  books: books
};

writeFileSync('data/canons/bible/en.yml', yaml.dump(output, { lineWidth: 200, noRefs: true }));
console.log('Created data/canons/bible/en.yml');
