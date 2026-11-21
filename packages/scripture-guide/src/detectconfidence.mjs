// Detection-only confidence: whether a match found in running text shows enough to be linked.
// Lookup (lookupReference) is lenient on purpose ("l3" → Luke 3); detection is strict, because
// a false positive marks up someone else's page. The less the number part looks like a citation,
// the more the book token must look like a book:
//   - a ":" verse ("3:16") is strong: any token, even one letter ("L 3:16");
//   - a "." verse ("3.5") needs two letters ("L3.5" reads as a version number);
//   - chapter only ("3", "120-134") needs four letters, or two or three with a capital
//     ("Lk 21", "Pss 120"); one letter ("L3") or a lowercase short token ("lu 3") is a label.
// Tokens in scripts without case (창, 創) are left to the existing rules.

// A numeral before the book: digits may fuse ("4Ne"), words and Roman numerals take a space
// ("II Jn", not the "I" of "Is"); then an optional "book(s) of"
const NUMERAL_PREFIX = /^(?:[1-4](?:st|nd|rd|th)?\s*|(?:I{1,3}|IV|First|Second|Third|Fourth)\s+)(?:books?\s+of\s+)?/i;

export function passesDetectionBar(bookToken, numbers) {
  const book = String(bookToken).trim().replace(NUMERAL_PREFIX, '');
  if (!/^[A-Za-z]/.test(book)) return true;
  const letters = book.replace(/[^A-Za-z]/g, '').length;
  if (/\d\s*:\s*\d/.test(numbers)) return letters >= 1;
  if (/\d\s*\.\s*\d/.test(numbers)) return letters >= 2;
  if (letters >= 4) return true;
  return letters >= 2 && /^[A-Z]/.test(book);
}
