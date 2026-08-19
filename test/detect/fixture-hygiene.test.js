/**
 * Guards the CORPUS, not the code.
 *
 * test/prose-samples/en/testDetect.en.txt shipped from its first commit with
 *   "Isa 45.22;Morm 3.18;Moro 10.24for prophets"
 * -- bare separators and an eaten space, the exact signature of the merge bug it
 * was supposed to help catch. The text had been scraped from a page already
 * rendered by the buggy pipeline, so the input looked like the output and the
 * defect was camouflaged in the one corpus most likely to expose it.
 *
 * A prose sample is INPUT. It must read like something a human wrote, never like
 * something this library emitted. These checks fail on the paste, not months
 * later on the consequence.
 */
import { readFileSync } from 'fs';
import { glob } from 'glob';

const SAMPLES = glob.sync('test/prose-samples/**/*.txt').sort();

// Signatures of citation text that has been through a buggy render.
const CONTAMINATION = [
  {
    pattern: /[;](?=[A-Za-z0-9])/g,
    label: 'semicolon fused to the next token (";Morm 3.18") -- a bare-";" merge artifact',
  },
  {
    pattern: /\d(?=[a-z]{2,})/g,
    label: 'digit fused to a following word ("10.24for") -- an eaten separator',
  },
];

describe('prose sample hygiene', () => {
  test('samples exist and are discoverable', () => {
    expect(SAMPLES.length).toBeGreaterThan(0);
  });

  describe.each(SAMPLES)('%s', (file) => {
    const content = readFileSync(file, 'utf8');

    test.each(CONTAMINATION)('is free of $label', ({ pattern }) => {
      const hits = [];
      for (const match of content.matchAll(pattern)) {
        const from = Math.max(0, match.index - 30);
        hits.push(content.slice(from, match.index + 30).replace(/\n/g, '\\n'));
      }
      expect(hits).toEqual([]);
    });
  });
});
