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
    expect((await show('foo1', 'html', 'foo')).sections[0].legacyBlock).toEqual({ orig: 'foo1', book: 'foo1', verse_ids: [] });
  });
  test('not when the lookup found verses', async () => {
    blockService.blocks.mockClear();
    const found = new ScriptureController({ lookup: async () => ({ reference: { isEmpty: false, verseIds: [1] } }) }, references, blockService);
    expect((await show('gen.1.1', 'api', 'gen.1.1', found)).legacyBlocks).toBeUndefined();
    expect(blockService.blocks).not.toHaveBeenCalled();
  });
});

describe('ScriptureController: an html reference that found nothing', () => {
  const run = async (blocks, lookup = async () => empty()) => {
    const blockService = { blocks: async () => blocks, repo: { referenceFromVerseIds: async ids => `ref of ${ids.join(',')}` } };
    const ctl = new ScriptureController({ lookup: vi.fn(lookup) }, references, blockService);
    const req = { config: { outputFormat: 'html', reference: 'x; 1', legacy: { ref: 'x; 1' } }, params: {}, headers: {} };
    const res = { render: vi.fn() };
    const next = vi.fn();
    await ctl.show(req, res, next);
    return { req, res, next, ctl };
  };

  test('ranges whose ends matched nothing: home with an empty title (live: referenceFromVerseIds([null]) is "")', async () => {
    const { res, next } = await run([{ orig: 'A-b', book: 'Multi', verse_ids: [null] }, { orig: 'A 1', book: 'A', verse_ids: [] }]);
    expect(res.render).toHaveBeenCalledWith('home', expect.objectContaining({ title: '' }));
    expect(next).not.toHaveBeenCalled();
  });

  test('blocks without verses: one section per block, titled with the reference', async () => {
    const blocks = [{ orig: 'A-b', book: 'Multi', verse_ids: [null] }, { orig: ' 1', book: '', verse_ids: false }];
    const { req, next } = await run(blocks);
    expect(next).toHaveBeenCalled();
    expect(req.scriptureResult.sections.map(s => s.legacyBlock)).toEqual(blocks);
    expect(req.scriptureResult.title).toBe('x; 1');
  });

  test('a found block is looked up by its reference when that finds the same verses', async () => {
    const found = { reference: { isEmpty: false, verseIds: [5, 6] }, verses: [{}, {}], headings: [], config: {} };
    const { req, ctl } = await run([{ orig: 'Lehi', book: 'Lehi', verse_ids: [5, 6] }], async ref => (ref === 'ref of 5,6' ? found : empty()));
    expect(ctl.lookupService.lookup).toHaveBeenLastCalledWith('ref of 5,6', expect.objectContaining({ _block: true, _multiBlock: false }));
    expect(req.scriptureResult.sections[0]).toBe(found);
  });

  test('blocks PHP found by verse title are looked up by their verse ids; the title names them', async () => {
    const found = { reference: { isEmpty: false, verseIds: [5, 6] }, verses: [{}, {}], headings: [], config: {} };
    const blocks = [{ orig: 'Lehi', book: 'Lehi', verse_ids: [5, 6] }, { orig: 'Lehi 13', book: 'Lehi', verse_ids: [] }];
    const { req, ctl } = await run(blocks, async ref => (ref === '5,6' ? found : empty()));
    expect(ctl.lookupService.lookup).toHaveBeenLastCalledWith('5,6', expect.objectContaining({ _block: true, _multiBlock: true }));
    expect(req.scriptureResult.sections[0]).toBe(found);
    expect(req.scriptureResult.sections[1].legacyBlock).toEqual(blocks[1]);
    expect(req.scriptureResult.title).toBe('ref of 5,6');
  });
});

describe('ScriptureController: one budget per request', async () => {
  const { RequestBudget } = await import('../../src/domain/rules/requestBudget.js');
  test('the lookup and the PHP blocks share it', async () => {
    const lookup = vi.fn(async () => empty());
    const blocks = vi.fn(async () => [{ orig: 'x', book: 'x', verse_ids: [] }]);
    const ctl = new ScriptureController({ lookup }, references, { blocks });
    const req = { config: { outputFormat: 'api', reference: 'x1', legacy: { ref: 'x1' } }, params: {}, headers: {} };
    await ctl.show(req, {}, () => {});
    const budget = lookup.mock.calls[0][1]._budget;
    expect(budget).toBeInstanceOf(RequestBudget);
    expect(blocks.mock.calls[0][1]).toBe(budget);
  });
});
