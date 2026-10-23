import latexRepository from '../../../data/repositories/LatexRepository.js';
import { renderLatex, footnoteIds } from '../../latex/LatexRenderer.js';
import { flag } from '../../formatOptions.js';

// latex.scripture.guide: a LaTeX body fragment (text/plain), ported from PHP inc_latex.php.
// Each block's text comes from the version its lookup resolved, as html and plain do. PHP read
// renderRaw's data, the request's version only (LDS), and so dropped JST verses ("/jst.john.3.16"
// was empty); fixed rather than copied (decision 2026-10-23).
export class LatexPresenter {
  constructor(repo = latexRepository) {
    this.repo = repo;
  }

  // The version a block's lookup resolved ("kjv*mev.rebom" → KJV), else LDS
  static textVersion(result) {
    const v = String(result.config?.version || result.version || 'LDS');
    return v.split(/[.,;]/)[0].replace(/\*.*$/, '').toUpperCase() || 'LDS';
  }

  async render(result, req) {
    const blocks = result.sections?.length ? result.sections : [result];
    if (!blocks.some(b => b.reference?.verseIds?.length)) return '';
    const rows = [];
    const seen = new Set();
    for (const block of blocks) {
      const verseIds = [...new Set(block.reference?.verseIds || [])].filter(id => !seen.has(id));
      if (!verseIds.length) continue;
      const version = LatexPresenter.textVersion(block);
      for (const r of await this.repo.rawVerses(verseIds, version)) {
        if (seen.has(r.verse_id)) continue;
        seen.add(r.verse_id);
        const headings = /[§▲]/u.test(r.text) ? await this.repo.loadHeading(r.verse_id, version) : null;
        rows.push({ verse_id: r.verse_id, format: r.format, text: r.text, headings });
      }
    }
    rows.sort((a, b) => a.verse_id - b.verse_id);

    const ids = rows.map(r => r.verse_id);
    const notes = await this.repo.footnotes(footnoteIds(rows));
    const noteVerseIds = [...notes.values()].map(n => n.verse_id);
    const [info, levels] = await Promise.all([
      this.repo.verseInfo([...new Set([...ids, ...noteVerseIds])]),
      this.repo.headingLevels(ids),
    ]);

    return renderLatex(rows, {
      slides: flag(req, 'slides'),
      chapterKey: id => {
        const v = info.get(id);
        return v ? `${v.book_id}.${v.chapter}` : null;
      },
      verseRef: id => info.get(id) || null,
      level: (id, type) => levels.get(`${id}:${type}`) ?? null,
      footnote: id => notes.get(String(id)) || null,
    });
  }

  async present(result, req, res) {
    const body = await this.render(result, req);
    res.set('Content-Type', 'text/plain; charset=UTF-8');
    res.send(body);
  }
}

export default new LatexPresenter();
