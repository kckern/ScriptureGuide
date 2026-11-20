import { findReferences } from '../../src/scriptures.mjs';

const OPTS = { language: 'en', contextAware: true, enableImpliedBooks: true, abbreviations: true };
const found = (text) => findReferences(text, OPTS).map((m) => text.slice(m.start, m.end));

describe('references do not chain across a sentence end', () => {
  test('"John 3:16. Mosiah 2:17" is two links', () => {
    expect(found('John 3:16. Mosiah 2:17 was next.')).toEqual(['John 3:16', 'Mosiah 2:17']);
  });
  test('a semicolon list is still one link', () => {
    expect(found('John 3:16; Mosiah 2:17')).toEqual(['John 3:16; Mosiah 2:17']);
  });
  test('a long list becomes several links, not one giant one', () => {
    const text = 'John 3:16; 1 Ne. 3:7, 2 Ne. 2:25 and Mosiah 2:17. '.repeat(40);
    const spans = found(text);
    expect(spans.length).toBeGreaterThanOrEqual(40);
    for (const s of spans) expect(s.length).toBeLessThan(200);
  });
});

describe('clock times are not references', () => {
  test('"at 4:15 pm" after an Alma reference is not Alma 4:15', () => {
    expect(found('In Alma 32:21 we read about faith. They met at 4:15 pm.')).toEqual(['Alma 32:21']);
  });
  test.each(['4:15 p.m.', '9:30 am', '10:00 AM', '7:45 o\'clock'])('"%s"', (time) => {
    expect(found(`Alma 32:21 is read at ${time} each day.`)).toEqual(['Alma 32:21']);
  });
  test('"verse 27" still binds to the book in context', () => {
    expect(found('Alma 32:21 and verse 27')).toEqual(['Alma 32:21 and verse 27']);
  });
});
