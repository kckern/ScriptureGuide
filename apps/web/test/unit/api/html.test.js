import { describe, test, expect } from 'vitest';
import { passageHtml } from '../../../src/api/v1/html.js';

const passage = {
  headings: { NRSV: 'Nicodemus <Visits> Jesus' },
  verses: [
    { id: 26137, chapter: 3, verse: 16, texts: { NRSV: 'For God & the world' } },
    { id: 26138, chapter: 3, verse: 17, texts: { NRSV: null } },
  ],
};

describe('passageHtml', () => {
  test('semantic markup, escaped, missing verses left out', () => {
    expect(passageHtml(passage, 'NRSV')).toBe(
      '<div class="passage" data-version="NRSV">' +
      '<h3 class="heading">Nicodemus &lt;Visits&gt; Jesus</h3>' +
      '<p><span class="verse" data-verse-id="26137" data-chapter="3" data-verse="16">For God &amp; the world</span></p>' +
      '</div>'
    );
  });
});
