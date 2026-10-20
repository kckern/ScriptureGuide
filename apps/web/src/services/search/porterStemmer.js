// Porter (1980) English stemmer, the algorithm behind Sphinx's `morphology = stem_en`.
// Used by the MySQL search fallback so that its matches follow the Sphinx index's
// stemming (faith ~ faithful, charity ~ charities). Input is a lowercase ASCII word.

const isConsonant = (w, i) => {
  const c = w[i];
  if ('aeiou'.includes(c)) return false;
  if (c === 'y') return i === 0 ? true : !isConsonant(w, i - 1);
  return true;
};

// m(): number of VC sequences in w[0..j]
function measure(w, j) {
  let n = 0, i = 0;
  while (true) { if (i > j) return n; if (!isConsonant(w, i)) break; i++; }
  i++;
  while (true) {
    while (true) { if (i > j) return n; if (isConsonant(w, i)) break; i++; }
    i++; n++;
    while (true) { if (i > j) return n; if (!isConsonant(w, i)) break; i++; }
    i++;
  }
}

const hasVowel = (w, j) => { for (let i = 0; i <= j; i++) if (!isConsonant(w, i)) return true; return false; };
const doubleC = (w, j) => j >= 1 && w[j] === w[j - 1] && isConsonant(w, j);
const cvc = (w, i) => {
  if (i < 2 || !isConsonant(w, i) || isConsonant(w, i - 1) || !isConsonant(w, i - 2)) return false;
  return !'wxy'.includes(w[i]);
};

export function stem(word) {
  let w = word;
  if (w.length <= 2) return w;

  const ends = s => w.endsWith(s);
  const stemEnd = s => w.length - s.length - 1; // index of last char before suffix s
  const setTo = (s, r) => { w = w.slice(0, w.length - s.length) + r; };
  const r = (s, rep) => { if (measure(w, stemEnd(s)) > 0) setTo(s, rep); };

  // Step 1a
  if (ends('sses')) setTo('sses', 'ss');
  else if (ends('ies')) setTo('ies', 'i');
  else if (ends('ss')) { /* keep */ }
  else if (ends('s')) setTo('s', '');

  // Step 1b
  let extra = false;
  if (ends('eed')) { if (measure(w, stemEnd('eed')) > 0) setTo('eed', 'ee'); }
  else if (ends('ed') && hasVowel(w, stemEnd('ed'))) { setTo('ed', ''); extra = true; }
  else if (ends('ing') && hasVowel(w, stemEnd('ing'))) { setTo('ing', ''); extra = true; }
  if (extra) {
    if (ends('at')) setTo('at', 'ate');
    else if (ends('bl')) setTo('bl', 'ble');
    else if (ends('iz')) setTo('iz', 'ize');
    else if (doubleC(w, w.length - 1)) { if (!'lsz'.includes(w[w.length - 1])) w = w.slice(0, -1); }
    else if (measure(w, w.length - 1) === 1 && cvc(w, w.length - 1)) w += 'e';
  }

  // Step 1c
  if (ends('y') && hasVowel(w, w.length - 2)) w = w.slice(0, -1) + 'i';

  // Step 2
  const step2 = [
    ['ational', 'ate'], ['tional', 'tion'], ['enci', 'ence'], ['anci', 'ance'], ['izer', 'ize'],
    ['bli', 'ble'], ['alli', 'al'], ['entli', 'ent'], ['eli', 'e'], ['ousli', 'ous'],
    ['ization', 'ize'], ['ation', 'ate'], ['ator', 'ate'], ['alism', 'al'], ['iveness', 'ive'],
    ['fulness', 'ful'], ['ousness', 'ous'], ['aliti', 'al'], ['iviti', 'ive'], ['biliti', 'ble'], ['logi', 'log'],
    // Not in Porter (1980), but the live index stems "faithfully" with "faith": /faith returns 811 verses
    // there, and exactly 811 here only with this rule.
    ['fulli', 'ful'],
  ];
  for (const [s, rep] of step2) if (ends(s)) { r(s, rep); break; }

  // Step 3
  const step3 = [['icate', 'ic'], ['ative', ''], ['alize', 'al'], ['iciti', 'ic'], ['ical', 'ic'], ['ful', ''], ['ness', '']];
  for (const [s, rep] of step3) if (ends(s)) { r(s, rep); break; }

  // Step 4
  const step4 = ['al', 'ance', 'ence', 'er', 'ic', 'able', 'ible', 'ant', 'ement', 'ment', 'ent',
    'ion', 'ou', 'ism', 'ate', 'iti', 'ous', 'ive', 'ize'];
  for (const s of step4) {
    if (!ends(s)) continue;
    // 'ment' and 'ent' are only tried when the longer suffix did not apply
    if (s === 'ion') { const j = stemEnd(s); if (j >= 0 && 'st'.includes(w[j]) && measure(w, j) > 1) setTo(s, ''); }
    else if (measure(w, stemEnd(s)) > 1) setTo(s, '');
    break;
  }

  // Step 5a
  if (ends('e')) {
    const a = measure(w, w.length - 2);
    if (a > 1 || (a === 1 && !cvc(w, w.length - 2))) w = w.slice(0, -1);
  }
  // Step 5b
  if (ends('ll') && measure(w, w.length - 1) > 1) w = w.slice(0, -1);

  return w;
}

export default stem;
