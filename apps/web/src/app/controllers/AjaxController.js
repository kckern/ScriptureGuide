import { isEmptyReference } from '../../domain/rules/requestParsing.js';
import legacyBlockService from '../../services/LegacyBlockService.js';
import { plainFor } from '../../presentation/presenters/formats/plain.js';
import { escapeHtml } from '../../domain/rules/legacyText.js';
import scriptureLookupService from '../../services/ScriptureLookupService.js';
import referenceService from '../../services/ReferenceService.js';
import verseboxRepository from '../../data/repositories/VerseboxRepository.js';
import HtmlPresenter from '../../presentation/presenters/HtmlPresenter.js';
import { renderVersebox } from '../../presentation/ajax/versebox.js';
import { renderVersionSelect } from '../../presentation/ajax/versionSelect.js';
import { renderSettings, SETTINGS_VOLUMES } from '../../presentation/ajax/settings.js';
import {
  flattenText, transposeRef, baseVersion, highlightSearchTerm,
} from '../../domain/rules/legacyText.js';
import { referenceFromRows, slugifyRef, versionImg } from '../../domain/rules/legacyReference.js';
import { logError } from '../log.js';

// The PHP site's AJAX endpoints: vbox (versebox.php), passage (passage_script.php),
// versionselect (version_select.php), settings (settings.php) and save_prefs (save.php).
// Like the PHP, each reads its parameters from the query string or the form body.
const params = req => ({ ...(req.query || {}), ...(req.body || {}) });
const str = v => (Array.isArray(v) ? v[0] : v) ?? '';

export class AjaxController {
  constructor({ lookup, references, repo, presenter, render, blocks = legacyBlockService }) {
    this.lookup = lookup;
    this.blocks = blocks;
    this.references = references;
    this.repo = repo;
    this.presenter = presenter;
    this.render = render;
  }

  renderView(req, view, locals) {
    if (this.render) return this.render(view, locals);
    return new Promise((resolve, reject) =>
      req.app.render(view, locals, (err, html) => (err ? reject(err) : resolve(html))));
  }

  send(res, html) {
    res.type('html').send(html);
  }

  fail(res, err) {
    const req = res.req;
    logError(err, { where: 'ajax', method: req?.method, path: req?.originalUrl });
    if (!res.headersSent) res.status(500).type('html').send('');
  }

  // GET|POST /versionselect — covers for the other versions of a reference.
  async versionSelect(req, res) {
    try {
      const p = params(req);
      const ver = baseVersion(str(p.ver));
      // A reference without verses: PHP queried verse_id = '', which MySQL compares as 0
      // (scripture_verses has rows at verse id 0), so the covers for verse 0 are listed.
      const parsed = this.references.parse(str(p.ref)).verseIds;
      const verseIds = parsed.length ? parsed : [0];
      const [versions, volumeId] = await Promise.all([
        this.repo.findAvailableVersions(verseIds),
        this.repo.findVolumeId(verseIds),
      ]);
      const options = versions
        .filter(v => v.id !== ver)
        .map(v => ({ ...v, img: versionImg(v.id, volumeId) }));
      this.send(res, renderVersionSelect(options, str(p.seq)));
    } catch (err) { this.fail(res, err); }
  }

  // GET|POST /passage — one passage without page chrome, used to switch versions in place.
  async passage(req, res) {
    try {
      const p = params(req);
      const version = str(p.version);
      let ref = str(p.ref);
      // options[start]..options[end]: expand to the verse range (the section a heading covers)
      const start = parseInt(p.options?.start, 10);
      const end = parseInt(p.options?.end, 10);
      if (Number.isFinite(start) && Number.isFinite(end) && end >= start && end - start < 2000) {
        const ids = [];
        for (let i = start; i <= end; i++) ids.push(i);
        ref = referenceFromRows(await this.repo.findVerseMeta(ids), 'book_title');
      }
      ref = transposeRef(ref, version);
      // hversion (heading/format version) is not separate in the Node lookup yet; text version wins.
      const config = { version: baseVersion(version) || 'LDS', includeHeadings: true, includeVerseNumbers: true };
      const result = await this.lookup.lookup(ref, config);
      const data = this.presenter.serialize(result);
      singleHeading(data);
      let html = await this.renderView(req, 'partials/passage', { data, config: result.config });
      html = html.replace(/<h3\b/gi, "<h4 class='filler'></h4><h3");
      this.send(res, highlightSearchTerm(html, str(p.searchterm)));
    } catch (err) { this.fail(res, err); }
  }

