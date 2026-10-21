import { describe, test, expect, vi } from 'vitest';
import { ScriptureController } from '../../src/app/controllers/ScriptureController.js';

// A stub of ReferenceService.resolveBookOnly: whole book names (or aliases) only, no prefixes
const BOOKS = { 'song of solomon': "Solomon's Song", son: "Solomon's Song" };
const references = { resolveBookOnly: vi.fn(async t => (BOOKS[t.toLowerCase()] ? { book: BOOKS[t.toLowerCase()], verseIds: [17539] } : null)) };
const empty = () => ({ reference: { isEmpty: true, verseIds: [] } });
const controller = new ScriptureController({ lookup: async () => empty() }, references);

async function show(ref, outputFormat = 'meta') {
  const req = { config: { outputFormat, reference: ref, legacy: { ref } }, params: { reference: ref }, headers: {} };
  await controller.show(req, {}, () => {});
  return req.scriptureResult;
}

describe('ScriptureController: a word alone on meta', () => {
  test('a whole book name or alias resolves to its first chapter', async () => {
    expect((await show('Song.of.Solomon')).bookOnly).toEqual({ book: "Solomon's Song", verseIds: [17539] });
    expect((await show('son')).bookOnly).toEqual({ book: "Solomon's Song", verseIds: [17539] });
  });
  test('other words do not', async () => {
    expect((await show('the')).bookOnly).toBeNull();
    expect((await show('is')).bookOnly).toBeNull();
  });
  test('only for the formats that list reference blocks', async () => {
    references.resolveBookOnly.mockClear();
    expect((await show('son', 'plain')).bookOnly).toBeUndefined();
    expect(references.resolveBookOnly).not.toHaveBeenCalled();
  });
});
