import { describe, test, expect } from 'vitest';
import { noteIdsIn, footnotesHtml } from '../../src/domain/rules/footnotes.js';

const b64 = s => Buffer.from(s, 'utf8').toString('base64');
const rows = [
  { version: 'SEBOM', note_id: 2770, html: '&#119979; <em>declare</em>', type: 'ver', data: 'printer' },
  { version: 'KRSEB', note_id: 2770, html: '&#119979; <em>declare</em>', type: 'ver', data: 'printer' },
  { version: 'SEBOM', note_id: 2771, html: 'Mos 29.42', type: 'ref', data: 'Mos 29.42' },
  { version: 'KRSEB', note_id: 2771, html: '모사이야서 29:42', type: 'ref', data: 'Mos 29.42' },
  { version: 'SEBOM', note_id: 2772, html: 'Or <em>(he having power)</em>', type: '', data: '' },
  { version: 'SEBOM', note_id: 399, html: 'An apocalypse note', type: '', data: '' },
];

describe('noteIdsIn', () => {
  test('the note ids of the ｢N｣ markers in the body, once each', () => {
    expect(noteIdsIn('<head><meta content="x ｢1｣"></head><body><p>a｢2771｣ b ｢2772｣ c｢2771｣</p>')).toEqual([2771, 2772]);
  });
  test('none without a marker', () => expect(noteIdsIn('<body><p>plain</p>')).toEqual([]));
});

describe('footnotesHtml', () => {
  test('a marker becomes the ✱ span the page script reads (PHP scriptures::renderFootNotes)', () => {
    const out = footnotesHtml('<body><span class="verse" version="SEBOM">of God,｢2771｣ he</span>', rows);
    expect(out).toBe(`<body><span class="verse" version="SEBOM">of God,<span data='${b64('Mos 29.42')}' type='ref' extra='${b64('Mos 29.42')}' note_id='2771' class='fn ref'>&#10033;</span> he</span>`);
  });
  test('the space before a marker moves after it', () => {
    expect(footnotesHtml('<body><span version="SEBOM">deliver ｢2770｣the word</span>', rows))
      .toContain(`deliver<span data='${b64('&#119979; <em>declare</em>')}' type='ver' extra='${b64('printer')}' note_id='2770' class='fn ver'>&#10033;</span> the word`);
  });
  test('a note with no type or data is a plain tooltip', () => {
    expect(footnotesHtml('<body><span version="SEBOM">things,｢2772｣</span>', rows))
      .toContain(`<span data='${b64('Or <em>(he having power)</em>')}'  note_id='2772' class='fn'>&#10033;</span>`);
  });
  test('each marker takes the note of the version around it', () => {
    const out = footnotesHtml('<body><span version="SEBOM">a｢2771｣</span><span version="KRSEB">b｢2771｣</span>', rows);
    expect(out).toContain(`data='${b64('Mos 29.42')}'`);
    expect(out).toContain(`data='${b64('모사이야서 29:42')}'`);
  });
  test('a version without its own note uses another version\'s (HIBOM headings carry SEBOM note ids)', () => {
    expect(footnotesHtml('<body><h3 version="HIBOM">Nephi’s Vision｢399｣</h3>', rows)).toContain(`data='${b64('An apocalypse note')}'`);
  });
  test('a marker with no note at all is dropped, not shown', () => {
    expect(footnotesHtml('<body><p version="SEBOM">text｢99999｣ more</p>', rows)).toBe('<body><p version="SEBOM">text more</p>');
  });
  test('a dropped marker between two spaces leaves one space, not two', () => {
    expect(footnotesHtml('<body><h3 version="KRSEB">회개한 ｢99999｣ 조램인들</h3>', rows)).toBe('<body><h3 version="KRSEB">회개한 조램인들</h3>');
  });
  test('nothing before <body> changes: markers in meta tags stay out of attributes', () => {
    const head = '<head><meta property="og:description" content="a ｢2771｣"></head>';
    expect(footnotesHtml(head + '<body><p version="SEBOM">x｢2771｣</p>', rows).startsWith(head)).toBe(true);
  });
  test('a fragment without <body> (the in-place version switch) is handled whole', () => {
    expect(footnotesHtml('<h3 version="SEBOM">Head｢2771｣</h3>', rows)).toContain("class='fn ref'");
  });
});