  // The original verse panel: live looked the raw verse_id up as a reference in plain text
  // (scriptures::lookup($verse_id, plain)). A verse id is that verse's text; an empty one, or one
  // that is not a number, is its PHP blocks ("abc" → "Abc" and "No scripture verses found.").
  async originalText(raw, ver, ownText) {
    if (/^\d+$/.test(raw) && !isEmptyReference(raw)) return flattenText(ownText[0]?.text || '').trim();
    // escaped: it echoes the request (the PHP site reflected it raw)
    return escapeHtml(await plainFor(await this.blocks.blocks(isEmptyReference(raw) ? '' : raw), { [ver]: ver }));
  }

  // versebox.php chapterSlug: scriptutil::determineChapter named the chapter of a verse with
  // referenceFromVerseIds over the verse ids of "<book_title> <chapter>" (book_title_short):
  // "Gen. 22", but "D&C 13:1" (one verse) and "Dhpada 2:21–32" (verses numbered across chapters).
  // "book_id|chapter" → reference, for the chapters of the given verse rows.
  async chapterReferences(rows) {
    const chapters = [...new Map(rows.map(r => [`${r.book_id}|${r.chapter}`, r])).entries()];
    const idLists = await Promise.all(chapters.map(async ([, r]) =>
      (await this.blocks.blocks(`${r.book_title} ${r.chapter}`)).flatMap(b => (Array.isArray(b.verse_ids) ? b.verse_ids : []))));
    const all = [...new Set(idLists.flat())];
    const meta = all.length ? await this.repo.findVerseMeta(all) : [];
    return new Map(chapters.map(([key], i) => [key, referenceFromRows(meta, 'book_title_short', idLists[i])]));
  }

  // GET|POST /vbox — the verse analysis box (versions, references, comparison).
  async vbox(req, res) {
    try {
      const p = params(req);
      // MySQL read PHP's quoted verse_id by its leading digits, and a non-numeric one as 0.
      const verseId = parseInt(str(p.verse_id), 10) || 0;
      const ver = baseVersion(str(p.ver) || 'LDS');
      const seq = str(p.seq);
      const prefs = req.cookies?.sg_user ? await this.repo.findPrefs(req.cookies.sg_mail) : null;
      const panelPref = prefs?.options?.verpanel;

      const [verse, versions, faxes, refRows] = await Promise.all([
        this.repo.findVerse(verseId),
        this.repo.findEnglishVersions(verseId),
        this.repo.findFaxVersions(verseId),
        this.repo.findReferences(verseId),
      ]);

      // Group consecutive source verses into one reference (Gen. 22:1–14)
      const groups = [];
      let lastId = null;
      for (const r of refRows) {
        if (lastId === null || r.verse_id !== lastId + 1) groups.push([]);
        groups[groups.length - 1].push(r);
        lastId = r.verse_id;
      }
      const refIds = groups.flatMap(g => rangeIds(g[0].verse_id, g[g.length - 1].verse_id));
      const [meta, texts, ownText] = await Promise.all([
        this.repo.findVerseMeta(verse ? [verseId, ...refIds] : refIds),
        this.repo.findTexts(refIds, ver),
        verse ? this.repo.findTexts([verseId], ver) : [],
      ]);
      const metaById = new Map(meta.map(m => [m.verse_id, m]));
      const textById = new Map(texts.map(t => [t.verse_id, t]));
      const chapterIds = [verseId, ...groups.map(g => g[g.length - 1].verse_id), ...versions.map(v => v.verse_id)];
      const chapters = await this.chapterReferences(chapterIds.map(id => metaById.get(id)).filter(Boolean));
      const chapterSlug = id => {
        const m = metaById.get(id);
        return m ? slugifyRef(chapters.get(`${m.book_id}|${m.chapter}`)) : '';
      };

      const refs = groups.map(group => {
        const first = group[0];
        const last = group[group.length - 1];
        const ids = rangeIds(first.verse_id, last.verse_id);
        const ref = referenceFromRows(ids.map(id => metaById.get(id)).filter(Boolean), 'book_title_short');
        const version = String(textById.get(first.verse_id)?.version || '');
        let text;
        if (group.length > 1) {
          text = group.map(item => {
            const cls = Number(item.significant) === -1 ? " class='dim'" : '';
            return `<span${cls}> ${flattenText(textById.get(item.verse_id)?.text || '')}</span> `;
          }).join('');
        } else {
          text = flattenText(textById.get(first.verse_id)?.text || '').trim();
        }
        return { verseId: last.verse_id, type: last.type, version, ref, slug: slugifyRef(ref), chapter: chapterSlug(last.verse_id), text };
      });

      const volumeId = verse?.volume_id;
      const faxSet = new Set(faxes.map(f => String(f).toLowerCase()));
      const refCount = refs.length;
      const model = {
        seq,
        verseId: str(p.verse_id),
        title: verse?.verse_title || '',
        verCount: versions.length,
        refCount,
        verLead: (refCount < 1 || panelPref === 'ver' || !panelPref) ? 1 : 0,
        refLead: (refCount >= 1 && panelPref === 'ref') ? 1 : 0,
        original: {
          ver: ver.toLowerCase(),
          title: verse?.verse_title || '',
          titleShort: verse?.verse_title_short || '',
          chapter: chapterSlug(verseId),
          text: await this.originalText(str(p.verse_id), ver, ownText),
        },
        refs,
        refslug: verse ? slugifyRef(referenceFromRows([metaById.get(verseId)].filter(Boolean), 'book_title')) : '',
        versions: versions.map(v => ({
          version: v.version,
          verseId: v.verse_id,
          img: versionImg(v.version, volumeId),
          fax: faxSet.has(String(v.version).toLowerCase()),
          chapter: chapterSlug(v.verse_id),
          text: flattenText(v.text),
        })),
      };
      this.send(res, renderVersebox(model));
    } catch (err) { this.fail(res, err); }
  }

