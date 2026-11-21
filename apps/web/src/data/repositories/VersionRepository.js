import db from '../db/connection.js';
import { knownVersions } from '../../domain/rules/versionNotice.js';

// The names a version segment may use (versionNotice.knownVersions) from a repository's
// findAll, read once per repository; a failed read is dropped so the next request retries
const knownCache = new WeakMap();
export function knownVersionSet(repo) {
  if (!knownCache.has(repo)) {
    knownCache.set(repo, Promise.resolve().then(() => repo.findAll()).then(knownVersions, err => {
      knownCache.delete(repo);
      throw err;
    }));
  }
  return knownCache.get(repo);
}

export class VersionRepository {
  // The names a version segment may use, read once (knownVersionSet)
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
