import annotationRepository from '../../../data/repositories/AnnotationRepository.js';
import { renderNotesPage, wordAnnotations, verseIdOf } from '../../notes/NotesPage.js';
import { option } from '../../formatOptions.js';

// notes.scripture.guide/<verse_id>-<nnnn>[?source=a,b]: commentary notes on one word.
// The path is a word id, not a reference; the lookup result is not used.
export class NotesPresenter {
  constructor(repo = annotationRepository) {
    this.repo = repo;
  }

  static wordIdFrom(req) {
    const raw = req.params?.reference ?? (req.path || '').replace(/^\//, '');
    try { return decodeURIComponent(raw); } catch { return raw; }
  }

  async render(req, browser) {
    const wordId = NotesPresenter.wordIdFrom(req);
    const verseId = verseIdOf(wordId);
    const source = option(req, 'source');
    const sources = source && source !== 1 ? String(source).split(',') : null;

    const numeric = /^\d+$/.test(verseId);
    const ref = numeric ? await this.repo.referenceFor(verseId) : '';
    const index = numeric ? await this.repo.indexForVerses([Number(verseId)], sources) : [];
    const noteIds = wordAnnotations(index)[verseId]?.word?.[wordId] || [];
    const notes = await this.repo.notesByIds([...new Set(noteIds)]);
    return renderNotesPage({ ref, notes, browser });
  }

  async present(result, req, res) {
    const html = await this.render(req, res.locals?.browserClass || 'ie');
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }
}

export default new NotesPresenter();
