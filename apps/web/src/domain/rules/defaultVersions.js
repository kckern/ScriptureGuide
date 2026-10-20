// Which versions to try for a passage, from scriptures::setConfigs and
// scriptures::defaultVersions in the PHP site. Versions are ordered lists of
// { version, format }: text comes from the first version that has rows.

// [min, maxExclusive, version]. Each rule tests the passage's min and max verse_id,
// so a passage that crosses a boundary matches neither side.
const DEFAULT_RANGES = [
  [1, 31103, 'LDS'],
  [31103, 37707, 'LDS'],
  [37707, 41361, 'LDS'],
  [41996, 42600, 'LEC'],
  [42600, 73912, 'JST'],
  [73912, 82863, 'TSP'],
  [82863, 83195, 'LAW'],
  [83195, 89431, 'YALI'],
  [91463, 91885, 'GFRONSDAL'],
  [91886, 92585, 'ASITIS'],
  [89431, 90773, '1833'],
  [90773, 99999, '1835'],
  [92587, 92667, 'MITCHELL'],
  [92668, 93382, 'ULOLD'],
];

// Pearl of Great Price: LDS is added to the requested versions, not just as a default.
const PGP_FORCE = [41361, 41996, 'LDS'];

const entry = version => ({ version, format: version });

function add(list, item) {
  if (!list.some(v => v.version === item.version)) list.push(item);
  return list;
}

// LDS goes last so a Bible LDS preference does not override e.g. a 1830 BoM preference.
export function versionOrder(versions = []) {
  const lds = versions.filter(v => v.version === 'LDS');
  return [...versions.filter(v => v.version !== 'LDS'), ...lds];
}

export function defaultVersions(versions = [], verseIds = []) {
  const list = versions.map(v => ({ ...v }));
  if (!verseIds.length) return list;
  let min = Infinity, max = -Infinity;
  for (const id of verseIds) { if (id < min) min = id; if (id > max) max = id; }
  const inRange = ([lo, hi]) => min >= lo && max < hi;

  if (inRange(PGP_FORCE)) add(list, entry(PGP_FORCE[2]));
  for (const range of DEFAULT_RANGES) {
    if (inRange(range)) add(list, entry(range[2]));
  }
  return list;
}

export default defaultVersions;
