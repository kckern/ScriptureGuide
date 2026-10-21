// English (Porter2) stemmer, written from the Snowball project's description of the algorithm:
// https://snowballstem.org/algorithms/english/stemmer.html
// Snowball is Copyright (c) 2001, Dr Martin Porter, and (c) 2002, Richard Boulton, and is
// released under the BSD 3-clause license (https://snowballstem.org/license.html); see
// SNOWBALL-LICENSE alongside this file.
//
// Sphinx's `morphology = stem_en` follows the version of the algorithm from before Snowball 3.0,
// so the 3.0/3.1 changes listed on that page (past, univers, later, emerg, organ, inter, -ogist,
// even, the a/e/o undoubling exception) are left out. Where Sphinx's output differs from that
// version, the SPHINX rules below reproduce it; they mirror observed Sphinx stem_en behaviour
// (searchd 3.x in the stack workflow, and the stem_en reference compared word by word).
//
// Input is a lowercase ASCII word ([0-9a-z_]); other characters count as non-vowels.

const VOWEL = new Set(['a', 'e', 'i', 'o', 'u', 'y']);
const isV = c => VOWEL.has(c); // 'Y' (a y used as a consonant) is not a vowel
const DOUBLES = new Set(['bb', 'dd', 'ff', 'gg', 'mm', 'nn', 'pp', 'rr', 'tt']);
const VALID_LI = new Set([...'cdeghkmnrt']);

// Exceptional forms, before the stemming process
const EXCEPTIONS = new Map([
  ['skis', 'ski'], ['skies', 'sky'], ['dying', 'die'], ['lying', 'lie'], ['tying', 'tie'],
  ['idly', 'idl'], ['gently', 'gentl'], ['ugly', 'ugli'], ['early', 'earli'], ['only', 'onli'], ['singly', 'singl'],
  ['sky', 'sky'], ['news', 'news'], ['howe', 'howe'], ['atlas', 'atlas'], ['cosmos', 'cosmos'], ['bias', 'bias'], ['andes', 'andes'],
]);
// Left as they are once Step 1a is done
const INVARIANT_AFTER_1A = new Set(['inning', 'outing', 'canning', 'herring', 'earring', 'proceed', 'exceed', 'succeed']);
// R1 is the rest of the word after these
const R1_PREFIXES = ['gener', 'commun', 'arsen'];
const STEP3 = ['tional', 'ational', 'alize', 'icate', 'iciti', 'ical', 'ful', 'ness', 'ative'];

// The longest of `suffixes` the word ends with, or null
const longest = (w, suffixes) => suffixes.reduce((best, s) => (w.endsWith(s) && (!best || s.length > best.length) ? s : best), null);

// After the first non-vowel that follows a vowel, from `from` on; w.length when there is none
function regionAfter(w, from) {
  for (let i = from + 1; i < w.length; i++) if (!isV(w[i]) && isV(w[i - 1])) return i + 1;
  return w.length;
}

// The word ends in a short syllable
function endsShort(w) {
  const n = w.length;
  if (n === 2) return isV(w[0]) && !isV(w[1]);
  return n >= 3 && !isV(w[n - 3]) && isV(w[n - 2]) && !isV(w[n - 1]) && !'wxY'.includes(w[n - 1]);
}

