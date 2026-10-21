import { describe, test, expect } from 'vitest';
import { RequestBudget } from '../../src/domain/rules/requestBudget.js';

describe('RequestBudget (what one request may resolve)', () => {
  test('defaults: 100 pieces, 5000 verses', () => {
    const b = new RequestBudget();
    expect(b.pieces).toBe(100);
    expect(b.verses).toBe(5000);
  });
  test('takePiece is true until the pieces run out', () => {
    const b = new RequestBudget({ pieces: 2 });
    expect([b.takePiece(), b.takePiece(), b.takePiece()]).toEqual([true, true, false]);
  });
  test('takeVerses takes n only when n are left', () => {
    const b = new RequestBudget({ verses: 10 });
    expect(b.takeVerses(6)).toBe(true);
    expect(b.takeVerses(6)).toBe(false);
    expect(b.takeVerses(4)).toBe(true);
    expect(b.takeVerses(1)).toBe(false);
  });
  test('takeQuery counts database queries', () => {
    const b = new RequestBudget({ queries: 1 });
    expect([b.takeQuery(), b.takeQuery()]).toEqual([true, false]);
  });
  test('memo caches an async value per key', async () => {
    const b = new RequestBudget();
    let n = 0;
    const f = async () => ++n;
    expect(await b.memo('k', f)).toBe(1);
    expect(await b.memo('k', f)).toBe(1);
    expect(n).toBe(1);
  });
});
