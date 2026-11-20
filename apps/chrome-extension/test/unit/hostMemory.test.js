import { startState, rememberVisit, WEEK_MS } from '../../src/shared/hostMemory.js';

describe('per-site memory', () => {
  test('an unknown site starts normal', () => {
    expect(startState(undefined, 0)).toBe('normal');
  });
  test('a remembered state applies until it expires', () => {
    expect(startState({ state: 'lite', until: 100 }, 50)).toBe('lite');
    expect(startState({ state: 'lite', until: 100 }, 150)).toBe('normal');
  });
  test('a visit that pauses from normal starts the next one in lite for a week', () => {
    expect(rememberVisit('normal', 'paused', 10)).toEqual({ state: 'lite', until: 10 + WEEK_MS });
    expect(rememberVisit('local', 'paused', 10)).toEqual({ state: 'lite', until: 10 + WEEK_MS });
  });
  test('a visit that started in lite and paused starts the next one paused', () => {
    expect(rememberVisit('lite', 'paused', 10)).toEqual({ state: 'paused', until: 10 + WEEK_MS });
    expect(rememberVisit('paused', 'paused', 10)).toEqual({ state: 'paused', until: 10 + WEEK_MS });
  });
  test('a visit that never paused changes nothing', () => {
    expect(rememberVisit('normal', 'lite', 10)).toBeNull();
  });
});
