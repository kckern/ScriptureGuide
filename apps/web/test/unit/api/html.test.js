import { describe, test, expect } from 'vitest';
import { passageHtml } from '../../../src/api/v1/html.js';

const piece = (id, verse, start, runs) => ({ id, verse, start, runs });
const passage = {
  headings: { NRSV: 'Bless <the> Lord' },
  blocks: { NRSV: [
    { type: 'subtitle', pieces: [piece(15551, 1, true, [{ text: 'Of David.' }])] },
    { type: 'poetry', style: null, lines: [
      { indent: 0, pieces: [piece(15551, 1, false, [{ text: 'Bless the ' }, { text: 'Lord', mark: 'smallcaps' }, { text: ', O my soul,' }])] },
      { indent: 1, pieces: [piece(15551, 1, false, [{ text: 'and all that is within me' }]), piece(15552, 2, true, [{ text: ' & more' }])] },
    ] },
    { type: 'paragraph', style: 'flush', pieces: [piece(15553, 3, true, [{ text: 'A ' }, { text: 'b', mark: 'small' }, { text: 'c', mark: 'em' }, { text: 'd', mark: 'strong' }, { text: 'e', mark: 'sup' }, { text: 'f', mark: 'strike' }, { text: 'g', mark: 'sans' }])] },
    { type: 'paragraph', style: null, pieces: [piece(15554, 4, true, [{ text: '<x>' }])] },
    { type: 'paragraph', style: 'linebreak', indent: 1, pieces: [piece(15554, 4, false, [{ text: 'y' }])] },
    { type: 'sense', style: null, lines: [{ indent: 0, pieces: [piece(15555, 5, true, [{ text: 'z' }])] }] },
  ] },
};

describe('passageHtml', () => {
  test('blocks as semantic markup: paragraphs, poetry lines, subtitles, marks and verse numbers, escaped', () => {
    expect(passageHtml(passage, 'NRSV')).toBe(
      '<div class="passage" data-version="NRSV">' +
      '<h3 class="heading">Bless &lt;the&gt; Lord</h3>' +
      '<p class="subtitle"><span class="verse-num" data-verse="1" data-verse-id="15551">1</span>Of David.</p>' +
      '<div class="poetry">' +
      '<span class="line">Bless the <span class="smallcaps">Lord</span>, O my soul,</span>' +
      '<span class="line indent-1">and all that is within me <span class="verse-num" data-verse="2" data-verse-id="15552">2</span>&amp; more</span>' +
      '</div>' +
      '<p class="paragraph flush"><span class="verse-num" data-verse="3" data-verse-id="15553">3</span>A <small>b</small><em>c</em><strong>d</strong><sup>e</sup><s>f</s><span class="sans">g</span></p>' +
      '<p class="paragraph"><span class="verse-num" data-verse="4" data-verse-id="15554">4</span>&lt;x&gt;</p>' +
      '<p class="paragraph linebreak indent-1">y</p>' +
      '<div class="sense"><span class="line"><span class="verse-num" data-verse="5" data-verse-id="15555">5</span>z</span></div>' +
      '</div>'
    );
  });

  test('a version with no blocks, and no heading', () => {
    expect(passageHtml({ headings: { KJV: null }, blocks: { KJV: [] } }, 'KJV')).toBe('<div class="passage" data-version="KJV"></div>');
  });
});