export function snowballStem(word, rules = SPHINX) {
  if (word.length <= 2) return word;
  if (rules.exceptions.has(word)) return rules.exceptions.get(word);

  // y at the start or after a vowel is a consonant: Y
  let w = '';
  for (let i = 0; i < word.length; i++) w += word[i] === 'y' && (i === 0 || isV(w[i - 1])) ? 'Y' : word[i];

  const prefix = rules.r1Prefixes.find(p => w.startsWith(p));
  const p1 = prefix ? prefix.length : regionAfter(w, 0);
  const p2 = regionAfter(w, p1);
  const inR1 = s => w.length - s.length >= p1;
  const inR2 = s => w.length - s.length >= p2;
  const replace = (s, r) => { w = w.slice(0, w.length - s.length) + r; };

  // Step 1a
  let s = longest(w, ['sses', 'ied', 'ies', 's', 'us', 'ss']);
  if (s === 'sses') replace(s, 'ss');
  else if (s === 'ied' || s === 'ies') replace(s, rules.iesToIe(w.length - s.length) ? 'ie' : 'i');
  else if (s === 's' && rules.deleteS(w)) replace(s, '');

  if (rules.invariantAfter1a.has(w)) return w;

  // Step 1b
  s = longest(w, ['eed', 'eedly', 'ed', 'edly', 'ing', 'ingly']);
  if (s === 'eed' || s === 'eedly') {
    if (inR1(s)) replace(s, 'ee');
  } else if (s) {
    const before = w.slice(0, w.length - s.length);
    if (/[aeiouy]/.test(before)) {
      w = before;
      if (w.endsWith('at') || w.endsWith('bl') || w.endsWith('iz')) w += 'e';
      else if (DOUBLES.has(w.slice(-2))) w = w.slice(0, -1);
      else if (endsShort(w) && p1 >= w.length) w += 'e';
    }
  }

  // Step 1c
  if (w.length > 2 && (w.endsWith('y') || w.endsWith('Y')) && !isV(w[w.length - 2])) replace('y', 'i');

  // Step 2
  s = longest(w, ['tional', 'enci', 'anci', 'abli', 'entli', 'izer', 'ization', 'ational', 'ation', 'ator',
    'alism', 'aliti', 'alli', 'fulness', 'ousli', 'ousness', 'iveness', 'iviti', 'biliti', 'bli', 'ogi',
    'fulli', 'lessli', 'li']);
  if (s && inR1(s)) {
    const to = {
      tional: 'tion', enci: 'ence', anci: 'ance', abli: 'able', entli: 'ent', izer: 'ize', ization: 'ize',
      ational: 'ate', ation: 'ate', ator: 'ate', alism: 'al', aliti: 'al', alli: 'al', fulness: 'ful',
      ousli: 'ous', ousness: 'ous', iveness: 'ive', iviti: 'ive', biliti: 'ble', bli: 'ble', fulli: 'ful', lessli: 'less',
    };
    if (s === 'alli' && rules.tionalli && w.endsWith('tionalli')) {
      if (w.endsWith('ationalli') && inR1('ationalli')) replace('ationalli', 'ate');
      else replace('alli', '');
    } else if (s in to) replace(s, to[s]);
    else if (s === 'ogi') { if (rules.ogi(w)) replace(s, 'og'); }
    else if (s === 'li' && VALID_LI.has(w[w.length - 3])) replace(s, '');
  }

  // Step 3
  s = longest(w, rules.step3);
  if (s && inR1(s)) {
    const to = { tional: 'tion', ational: 'ate', alize: 'al', icate: 'ic', iciti: 'ic', ical: 'ic', ful: '', ness: '' };
    if (s in to) replace(s, to[s]);
    else if (s === 'ative' && rules.ativeInR(inR1, inR2)) replace(s, '');
  }

  // Step 4
  s = longest(w, ['al', 'ance', 'ence', 'er', 'ic', 'able', 'ible', 'ant', 'ement', 'ment', 'ent', 'ism',
    'ate', 'iti', 'ous', 'ive', 'ize', 'ion']);
  if (s && inR2(s)) {
    if (s !== 'ion') replace(s, '');
    else if ('st'.includes(w[w.length - 4]) && w.length >= 4) replace(s, '');
  }

  // Step 5
  const e = w.endsWith('e');
  if (e && (inR2('e') || (inR1('e') && !endsShort(w.slice(0, -1))))) w = w.slice(0, -1);
  if ((!e || rules.undoubleAfterE) && w.endsWith('ll') && inR2('l')) w = w.slice(0, -1);

  return w.replace(/Y/g, 'y');
}

// The algorithm as Snowball describes it (before 3.0)
export const SNOWBALL = {
  exceptions: EXCEPTIONS,
  invariantAfter1a: INVARIANT_AFTER_1A,
  r1Prefixes: R1_PREFIXES,
  // Step 1a: -ied/-ies → -ie unless more than one letter comes before
  iesToIe: n => n <= 1,
  // Step 1a: delete a final s when a vowel comes before the letter before it
  deleteS: w => /[aeiouy]/.test(w.slice(0, -2)),
  // Step 2: -ogi → -og when preceded by l
  ogi: w => w[w.length - 4] === 'l',
  tionalli: false,
  step3: STEP3,
  // Step 3: -ative is deleted in R2
  ativeInR: (inR1, inR2) => inR2('ative'),
  // Step 5: delete a final e, or else undouble a final ll
  undoubleAfterE: false,
};

// Where Sphinx's stem_en gives other stems than the Snowball description: rules written from
// observed input/output pairs of Sphinx's stem_en (each named with a pair it was seen on).
export const SPHINX = {
  ...SNOWBALL,
  // gas → ga, this → thi, 100s → 100: any final s goes (but not -us or -ss)
  deleteS: () => true,
  // anagogy → anagog: -ogi → -og after any letter
  ogi: () => true,
  // amative → am, talkative → talk: -ative goes in R1
  ativeInR: inR1 => inR1('ative'),
  // anticonventionalism → anticonvention: Step 3 has no -tional/-ational rules
  step3: STEP3.filter(x => x !== 'tional' && x !== 'ational'),
  // arsenal → arsen, communal → commun: only gener- sets R1
  r1Prefixes: ['gener'],
  // aquarelle → aquarel: after the final e goes, ll is undoubled in R2 too
  undoubleAfterE: true,
  // atlas → atla, andes → and, bias → bia, cosmos → cosmo: not exceptions (skis → ski anyway);
  // proceed, exceed and succeed stay as they are, but not their other forms (exceeds → exce)
  exceptions: new Map([
    ...[...EXCEPTIONS].filter(([w]) => !['atlas', 'cosmos', 'bias', 'andes', 'skis'].includes(w)),
    ['proceed', 'proceed'], ['exceed', 'exceed'], ['succeed', 'succeed'],
  ]),
  // herring → her, earring → ear: only inning, outing and canning stay after Step 1a
  invariantAfter1a: new Set(['inning', 'outing', 'canning']),
  // ies → i, ties → tie, cries → cri: -ied/-ies give -ie only after exactly one letter
  iesToIe: n => n === 1,
  // conditionally → condit, relationally → relat, nationally → nation: Step 2 turns -tionalli
  // into -tion, and -ationalli into -ate when -ation is in R1
  tionalli: true,
};

export default snowballStem;
