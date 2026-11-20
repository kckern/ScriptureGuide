// A small least-recently-used map: get() marks an entry used, set() drops the oldest past max.
export class Lru {
  constructor(max) {
    this.max = max;
    this.map = new Map();
  }

  get(key) {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key);
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key, value) {
    this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
    return this;
  }

  delete(key) {
    return this.map.delete(key);
  }

  clear() {
    this.map.clear();
  }

  get size() {
    return this.map.size;
  }
}

export default Lru;
