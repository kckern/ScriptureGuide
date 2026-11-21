import { describe, test, expect, vi } from 'vitest';

vi.mock('../../../src/api/v1/notes.js', () => ({ noteFor: vi.fn(() => null) }));
const { toRuns, runsText, markSpans } = await import('../../../src/api/v1/runs.js');
const { noteFor } = await import('../../../src/api/v1/notes.js');
const { flattenText } = await import('../../../src/domain/rules/legacyText.js');

const words = s => s.split(/\s+/).filter(Boolean);

describe('markSpans', () => {
  test('the outermost marks with their symbols; a symbol with no partner is not a mark', () => {
    expect(markSpans('a {b ｟c｠} ~~d~~ 〔e')).toEqual([
      { start: 2, end: 8, width: 1, mark: 'small', open: '{', close: '}' },
      { start: 10, end: 13, width: 2, mark: 'strike', open: '~~', close: '~~' },
    ]);
  });
});

describe('toRuns', () => {
  test('plain text is one run', () => {
    expect(toRuns('In the beginning')).toEqual([{ text: 'In the beginning' }]);
  });

  test('each mark', () => {
    expect(toRuns('the ｟Lord｠ said')).toEqual([{ text: 'the ' }, { text: 'Lord', mark: 'smallcaps' }, { text: ' said' }]);
    expect(toRuns('a {small} word')[1]).toEqual({ text: 'small', mark: 'small' });
    expect(toRuns('a 〔slanted〕 word')[1]).toEqual({ text: 'slanted', mark: 'em' });
    expect(toRuns('a 「bold」 word')[1]).toEqual({ text: 'bold', mark: 'strong' });
    expect(toRuns('the 《first year of the》 reign')[1]).toEqual({ text: 'first year of the', mark: 'sup' });
    expect(toRuns('been ~~bor~~ born')[1]).toEqual({ text: 'bor', mark: 'strike' });
    expect(toRuns('the baker ⦅Tomas⦆ rose')[1]).toEqual({ text: 'Tomas', mark: 'sans' });
  });

  test('nesting: the outer mark wins and the inner mark symbols are dropped', () => {
    expect(toRuns('The {｟Keeper｠} said')).toEqual([{ text: 'The ' }, { text: 'Keeper', mark: 'small' }, { text: ' said' }]);
    expect(toRuns('or ~~《the》~~ old')[1]).toEqual({ text: 'the', mark: 'strike' });
    // Struck text stays struck inside another mark
    expect(toRuns('for 《my ~~name~~》 name')).toEqual([{ text: 'for ' }, { text: 'my ', mark: 'sup' }, { text: 'name', mark: 'strike' }, { text: ' name' }]);
    // The same mark inside itself closes at its own pair
    expect(toRuns('「Bread for 「the town」 now」.')).toEqual([{ text: 'Bread for the town now', mark: 'strong' }, { text: '.' }]);
  });

  test('|| and | are manuscript line ends, read as a space; so is \\', () => {
    expect(toRuns('been||born of the le||arning')).toEqual([{ text: 'been born of the le arning' }]);
    expect(toRuns('Hyde,| Clerks.')).toEqual([{ text: 'Hyde, Clerks.' }]);
    expect(toRuns('so \\As by fire')).toEqual([{ text: 'so As by fire' }]);
  });

  test('a note mark is removed and passed to noteFor', () => {
    noteFor.mockClear();
    expect(toRuns('rose early｢13｣ and lit')).toEqual([{ text: 'rose early and lit' }]);
    expect(noteFor).toHaveBeenCalledWith(13);
  });

  test('unbalanced marks are plain text', () => {
    expect(toRuns('passed {over the bridge.)')).toEqual([{ text: 'passed {over the bridge.)' }]);
    expect(toRuns('these words~~ I went')).toEqual([{ text: 'these words~~ I went' }]);
    expect(toRuns('the 」end')).toEqual([{ text: 'the 」end' }]);
  });

  test('whitespace is collapsed, also across runs; neighbouring runs with one mark merge; empty runs are dropped', () => {
    expect(toRuns('a  \t b 〔 c〕')).toEqual([{ text: 'a b ' }, { text: 'c', mark: 'em' }]);
    expect(toRuns('｟Oliver｠｟Cowdery｠ {}x')).toEqual([{ text: 'OliverCowdery', mark: 'smallcaps' }, { text: ' x' }]);
  });

  test('run text has the words flattenText reads', () => {
    for (const input of [
      '｟I, Nephi｠, having been born of goodly parents; yea, 〔the record〕 is true',
      'He said, 「Bread for the town」.｢14｣ And {small} things||happened',
      'namely:— ｟Oliver Cowdery｠, No. 1 ｟John｠ ｟Johnson｠ sen. ” 10',
    ]) {
      // flattenText keeps { and } (they are ASCII)
      expect(words(runsText(toRuns(input)))).toEqual(words(flattenText(input).replace(/[{}]/g, '')));
    }
  });
});