  // GET|POST /settings — the preferences form. Anonymous visitors get the defaults.
  async settings(req, res) {
    try {
      const c = req.cookies || {};
      const prefs = c.sg_mail ? await this.repo.findPrefs(c.sg_mail) : null;
      const lists = await Promise.all(SETTINGS_VOLUMES.map(v => this.repo.findAvailableVersions([v.verseId])));
      const versionsByVol = Object.fromEntries(SETTINGS_VOLUMES.map((v, i) => [v.vol, lists[i]]));
      this.send(res, renderSettings({ user: { name: c.sg_user, mail: c.sg_mail, face: c.sg_face }, prefs, versionsByVol }));
    } catch (err) { this.fail(res, err); }
  }

  // GET|POST /save_prefs — intentionally a no-op.
  // save.php upserted user_prefs for whatever address the request named, with no login check
  // and with the values interpolated into SQL (injectable). Until the site has a real login
  // model this endpoint accepts the request and stores nothing. Like save.php it answers with
  // an empty body when no user is named; otherwise PHP echoed a debug dump, which is dropped.
  async savePrefs(req, res) {
    res.type('html').send('');
  }
}

function rangeIds(a, b) {
  const ids = [];
  for (let i = a; i <= b; i++) ids.push(i);
  return ids;
}

// passage_script.php sets single_heading: only the first section heading is drawn. A headless
// (synthetic) heading carries the passage reference as its text, as on the PHP site.
//
// The PHP single_heading code also dropped the first verse (or verse part) of every later
// section along with its heading (Matthew 5 lost 5:13, 5:17, 5:21, …). That loses scripture
// text when switching versions, so it is not reproduced; see test/parity/allow.json.
function singleHeading(data) {
  const first = data.verses.find(v => data.h3ByVerse[v.id]);
  for (const id of Object.keys(data.h3ByVerse)) {
    if (!first || Number(id) !== first.id) delete data.h3ByVerse[id];
  }
  const h = first && data.h3ByVerse[first.id];
  if (h && h.synthetic && h.ref) h.text = h.ref;
}

export function createAjaxController(deps = {}) {
  return new AjaxController({
    lookup: scriptureLookupService,
    references: referenceService,
    repo: verseboxRepository,
    presenter: new HtmlPresenter(),
    ...deps,
  });
}

export default AjaxController;
