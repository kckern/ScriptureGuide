import { describe, test, expect, vi } from 'vitest';
import { SphinxClient, buildSearchSql, escapeMatch, createSphinxClient } from '../../src/data/external/sphinx.js';

describe('buildSearchSql', () => {
  test('matches the text field with the version filter and limit the PHP site sends', () => {
    expect(buildSearchSql('faith hope charity', { versions: ['LDS', 'KJV'] }))
      .toBe("SELECT verse_id, version FROM sgindex WHERE MATCH('@(text) faith hope charity') AND version IN ('LDS','KJV') LIMIT 99999");
  });
  test('adds a verse id range for the per-volume requery', () => {
    expect(buildSearchSql('faith', { versions: ['LDS', 'KJV'], range: [1, 23145], limit: 5000 }))
      .toBe("SELECT verse_id, version FROM sgindex WHERE MATCH('@(text) faith') AND version IN ('LDS','KJV') AND verse_id BETWEEN 1 AND 23145 LIMIT 5000");
  });
  test('maxMatches raises searchd\'s cap (production sends none)', () => {
    expect(buildSearchSql('faith', { versions: ['KJV'], limit: 100000, maxMatches: 100000 }))
      .toBe("SELECT verse_id, version FROM sgindex WHERE MATCH('@(text) faith') AND version IN ('KJV') LIMIT 100000 OPTION max_matches=100000");
  });
  test('escapes only what would end the string literal', () => {
    expect(escapeMatch("lord's -house")).toBe("lord\\'s -house");
    expect(escapeMatch('a\\b')).toBe('a\\\\b');
  });
});

describe('SphinxClient', () => {
  const fakeConnect = (rowsFor) => {
    const conns = [];
    const connect = vi.fn(async cfg => {
      const conn = { cfg, query: vi.fn(async sql => [rowsFor(sql, conns.length)]), end: vi.fn(async () => {}) };
      conns.push(conn);
      return conn;
    });
    return { connect, conns };
  };

  test('connects to host:port over the MySQL protocol and maps rows', async () => {
    const { connect, conns } = fakeConnect(() => [{ verse_id: '28679', version: 'LDS' }]);
    const client = new SphinxClient({ host: 'sphinx', port: 9306 }, connect);
    const rows = await client.search('faith', { versions: ['LDS'] });
    expect(rows).toEqual([{ verse_id: 28679, version: 'LDS' }]);
    expect(connect).toHaveBeenCalledWith(expect.objectContaining({ host: 'sphinx', port: 9306 }));
    expect(conns[0].query.mock.calls[0][0]).toContain("MATCH('@(text) faith')");
  });

  test('reuses one connection and reconnects after a failure', async () => {
    let fail = true;
    const connect = vi.fn(async () => ({
      query: vi.fn(async () => { if (fail) { fail = false; throw new Error('gone away'); } return [[]]; }),
      end: vi.fn(async () => {}),
    }));
    const client = new SphinxClient({ host: 'sphinx' }, connect);
    await expect(client.query('SELECT 1')).rejects.toThrow('gone away');
    await client.query('SELECT 1');
    await client.query('SELECT 1');
    expect(connect).toHaveBeenCalledTimes(2);
  });

  test('retries once on a fresh connection when the old one was closed under it', async () => {
    // searchd restarts or idle timeouts close the socket; mysql2 then fails the next query with a
    // fatal "closed state" error. Searches are read-only, so one retry is safe.
    const closed = Object.assign(new Error("Can't add new command when connection is in closed state"), { fatal: true });
    let calls = 0;
    const connect = vi.fn(async () => ({
      query: vi.fn(async () => { if (calls++ === 0) throw closed; return [[{ verse_id: '1', version: 'LDS' }]]; }),
      end: vi.fn(async () => {}),
    }));
    const client = new SphinxClient({ host: 'sphinx' }, connect);
    await expect(client.search('faith')).resolves.toEqual([{ verse_id: 1, version: 'LDS' }]);
    expect(connect).toHaveBeenCalledTimes(2);
  });

  test('does not retry a fatal error twice', async () => {
    const closed = Object.assign(new Error('closed'), { fatal: true });
    const connect = vi.fn(async () => ({ query: vi.fn(async () => { throw closed; }), end: vi.fn(async () => {}) }));
    const client = new SphinxClient({ host: 'sphinx' }, connect);
    await expect(client.query('SELECT 1')).rejects.toThrow('closed');
    expect(connect).toHaveBeenCalledTimes(2);
  });

  test('a query searchd cannot parse finds nothing, as live does', async () => {
    // /).split( : PHP ran the query through the mysql CLI, got no rows on the syntax error and
    // showed 0 results
    const bad = Object.assign(new Error("index 'sgindex': syntax error, unexpected ')'"), { code: 'ER_PARSE_ERROR' });
    const connect = vi.fn(async () => ({ query: vi.fn(async () => { throw bad; }), end: vi.fn(async () => {}) }));
    const client = new SphinxClient({ host: 'sphinx' }, connect);
    await expect(client.search(') split(')).resolves.toEqual([]);
    await expect(client.query('SELEC')).rejects.toThrow('syntax error');
  });

  test('createSphinxClient is null without a host', () => {
    expect(createSphinxClient({ host: '' })).toBeNull();
    expect(createSphinxClient({ host: 'sphinx', port: 9306 })).toBeInstanceOf(SphinxClient);
  });
});
