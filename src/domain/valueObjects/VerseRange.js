export class VerseRange {
  constructor(start, end) {
    if (!Number.isInteger(start) || !Number.isInteger(end)) {
      throw new Error('VerseRange requires integer start and end');
    }
    if (end < start) {
      throw new Error('Invalid range: end must be >= start');
    }
    if (start < 1) {
      throw new Error('Invalid range: start must be >= 1');
    }

    this.start = start;
    this.end = end;
    Object.freeze(this);
  }

  expand() {
    const ids = [];
    for (let i = this.start; i <= this.end; i++) {
      ids.push(i);
    }
    return ids;
  }

  get length() {
    return this.end - this.start + 1;
  }

  contains(verseId) {
    return verseId >= this.start && verseId <= this.end;
  }

  overlaps(other) {
    return this.start <= other.end && other.start <= this.end;
  }

  toString() {
    return `${this.start}-${this.end}`;
  }
}

export default VerseRange;
