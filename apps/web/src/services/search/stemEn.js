// Sphinx's English stemmer (`morphology = stem_en`), ported line by line from src/sphinxstemen.cpp
// of github.com/sphinxsearch/sphinx (2.x; the 3.x source is not published, and the stack workflow
// compares the fallback with 3.x), built without SNOWBALL2011. The port gives the same stem as
// the compiled C code for every ASCII word of the full database and a 235,000-word dictionary.
// It is Porter's algorithm in the Snowball "Porter2" form with Sphinx's own exceptions, and
// differs from Porter (1980) in places, e.g. godly → god, earthly → earth, but holy → holi,
// family → famili; days → day; was → wa, dying → die.
// The MySQL search fallback stems with it so its matches follow the Sphinx index.
// Input is a lowercase ASCII word ([0-9a-z_]); other characters count as consonants.

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u', 'y']);
const DOUBLES = 'bdfgmnprt';
// The letters before a final -li that Step 2 deletes it after (Porter2's valid li-endings)
const LI_ENDINGS = 'bcdeghkmnrt';

// 3-letter shortcuts left as they are, and two the C code cuts to two letters
const KEEP3 = new Set(['the', 'and', 'you', 'for', 'her', 'she', 'but', 'had', 'sky']);
const CUT3 = new Set(['was', 'his']);
const KEEP4 = new Set(['that', 'with', 'said', 'from', 'news', 'howe']);
const EXCEPTIONS = new Map([
  ['proceed', 'proceed'], ['exceed', 'exceed'], ['succeed', 'succeed'],
  ['dying', 'die'], ['lying', 'lie'], ['tying', 'tie'],
  ['inning', 'inning'], ['outing', 'outing'], ['canning', 'canning'],
  ['skies', 'sky'], ['innings', 'inning'], ['outings', 'outing'], ['cannings', 'canning'],
  ['idly', 'idl'], ['gently', 'gentl'], ['ugly', 'ugli'], ['early', 'earli'], ['only', 'onli'], ['singly', 'singl'],
]);

