import { describe, test, expect, vi } from 'vitest';
import { fulltextPlan, fulltextSettings } from '../../src/services/search/fulltext.js';
import { MYISAM_STOPWORDS } from '../../src/services/search/myisamStopwords.js';
import { queryStems } from '../../src/services/search/matcher.js';
import { SearchRepository } from '../../src/data/repositories/SearchRepository.js';

const myisam = { minWordLen: 4, stopwords: ['believe', 'accordingly', "a's"] };

describe('fulltextPlan: which stems the MyISAM FULLTEXT index can prefilter', () => {
  test('a stem at least ft_min_word_len long can go to MATCH, as a prefix of every word with that stem', () => {
    // faith → stem "faith", prefix "fait" (Porter may rewrite a stem's last letter)
    expect(fulltextPlan(queryStems('faith'), myisam)).toEqual({ match: '+fait*', like: [] });
  });
  test('one stem goes to MATCH, the one with the longest prefix: intersecting broad prefixes is slow', () => {
    expect(fulltextPlan(queryStems('faith charity'), myisam)).toEqual({ match: '+charit*', like: ['fait'] });
    expect(fulltextPlan(queryStems('hand lord'), myisam)).toEqual({ match: '+han*', like: ['lor'] });
  });
  test('shorter stems stay with LIKE: words under ft_min_word_len are not indexed', () => {
    expect(fulltextPlan(queryStems('the lord faith'), myisam)).toEqual({ match: '+fait*', like: ['the', 'lor'] });
    expect(fulltextPlan(queryStems('the lord'), myisam)).toEqual({ match: '+lor*', like: ['the'] });
  });
  test('minPrefix: shorter prefixes stay with LIKE', () => {
    expect(fulltextPlan(queryStems('the lord'), myisam, { minPrefix: 4 })).toEqual({ match: null, like: ['the', 'lor'] });
    expect(fulltextPlan(queryStems('the faith'), myisam, { minPrefix: 4 })).toEqual({ match: '+fait*', like: ['the'] });
  });
  test('the stem of a stopword stays with LIKE: stopwords are not indexed', () => {
    // "believe" and "accordingly" are MyISAM stopwords; "believer" shares the stem of "believe"
    expect(fulltextPlan(queryStems('believer accordingly'), myisam)).toEqual({ match: null, like: ['belie', 'accordingl'] });
  });
  test('with the built-in MyISAM list', () => {
    const builtin = { minWordLen: 4, stopwords: MYISAM_STOPWORDS };
    expect(fulltextPlan(queryStems('believe faith seven'), builtin)).toEqual({ match: '+fait*', like: ['belie', 'seve'] });
  });
  test('non-ASCII stems stay with LIKE (the two tokenizers split them differently)', () => {
    expect(fulltextPlan(queryStems('하나님의'), myisam)).toEqual({ match: null, like: ['하나님'] });
  });
  test('without FULLTEXT settings everything is LIKE', () => {
    expect(fulltextPlan(queryStems('faith'), null)).toEqual({ match: null, like: ['fait'] });
  });
});

describe('fulltextSettings', () => {
  const db = answers => ({ query: vi.fn(async sql => answers.find(([re]) => re.test(sql))?.[1] ?? []) });
  const ok = [
    [/information_schema\.TABLES/, [{ engine: 'MyISAM' }]],
    [/information_schema\.STATISTICS/, [{ index_name: 'text', columns: 1 }]],
    [/@@ft_min_word_len/, [{ min: 4, stop: '(built-in)' }]],
  ];
  test('a MyISAM FULLTEXT index on text alone, with the built-in stopwords', async () => {
    const s = await fulltextSettings(db(ok));
    expect(s.minWordLen).toBe(4);
    expect(s.stopwords).toContain('believe');
  });
  test('an empty stopword file means no stopwords', async () => {
    const s = await fulltextSettings(db([...ok.slice(0, 2), [/@@ft_min_word_len/, [{ min: 3, stop: '' }]]]));
    expect(s).toEqual({ minWordLen: 3, stopwords: [] });
  });
  test('a custom stopword file, another engine or no index: no FULLTEXT', async () => {
    expect(await fulltextSettings(db([...ok.slice(0, 2), [/@@ft_min_word_len/, [{ min: 4, stop: '/etc/stop.txt' }]]]))).toBeNull();
    expect(await fulltextSettings(db([[/information_schema\.TABLES/, [{ engine: 'InnoDB' }]], ...ok.slice(1)]))).toBeNull();
    expect(await fulltextSettings(db([ok[0], [/information_schema\.STATISTICS/, []], ok[2]]))).toBeNull();
  });
  test('a database error is not read as "no index": it propagates', async () => {
    await expect(fulltextSettings({ query: async () => { throw new Error('denied'); } })).rejects.toThrow('denied');
  });
  test('SearchRepository does not keep a failed lookup', async () => {
    let fail = true;
    const db = { query: vi.fn(async sql => {
      if (fail) { fail = false; throw new Error('gone'); }
      return ok.find(([re]) => re.test(sql))?.[1] ?? [];
    }) };
    const repo = new SearchRepository(db);
    await expect(repo.fulltext()).rejects.toThrow('gone');
    expect((await repo.fulltext()).minWordLen).toBe(4);
  });
});

