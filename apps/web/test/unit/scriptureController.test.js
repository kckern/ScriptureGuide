import { describe, test, expect, vi } from 'vitest';
import { ScriptureController } from '../../src/app/controllers/ScriptureController.js';

// A stub of ReferenceService.resolveBookOnly: whole book names (or aliases) only, no prefixes
const BOOKS = { 'song of solomon': "Solomon's Song", son: "Solomon's Song" };
const references = { resolveBookOnly: vi.fn(async t => (BOOKS[t.toLowerCase()] ? { book: BOOKS[t.toLowerCase()], verseIds: [17539] } : null)) };
const empty = () => ({ reference: { isEmpty: true, verseIds: [] } });
// A stub of LegacyBlockService.blocks: the reference it was asked for, as one block
const blockService = { blocks: vi.fn(async ref => [{ orig: ref, book: ref, verse_ids: [] }]) };
const controller = new ScriptureController({ lookup: async () => empty() }, references, blockService);

async function show(ref, outputFormat = 'meta', legacyRef = ref, ctrl = controller) {
  const req = { config: { outputFormat, reference: ref, legacy: { ref: legacyRef } }, params: { reference: ref }, headers: {} };
  await ctrl.show(req, {}, () => {});
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

describe('ScriptureController: the PHP blocks of a reference that found nothing', () => {
  test('the legacy formats build them from the reference PHP saw', async () => {
    expect((await show('foo1', 'api', 'foo')).legacyBlocks).toEqual([{ orig: 'foo', book: 'foo', verse_ids: [] }]);
  });
  test('html builds them from the reference it looked up', async () => {
    expect((await show('foo1', 'html', 'foo')).legacyBlocks).toEqual([{ orig: 'foo1', book: 'foo1', verse_ids: [] }]);
  });
  test('not when the lookup found verses', async () => {
    blockService.blocks.mockClear();
    const found = new ScriptureController({ lookup: async () => ({ reference: { isEmpty: false, verseIds: [1] } }) }, references, blockService);
    expect((await show('gen.1.1', 'api', 'gen.1.1', found)).legacyBlocks).toBeUndefined();
    expect(blockService.blocks).not.toHaveBeenCalled();
  });
});
