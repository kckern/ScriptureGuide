import latexRepository from '../../../data/repositories/LatexRepository.js';
import { renderLatex, footnoteIds } from '../../latex/LatexRenderer.js';
import { flag } from '../../formatOptions.js';

// latex.scripture.guide: a LaTeX body fragment (text/plain), ported from PHP inc_latex.php.
// The text comes from the first requested version, as PHP renderRaw did.
export class LatexPresenter {
  constructor(repo = latexRepository) {
    this.repo = repo;
  }

  static textVersion(result) {
    const v = String(result.config?.version || result.version || 'LDS');
    return v.split(/[.,;]/)[0].replace(/\*.*$/, '').toUpperCase() || 'LDS';
  }

  async render(result, req) {
    const verseIds = [...new Set(result.reference?.verseIds || [])];
    if (!verseIds.length) return '';
    const version = LatexPresenter.textVersion(result);

    const raw = await this.repo.rawVerses(verseIds, version);
    const rows = [];
    for (const r of raw) {
      const headings = /[§▲]/u.test(r.text) ? await this.repo.loadHeading(r.verse_id, version) : null;
      rows.push({ verse_id: r.verse_id, format: r.format, text: r.text, headings });
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