describe('SearchRepository.candidates', () => {
  const repoWith = settings => {
    const db = { query: vi.fn(async () => []) };
    const repo = new SearchRepository(db);
    repo.fulltext = () => Promise.resolve(settings);
    return { repo, db };
  };
  test('MATCH for a stem the index covers, LIKE for the rest', async () => {
    const { repo, db } = repoWith({ minWordLen: 4, stopwords: [] });
    await repo.candidates(queryStems('faith of god'), ['KJV'], { afterId: 9, limit: 10 });
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/MATCH\(text\) AGAINST\(\? IN BOOLEAN MODE\)/);
    expect(params).toEqual([9, ['KJV'], '+fait*', '%of%', '%god%', 10]);
  });
  test('within a verse range, a three-letter prefix stays with LIKE (reading the versions is cheaper)', async () => {
    const { repo, db } = repoWith({ minWordLen: 4, stopwords: [] });
    await repo.candidates(queryStems('lord'), ['KJV'], { range: [1, 5] });
    await repo.candidates(queryStems('lord'), ['KJV']);
    expect(db.query.mock.calls[0][1]).toEqual([0, ['KJV'], '%lor%', 1, 5, 5000]);
    expect(db.query.mock.calls[1][1]).toEqual([0, ['KJV'], '+lor*', 5000]);
  });
  test('LIKE only without FULLTEXT', async () => {
    const { repo, db } = repoWith(null);
    await repo.candidates(queryStems('faith'), ['KJV'], { range: [1, 5] });
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).not.toMatch(/MATCH/);
    expect(params).toEqual([0, ['KJV'], '%fait%', 1, 5, 5000]);
  });
  test('a LIKE-only scan over all versions reads one id span per query', async () => {
    const db = { query: vi.fn(async sql => (/MAX\(id\)/.test(sql) ? [{ max: 250 }] : [{ id: 120, verse_id: 1, version: 'KJV', text: 'x' }])) };
    const repo = new SearchRepository(db);
    repo.fulltext = () => Promise.resolve(null);
    const first = await repo.candidates(queryStems('the'), ['KJV'], { afterId: 0, limit: 10, scan: 100 });
    expect(db.query.mock.calls[0][0]).toMatch(/id > \? AND id <= \?/);
    expect(db.query.mock.calls[0][1]).toEqual([0, 100, ['KJV'], '%the%', 10]);
    expect(first).toMatchObject({ through: 100, done: false, scanned: 100 });
    const last = await repo.candidates(queryStems('the'), ['KJV'], { afterId: 200, limit: 10, scan: 100 });
    expect(last).toMatchObject({ through: 300, done: true, scanned: 100 });
  });
  test('a full page continues after its last row', async () => {
    const db = { query: vi.fn(async () => [{ id: 7 }, { id: 9 }]) };
    const repo = new SearchRepository(db);
    repo.fulltext = () => Promise.resolve({ minWordLen: 4, stopwords: [] });
    expect(await repo.candidates(queryStems('faith'), ['KJV'], { limit: 2, scan: 100 })).toMatchObject({ through: 9, done: false, scanned: 2 });
    expect(await repo.candidates(queryStems('faith'), ['KJV'], { limit: 5, scan: 100 })).toMatchObject({ through: 9, done: true, scanned: 2 });
  });
});
