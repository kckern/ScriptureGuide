import { describe, test, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('../../src/data/db/connection.js', () => ({ default: { query: (...a) => query(...a) } }));
const { VerseboxRepository } = await import('../../src/data/repositories/VerseboxRepository.js');

let repo;
beforeEach(() => { query.mockReset(); repo = new VerseboxRepository(); });

// scripture_verses rows in priority order (the fallback query's ORDER BY), as a fake database
function texts(rows) {
  query.mockImplementation(async (sql, params) => {
    if (/v\.version = \?/.test(sql)) return rows.filter(r => params[0].includes(r.verse_id) && r.version === params[1]);
    if (/ORDER BY v\.verse_id, s\.priority/.test(sql)) return rows.filter(r => params[0].includes(r.verse_id));
    throw new Error(`unexpected query: ${sql}`);
  });
}

describe('findTexts', () => {
  // Dhammapada 2:28: three translations of equal priority; EASWARAN's row comes first
  const DP = [
    { verse_id: 91490, version: 'EASWARAN', text: 'Overcoming sloth' },
    { verse_id: 91490, version: 'GFRONSDAL', text: 'Driving away negligence' },
    { verse_id: 91490, version: 'MULLER', text: 'When the learned man' },
  ];
  test('the requested version when it has the verse', async () => {
    texts(DP);
    expect((await repo.findTexts([91490], 'MULLER'))[0].version).toBe('MULLER');
  });
  test('else the volume default (scriptures::defaultVersions), as the PHP lookup added it', async () => {
    texts(DP);
    expect((await repo.findTexts([91490], 'LDS', () => ['GFRONSDAL']))[0].version).toBe('GFRONSDAL');
  });
  test('else the first version by priority', async () => {
    texts(DP);
    expect((await repo.findTexts([91490], 'LDS', () => ['ULOLD']))[0].version).toBe('EASWARAN');
    expect((await repo.findTexts([91490], 'LDS'))[0].version).toBe('EASWARAN');
  });
});

describe('findVerseMeta', () => {
  test('one query: each chapter\'s last verse from a grouped join, the ids bound for both IN lists', async () => {
    query.mockResolvedValue([]);
    await repo.findVerseMeta([1, 2]);
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/MAX\(verse\) AS chapter_max[\s\S]*GROUP BY book_id, chapter\) m ON m\.book_id = l\.book_id AND m\.chapter = l\.chapter/);
    expect(sql).not.toMatch(/SELECT MAX\(c\.verse\)/);
    expect(params).toEqual([[1, 2], [1, 2]]);
  });
  test('no ids, no query', async () => {
    expect(await repo.findVerseMeta([])).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('findChapterVerses', () => {
  test('every verse of the chapters in one query', async () => {
    query.mockResolvedValue([]);
    await repo.findChapterVerses([[1, 22], [82, 13]]);
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/WHERE \(l\.book_id, l\.chapter\) IN \(\?\)/);
    expect(params).toEqual([[[1, 22], [82, 13]]]);
  });
});
