import volumeRepository from '../../../data/repositories/VolumeRepository.js';
import { versionIMG, coverUrl } from '../../coverImage.js';

// cover.scripture.guide. The PHP inc_cov.php was empty; the covers are static images at
// media.scripture.guide/covers/<name>.jpg. Requests redirect (302) there:
//   /<reference> or /<version>/<reference>  → the cover of the passage's version
//                                             (LDS: one cover per volume)
//   /<name>[.jpg|.png]                       → that cover by name (the HTML page's og:image
//                                             links use cover.scripture.guide/<versionIMG>)
//   /logo.png                                → served from public/ by the static middleware

export function coverName(path) {
  let name = String(path || '').replace(/^\/+/, '').replace(/\.(jpg|png)$/i, '');
  try { name = decodeURIComponent(name); } catch { /* keep raw */ }
  return name.replace(/\*.*$/, '').toLowerCase();
}

function redirectByName(req, res) {
  const name = coverName(req.path);
  if (!name) return res.redirect(302, '/logo.png');
  return res.redirect(302, coverUrl(name));
}

// Host-level handler for cover.scripture.guide: names without digits are cover names, not
// references (they would otherwise be treated as a search). Everything else goes on to the
// normal reference lookup, ending in present() below.
export function coverRequest(req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (!/\d/.test(req.path)) return redirectByName(req, res);
  return next();
}

export class CoverPresenter {
  constructor(repo = volumeRepository) {
    this.repo = repo;
  }

  async imageFor(result) {
    const verseIds = result?.reference?.verseIds || [];
    if (!verseIds.length) return null;
    const version = String(result.config?.version || result.version || 'LDS').split(/[.,;]/)[0].toUpperCase();
    const volumeId = version === 'LDS' ? await this.repo.volumeIdOf(verseIds) : null;
    return versionIMG(version, volumeId ?? 3);
  }

  async present(result, req, res) {
    const img = await this.imageFor(result);
    if (!img) return redirectByName(req, res);
    return res.redirect(302, coverUrl(img));
  }
}

export default new CoverPresenter();
