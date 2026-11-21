import db from '../db/connection.js';
import { knownVersions } from '../../domain/rules/versionNotice.js';

// The names a version segment may use (versionNotice.knownVersions) from a repository's
// findAll, read once per repository and kept for an hour, so a version added to
// scripture_versions gets no "There is no version" note after at most that long. A failed read
// is dropped so the next request retries.
export const KNOWN_TTL_MS = 60 * 60 * 1000;
const knownCache = new WeakMap(); // repo → { at, promise }
export function knownVersionSet(repo, now = Date.now) {
  const hit = knownCache.get(repo);
  if (hit && now() - hit.at < KNOWN_TTL_MS) return hit.promise;
  const entry = { at: now() };
  entry.promise = Promise.resolve().then(() => repo.findAll()).then(knownVersions, err => {
    if (knownCache.get(repo) === entry) knownCache.delete(repo);
    throw err;
  });
  knownCache.set(repo, entry);
  return entry.promise;
}

export class VersionRepository {
  // The names a version segment may use, cached for an hour (knownVersionSet)
  knownVersions() {
    return knownVersionSet(this);
  }

  async findAll() {
    const rows = await db.query(
      `SELECT id, title, title_long, lang, priority, volumes, audio, searchable
       FROM scripture_versions
       ORDER BY priority, title`
    );

    return rows;
  }

  async findByCode(versionCode) {
    const rows = await db.query(
      `SELECT id, title, title_long, lang, priority, volumes, audio, searchable
       FROM scripture_versions
       WHERE id = ?`,
      [versionCode]
    );

    return rows[0] || null;
  }

  async findByVolume(volume) {
    const rows = await db.query(
      `SELECT DISTINCT v.id, v.title, v.title_long, v.lang, v.priority
       FROM scripture_versions v
       INNER JOIN scripture_verses sv ON v.id = sv.version
       WHERE v.volumes LIKE ?
       ORDER BY v.priority, v.title`,
      [`%${volume}%`]
    );

    return rows;
  }
}

export default new VersionRepository();
