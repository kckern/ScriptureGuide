// Settings schema, defaults, deep-merge, and per-site enable logic.
// Stored in chrome.storage.sync; consumed by the content script, popup, and
// options page. Pure functions (no chrome.* calls) so they are unit-testable.

export const DEFAULTS = {
  enabled: true,
  siteMode: 'blacklist',
  // Seeded from the legacy manifest's exclude_matches (first-party and search
  // sites where auto-linking is redundant or unwanted).
  blacklist: [
    'scripture.guide', '*.scripture.guide',
    'scriptures.info', '*.scriptures.info',
    'isaiahexplained.com', '*.isaiahexplained.com',
    '*.bookofmormon.online',
    '*.churchofjesuschrist.org',
    '*.google.com', '*.bing.com',
    'kckern.info', '*.kckern.info'
  ],
  whitelist: [],
  canon: 'lds',
  language: 'en',
  detection: {
    contextAware: true,
    impliedBooks: true,
    abbreviations: true,
    chapterOnly: true,
    wholeBooks: false
  },
  appearance: {
    linkStyle: 'badge',
    useScriptureFont: true,
    footnoteLinks: true
  },
  click: {
    action: 'popup',
    popupWidth: 1000,
    popupHeight: 750
  }
};

const isPlainObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

// Renamed settings: appearance.useKreonFont (the Kreon badge font, until 2.2.0) is now
// appearance.useScriptureFont. Someone who turned the old option off keeps the new one off;
// once useScriptureFont is stored, it wins. The old key is dropped from the result, so the
// options page does not write it back.
function migrate(stored) {
  const a = stored?.appearance;
  if (!isPlainObject(a) || !('useKreonFont' in a)) return stored;
  const { useKreonFont, ...appearance } = a;
  if (useKreonFont === false && appearance.useScriptureFont === undefined) appearance.useScriptureFont = false;
  return { ...stored, appearance };
}

// Deep-merge stored settings over DEFAULTS: nested objects merge key-by-key,
// arrays and scalars replace wholesale. DEFAULTS is never mutated.
export function mergeSettings(stored = {}) {
  const merge = (base, override) => {
    const out = Array.isArray(base) ? [...base] : { ...base };
    for (const [k, v] of Object.entries(override || {})) {
      if (isPlainObject(v) && isPlainObject(out[k])) {
        out[k] = merge(out[k], v);
      } else if (v !== undefined) {
        out[k] = v;
      }
    }
    return out;
  };
  return merge(DEFAULTS, migrate(stored));
}

// Match a hostname against a pattern. "*.example.com" matches example.com and
// any subdomain; a bare pattern matches exactly.
export function hostMatches(hostname, pattern) {
  if (pattern.startsWith('*.')) {
    const base = pattern.slice(2);
    return hostname === base || hostname.endsWith('.' + base);
  }
  return hostname === pattern;
}

// Whether the extension should run on the given hostname under these settings.
export function siteEnabled(hostname, settings) {
  if (!settings.enabled) return false;
  const inList = (list) => (list || []).some((p) => hostMatches(hostname, p));
  return settings.siteMode === 'whitelist'
    ? inList(settings.whitelist)
    : !inList(settings.blacklist);
}
