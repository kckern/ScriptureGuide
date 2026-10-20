// Cover images: static files at https://media.scripture.guide/covers/<name>.jpg. The name for a
// version and volume is versionImg in domain/rules/legacyReference.js.
export const COVER_BASE = (process.env.COVER_MEDIA_BASE || 'https://media.scripture.guide/covers').replace(/\/+$/, '');

export const coverUrl = name => `${COVER_BASE}/${encodeURIComponent(name)}.jpg`;

export default coverUrl;