export function stem(input) {
  let len = input.length;
  if (len <= 2) return input;
  if (len === 3) {
    if (KEEP3.has(input)) return input;
    if (CUT3.has(input)) return input.slice(0, 2);
  }
  if (len === 4 && KEEP4.has(input)) return input;
  if (len >= 4 && len <= 8 && EXCEPTIONS.has(input)) return EXCEPTIONS.get(input);

  const word = input.split('');
  const isVowel = i => VOWELS.has(word[i]); // 'Y' (a hidden consonant y) is not a vowel
  const ivwxy = c => VOWELS.has(c) || c === 'w' || c === 'x' || c === 'Y';
  const W = (p, c) => word[len - p] === c;
  // the word ends in `s`
  const suff = s => len >= s.length && [...s].every((c, k) => W(s.length - k, c));
  // the word ends in `s` followed by any one letter (the C code's SUFFnA)
  const suffA = s => len >= s.length + 1 && [...s].every((c, k) => W(s.length + 1 - k, c));

  // hide consonant-style y's
  let hasY = false;
  if (word[0] === 'y') { word[0] = 'Y'; hasY = true; }
  for (let i = 1; i < len; i++) if (word[i] === 'y' && isVowel(i - 1)) { word[i] = 'Y'; hasY = true; }

  // regions: R1 after the first vowel-consonant pair, R2 after the second
  let r1, firstVowel, i;
  if (len >= 5 && input.startsWith('gener')) {
    r1 = 5;
    firstVowel = 1;
  } else {
    for (i = 0; i < len && !isVowel(i); i++);
    firstVowel = i;
    for (i = firstVowel; i < len - 2; i++) if (isVowel(i) && !isVowel(i + 1)) break;
    r1 = i + 2;
  }
  for (i = r1; i < len - 2; i++) if (isVowel(i) && !isVowel(i + 1)) break;
  const r2 = i + 2;

  // Step 1a
  const ied = () => { if (len-- !== 4) len--; };
  switch (word[len - 1]) {
    case 'd':
      if (word[len - 3] === 'i' && word[len - 2] === 'e') ied();
      break;
    case 's':
      if (suff('sses')) len -= 2;
      else if (word[len - 3] === 'i' && word[len - 2] === 'e') ied();
      else if (word[len - 2] !== 'u' && word[len - 2] !== 's') len--;
      break;
  }

  // Step 1b
  let cut = 0;
  switch (word[len - 1]) {
    case 'd':
      if (suffA('ee')) { if (len - 3 >= r1) len--; break; }
      if (word[len - 2] === 'e') cut = 2;
      break;
    case 'y':
      if (word[len - 2] === 'l') {
        if (suffA('eedl')) { if (len - 5 >= r1) len -= 3; break; }
        if (suffA('edl')) { cut = 4; break; }
        if (suffA('ingl')) { cut = 5; break; }
      }
      break;
    case 'g':
      if (suffA('in')) cut = 3;
      break;
  }
  if (cut && firstVowel < len - cut) {
    len -= cut;
    if (suff('at') || suff('bl') || suff('iz')) word[len++] = 'e';
    else if (len >= 2 && word[len - 1] === word[len - 2] && DOUBLES.includes(word[len - 1])) len--;
    else if ((len === 2 && isVowel(0) && !isVowel(1))
      || (len === r1 && !isVowel(len - 3) && isVowel(len - 2) && !ivwxy(word[len - 1]))) {
      word[len++] = 'e';
    }
  }

  // Step 1c
  if (len > 2 && (word[len - 1] === 'y' || word[len - 1] === 'Y') && !isVowel(len - 2)) word[len - 1] = 'i';

  // Step 2
  if (len - 2 >= r1) {
    switch (word[len - 1]) {
      case 'i': {
        if (len >= 3 && (W(2, 'c') || W(2, 'l') || W(2, 't'))) {
          let done = true;
          if (suffA('enc') || suffA('anc') || suffA('abl')) { if (len - 4 >= r1) word[len - 1] = 'e'; }
          else if (suffA('bl')) { if (len - 3 >= r1) word[len - 1] = 'e'; }
          else if (suffA('entl')) { if (len - 5 >= r1) len -= 2; }
          else if (suffA('alit')) { if (len - 5 >= r1) len -= 3; }
          else if (suffA('ousl')) { if (len - 5 >= r1) len -= 2; }
          else if (suffA('ivit')) { if (len - 5 >= r1) { word[len - 3] = 'e'; len -= 2; } }
          else if (suffA('bilit')) { if (len - 6 >= r1) { word[len - 5] = 'l'; word[len - 4] = 'e'; len -= 3; } }
          else if (suffA('full')) { if (len - 5 >= r1) len -= 2; }
          else if (suffA('lessl')) { if (len - 6 >= r1) len -= 2; }
          else done = false;
          if (done) break;
        }
        if (len - 3 >= r1 && suffA('og')) { len -= 1; break; }
        if (len - 2 >= r1 && word[len - 2] === 'l') len -= 2;
        else break;
        if (len - 2 >= r1 && suff('al')) {
          len -= 2;
          if (len - 5 >= r1 && suff('ation')) { len -= 3; word[len++] = 'e'; break; }
          if (suff('tion')) break;
          len += 2;
        } else if (!LI_ENDINGS.includes(word[len - 1])) {
          len += 2;
        }
        break;
      }
      case 'l':
        if (suffA('ationa')) { if (len - 7 >= r1) { word[len - 5] = 'e'; len -= 4; } break; }
        if (suffA('tiona')) { if (len - 6 >= r1) len -= 2; break; }
        break;
      case 'm':
        if (suffA('alis')) { if (len - 5 >= r1) len -= 3; }
        break;
      case 'n':
        if (suffA('izatio')) { if (len - 7 >= r1) { word[len - 5] = 'e'; len -= 4; } break; }
        if (suffA('atio')) { if (len - 5 >= r1) { word[len - 3] = 'e'; len -= 2; } break; }
        break;
      case 'r':
        if (suffA('ize')) { if (len - 4 >= r1) len -= 1; break; }
        if (suffA('ato')) { if (len - 4 >= r1) { word[len - 2] = 'e'; len -= 1; } break; }
        break;
      case 's':
        if (len - 7 >= r1 && (suffA('fulnes') || suffA('ousnes') || suffA('ivenes'))) len -= 4;
        break;
    }
  }

  // Step 3
  if (len - 3 >= r1) {
    switch (word[len - 1]) {
      case 'e':
        if (suffA('aliz')) { if (len - 5 >= r1) len -= 3; break; }
        if (suffA('icat')) { if (len - 5 >= r1) len -= 3; break; }
        if (suffA('ativ')) { if (len - 5 >= r1) len -= 5; break; }
        break;
      case 'i':
        if (suffA('icit')) { if (len - 5 >= r1) len -= 3; }
        break;
      case 'l':
        if (suffA('ica')) { if (len - 4 >= r1) len -= 2; break; }
        if (suffA('fu')) { len -= 3; break; }
        break;
      case 's':
        if (suffA('nes')) { if (len - 4 >= r1) len -= 4; }
        break;
    }
  }

  // Step 4
  if (len - 2 >= r2) {
    switch (word[len - 1]) {
      case 'c':
        if (word[len - 2] === 'i') len -= 2;
        break;
      case 'e':
        if (len - 3 >= r2) {
          if (suffA('anc') || suffA('enc') || suffA('abl') || suffA('ibl')) { if (len - 4 >= r2) len -= 4; break; }
          if (suffA('at') || suffA('iv') || suffA('iz')) { len -= 3; break; }
        }
        break;
      case 'i':
        if (suffA('it')) { if (len - 3 >= r2) len -= 3; }
        break;
      case 'l':
        if (word[len - 2] === 'a') len -= 2;
        break;
      case 'm':
        if (suffA('is')) { if (len - 3 >= r2) len -= 3; }
        break;
      case 'n':
        if (len - 3 >= r2 && suff('ion') && (word[len - 4] === 't' || word[len - 4] === 's')) len -= 3;
        break;
      case 'r':
        if (word[len - 2] === 'e') len -= 2;
        break;
      case 's':
        if (suffA('ou')) { if (len - 3 >= r2) len -= 3; }
        break;
      case 't':
        if (word[len - 2] === 'n') {
          if (suffA('emen')) { if (len - 5 >= r2) len -= 5; break; }
          if (suffA('men')) { if (len - 4 >= r2) len -= 4; break; }
          if (suffA('an')) { if (len - 3 >= r2) len -= 3; break; }
          if (suffA('en')) { if (len - 3 >= r2) len -= 3; break; }
        }
        break;
    }
  }

  // Step 5
  if (word[len - 1] === 'e') {
    if (len > r2) len--;
    else if (len <= r1) { /* keep */ }
    else if (len > 3 && !isVowel(len - 4) && isVowel(len - 3) && !ivwxy(word[len - 2])) { /* keep */ }
    else if (len === 3 && isVowel(0) && !isVowel(1)) { /* keep */ }
    else len--;
  }
  if (len > r2 && word[len - 1] === 'l' && word[len - 2] === 'l') len--;

  const out = word.slice(0, len).join('');
  return hasY ? out.replace(/Y/g, 'y') : out;
}

export default stem;
