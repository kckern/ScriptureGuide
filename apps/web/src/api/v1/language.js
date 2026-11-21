// The ISO 639-1 code for a version's stored language (scripture_versions.lang). The database
// stores Korean as "kr", the country code; add other fixes here as languages are added.
// Unknown values pass through lower-cased; no value is null.
const ISO = Object.freeze({ kr: 'ko' });

export function languageFor(lang) {
  if (lang == null || String(lang).trim() === '') return null;
  const code = String(lang).trim().toLowerCase();
  return ISO[code] ?? code;
}
