// Detection-only confidence: whether a match found in running text shows enough to be linked.
// Lookup (lookupReference) is lenient on purpose ("l3" → Luke 3); detection is strict, because
// a false positive marks up someone else's page. The less the number part looks like a citation,
// the more the book token must look like a book:
//   - a ":" verse ("3:16") is strong: any token, even one letter ("L 3:16");
//   - a "." verse ("3.5") needs two letters ("L3.5" reads as a version number);
//   - chapter only ("3", "120-134") needs four letters, or two or three with a capital
//     ("Lk 21", "Pss 120"); one letter ("L3") or a lowercase short token ("lu 3") is a label.
// A numeral before the book is evidence too: a numbered book counts as at least two letters,
// so French "1 S 3,10" and "2 R 5,14" pass while lowercase "1 s 3" still lacks the capital.
// Tokens in scripts without letter case (창, 創) are left to the existing rules.

// A numeral before the book: digits may fuse ("4Ne"), words and Roman numerals take a space
// ("II Jn", not the "I" of "Is"); then an optional "book(s) of"
const NUMERAL_PREFIX = /^(?:[1-4](?:st|nd|rd|th)?\s*|(?:I{1,3}|IV|First|Second|Third|Fourth)\s+)(?:books?\s+of\s+)?/i;

export function passesDetectionBar(bookToken, numbers) {
  const token = String(bookToken).trim();
  const book = token.replace(NUMERAL_PREFIX, '');
  if (!/^[\p{Lu}\p{Ll}]/u.test(book)) return true;
  const numbered = book.length < token.length;
  const spelled = book.replace(/[^\p{L}]/gu, '').length;
  const letters = numbered ? Math.max(spelled, 2) : spelled;
  if (/\d\s*:\s*\d/.test(numbers)) return letters >= 1;
  if (/\d\s*\.\s*\d/.test(numbers)) return letters >= 2;
  if (letters >= 4) return true;
  return letters >= 2 && /^\p{Lu}/u.test(book);
}
