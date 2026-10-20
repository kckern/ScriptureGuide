import VerseSerializer from '../../serializers/VerseSerializer.js';

export class ApiPresenter {
  present(result, req, res) {
    const data = this.serialize(result);
    res.json(data);
  }

  serialize(result) {
    return {
      reference: result.reference.normalized,
      version: result.version,
      verses: result.verses.map(v => VerseSerializer.forJson(v)),
      meta: {
        query: result.reference.query,
        volume: result.reference.volume,
        verseCount: result.verseCount,
        wordCount: result.wordCount
      }
    };
  }
}

export default new ApiPresenter();
