import { HtmlPresenter } from '../HtmlPresenter.js';
import { coverUrl } from '../../coverImage.js';
import { Lru } from '../../og/lru.js';
import { renderCard, renderSiteCard, cardContent } from '../../og/ogCard.js';
import { logError } from '../../../app/log.js';

// /og/<path>.jpg: the link-preview card (og:image) of the page at /<path>. A CDN caches the
// JPEGs; this process keeps the last 200 it drew, as promises of { jpg, maxAge } so concurrent
// requests for one card draw it once.
export const ogCache = new Lru(200);
export const badgeCache = new Lru(100);
const html = new HtmlPresenter();

export const DAY = 86400;
// A card drawn without its badge because media.scripture.guide failed (network error, 5xx):
// kept five minutes here and at the CDN, then drawn again.
export const RETRY = 300;
const SITE_KEY = '\0site';

export function sendJpeg(res, { jpg, maxAge = DAY }) {
  res.set('Content-Type', 'image/jpeg');
  res.set('Cache-Control', `public, max-age=${maxAge}`);
  res.send(jpg);
}

// The edition badge (media.scripture.guide/covers/<name>.jpg) as { uri, failed }: uri is a data
// URI, or null when the badge is missing (remembered) or could not be fetched (failed: a network
// error or 5xx, not remembered, so a later card can try again).
export async function badgeData(name) {
  if (!name) return { uri: null, failed: false };
  const known = badgeCache.get(name);
  if (known !== undefined) return { uri: known, failed: false };
  try {
    const res = await fetch(coverUrl(name), { signal: AbortSignal.timeout(3000) });
    if (res.status >= 500) return { uri: null, failed: true };
    const type = res.headers?.get?.('content-type') || '';
    const uri = res.ok && type.startsWith('image/')
      ? `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`
      : null;
    badgeCache.set(name, uri);
    return { uri, failed: false };
  } catch {
    return { uri: null, failed: true };
  }
}

// The card for key from the cache, else drawn by draw() (a promise of { jpg, maxAge }). An entry
// lives until the LRU drops it or, for a short maxAge, until it expires. A failed draw is forgotten.
export function cached(key, draw) {
  const entry = ogCache.get(key);
  if (entry && !(entry.expires <= Date.now())) return entry.card;
  const card = draw();
  const fresh = { card, expires: undefined };
  ogCache.set(key, fresh);
  card.then(
    c => { if (c.maxAge < DAY) fresh.expires = Date.now() + c.maxAge * 1000; },
    () => { if (ogCache.get(key) === fresh) ogCache.delete(key); },
  );
  return card;
}

// The card cached for key, or null.
export function cachedCard(key) {
  const entry = ogCache.get(key);
  return entry && !(entry.expires <= Date.now()) ? entry.card : null;
}

export function siteCard() {
  return cached(SITE_KEY, async () => ({ jpg: await renderSiteCard(), maxAge: DAY }));
}

// Sends the site card; a preview never shows an error.
export async function sendSiteCard(res) {
  try {
    sendJpeg(res, await siteCard());
  } catch (err) {
    logError(err, { where: 'og site card' });
    if (!res.headersSent) res.status(500).send('Internal error');
  }
}

export class OgPresenter {
  // result: the lookup of the page; req.ogKey: the card's cache key (its path)
  async present(result, req, res) {
    try {
      if (!result?.verses?.length) return await sendSiteCard(res);
      const card = await cached(req.ogKey ?? req.path, async () => {
        const data = html.serialize(result);
        const content = cardContent(result, data, html.titleFor(result, data, req));
        if (!content.title || !content.body) return siteCard();
        const badge = await badgeData(content.badge);
        return { jpg: await renderCard({ ...content, badge: badge.uri }), maxAge: badge.failed ? RETRY : DAY };
      });
      sendJpeg(res, card);
    } catch (err) {
      logError(err, { where: 'og card', path: req.originalUrl });
      return sendSiteCard(res);
    }
  }
}

export default new OgPresenter();
