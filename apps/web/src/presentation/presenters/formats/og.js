import { HtmlPresenter } from '../HtmlPresenter.js';
import { coverUrl } from '../../coverImage.js';
import { Lru } from '../../og/lru.js';
import { renderCard, renderSiteCard, cardContent } from '../../og/ogCard.js';
import { logError } from '../../../app/log.js';

// /og/<path>.png: the link-preview card (og:image) of the page at /<path>. A CDN caches the
// PNGs; this process keeps the last 200 it drew (as promises, so concurrent requests for one card
// draw it once).
export const ogCache = new Lru(200);
const badges = new Lru(100);
const html = new HtmlPresenter();

export const CACHE_CONTROL = 'public, max-age=86400';
const SITE_KEY = '\0site';

export function sendPng(res, png) {
  res.set('Content-Type', 'image/png');
  res.set('Cache-Control', CACHE_CONTROL);
  res.send(png);
}

// The edition badge (media.scripture.guide/covers/<name>.jpg) as a data URI, or null when it is
// missing. Network failures are not remembered, so a later card can try again.
export async function badgeData(name) {
  if (!name) return null;
  const known = badges.get(name);
  if (known !== undefined) return known;
  try {
    const res = await fetch(coverUrl(name), { signal: AbortSignal.timeout(3000) });
    const type = res.headers?.get?.('content-type') || '';
    const uri = res.ok && type.startsWith('image/')
      ? `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`
      : null;
    badges.set(name, uri);
    return uri;
  } catch {
    return null;
  }
}

// Draw once per key; a failed draw is forgotten.
function cached(key, draw) {
  let png = ogCache.get(key);
  if (!png) {
    png = draw();
    ogCache.set(key, png);
    png.catch(() => ogCache.delete(key));
  }
  return png;
}

export function siteCard() {
  return cached(SITE_KEY, () => renderSiteCard());
}

// Sends the site card; a preview never shows an error.
export async function sendSiteCard(res) {
  try {
    sendPng(res, await siteCard());
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
      const png = await cached(req.ogKey ?? req.path, async () => {
        const data = html.serialize(result);
        const card = cardContent(result, data, html.titleFor(result, data, req));
        if (!card.title || !card.body) return siteCard();
        return renderCard({ ...card, badge: await badgeData(card.badge) });
      });
      sendPng(res, png);
    } catch (err) {
      logError(err, { where: 'og card', path: req.originalUrl });
      return sendSiteCard(res);
    }
  }
}

export default new OgPresenter();
