// Whether a verse starts a section, from its text: "§" opens it (a psalm superscription,
// "§A psalm of David.¶▼…"), or follows a leading label before the verse's first "¶" (a
// division label, NET Ps. 90:1 "Book 4 (Psalms 90-106)§A prayer of Moses…"). The label form
// counts only when the verse has its own heading row. "§¶" after other text is not a start:
// that text ends the section before ("Then Nathan went home.§¶The Lord struck…").
const LABELLED = /^[^¶§]*§(?!¶)/;

export function verseStartsSection(text, hasHeadingRow) {
  const t = text || '';
  return t.startsWith('§') || (!!hasHeadingRow && LABELLED.test(t));
}
