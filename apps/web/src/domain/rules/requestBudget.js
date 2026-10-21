// What one request may resolve: reference pieces looked up (ScriptureLookupService.splitBlocks
// and LegacyBlockService share them), verses listed, and database queries for the PHP blocks.
// Past a limit the rest reads as not found, so a long junk URL costs a bounded amount of work.
// memo() caches lookups (chapter maxima) for the request.
export class RequestBudget {
  constructor({ pieces = 100, verses = 5000, queries = 500 } = {}) {
    this.pieces = pieces;
    this.verses = verses;
    this.queries = queries;
    this.cache = new Map();
  }

  takePiece() {
    if (this.pieces <= 0) return false;
    this.pieces--;
    return true;
  }

  takeVerses(n) {
    if (n > this.verses) return false;
    this.verses -= n;
    return true;
  }

  takeQuery() {
    if (this.queries <= 0) return false;
    this.queries--;
    return true;
  }

  memo(key, compute) {
    if (!this.cache.has(key)) this.cache.set(key, compute());
    return this.cache.get(key);
  }
}

export default RequestBudget;
