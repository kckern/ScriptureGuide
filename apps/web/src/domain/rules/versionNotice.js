// The note a passage page shows when its version segment names a version the site does not have
// ("/hbrs/isa.49"): the page falls back to the default version, and says so.
//
// A piece of the segment is understood when it is a version id (scripture_versions), a volume
// word (a version's "volumes", or one SearchService.volumeRange reads), an edition year the
// parallel page reads (ParallelService EDITION_YEARS) or the FLAT format.

// SearchService.volumeRange's volume words, spelled out
const VOLUME_WORDS = /^(bible|ot|nt|bo*m|dc|pgp|lecf?|jst|tsp|law|kora*n*|qura*n*|bo*c|1833|1835(dc)?|dp|bg|sbom)$/i;
// ParallelService EDITION_YEARS (1853 has no version row)
const EDITION_YEARS = ['1830', '1829', '1833', '1853', '1837', '1840', '1841', '1879', '1920', '1981', '2013'];

// The upper-cased names a version segment may use, from scripture_versions rows { id, volumes }
export function knownVersions(rows) {
  const known = new Set(['FLAT', ...EDITION_YEARS]);
  for (const { id, volumes } of rows) {
    known.add(String(id).toUpperCase());
    for (const word of String(volumes || '').split(/[,.]/)) if (word.trim()) known.add(word.trim().toUpperCase());
  }
  return known;
}

// The pieces of a parsed version list ([{ version, format }]) that name nothing the site knows
export function unknownVersions(versions, known) {
  const out = [];
  for (const { version, format } of versions || []) {
    for (const name of new Set([version, format])) {
      if (name && !known.has(name) && !VOLUME_WORDS.test(name) && !out.includes(name)) out.push(name);
    }
  }
  return out;
}

// The versions whose text the page shows: each passage's (or section's) with verses, once
export function shownVersions(result) {
  const parts = result.sections?.length ? result.sections : [result];
  const out = [];
  for (const part of parts) {
    const version = part.config?.version;
    if (part.verses?.length && version && version !== 'INDEX' && !out.includes(version)) out.push(version);
  }
  return out;
}

const list = (items, word) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} ${word} ${items[items.length - 1]}` : items[0]);

// 'There is no version "HBRS". Showing LDS.', or null when every version is known
export function versionNote(unknown, shown) {
  if (!unknown.length) return null;
  const note = `There is no version ${list(unknown.map(v => `"${v}"`), 'or')}.`;
  return shown.length ? `${note} Showing ${list(shown, 'and')}.` : note;
}
