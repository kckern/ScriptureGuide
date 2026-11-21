import { describe, test, expect, vi } from 'vitest';
import ejs from 'ejs';
import * as cheerio from 'cheerio';
import { fileURLToPath } from 'node:url';
import { SearchParallelController } from '../../src/app/controllers/SearchParallelController.js';

const VIEW = fileURLToPath(new URL('../../src/presentation/views/parallel.ejs', import.meta.url));
const page = versionNote => ({
  title: 'Isaiah 49 ~ Isaiah 9', lver: 'LDS', rver: 'LDS', limg: 'lds', rimg: 'lds',
  leftheader: 'Isaiah 49', rightheader: 'Isaiah 9', htmlLeftheader: 'Isaiah 49', htmlRightheader: 'Isaiah 9',
  leftheaderSlug: 'isaiah.49', rightheaderSlug: 'isaiah.9', swapslug: 'a~b', chslug: 'a~b', fullslug: 'a~b',
  ischapter: true, rows: [], config: {}, ogUrl: '', versionNote,
});

describe('parallel page: the note on an unknown version', () => {
  test('the controller passes the version list to the build', async () => {
    const known = new Set(['LDS']);
    const parallel = { build: vi.fn(async () => page('x')) };
    const ctrl = new SearchParallelController(parallel, {}, { knownVersions: async () => known });
    const res = { render: vi.fn() };
    await ctrl.dispatch({ config: { parallel: true, reference: 'hbrs/isa.49~isa.9' }, headers: {} }, res);
    expect(parallel.build).toHaveBeenCalledWith('hbrs/isa.49~isa.9', { known });
    expect(res.render.mock.calls[0][1].versionNote).toBe('x');
  });
  test('renders above the container, escaped', async () => {
    const $ = cheerio.load(await ejs.renderFile(VIEW, page('There is no version "<B>". Showing LDS.')));
    expect($('.versionNote').text()).toBe('There is no version "<B>". Showing LDS.');
    expect($('.versionNote').next().is('#container')).toBe(true);
    expect($('.versionNote b').length).toBe(0);
  });
  test('none without one', async () => {
    expect(cheerio.load(await ejs.renderFile(VIEW, page(null)))('.versionNote').length).toBe(0);
  });
});
