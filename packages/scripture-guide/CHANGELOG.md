# scripture-guide

## 1.1.7

### Patch Changes

- 6fe28a3: English detection no longer matches an abbreviated book followed by a bare chapter ("Gen 2", "Jud 1") unless it is a common citation form (Ps, Heb, Rom, Mt, numbered books, D&C and similar). Add a verse and it matches as before. A full book name with a chapter ("Genesis 2") is unchanged.

## 1.1.6

### Patch Changes

- 7e7cba4: English detection skips model and version names such as "Gen2", "Gen 2", "Rev 3.0" and "Mark5". Abbreviations that are also words or names (Gen, Rev, Num, Dan, Jud, Mat, Mar, Col, Phil, Ez, Hab) now need a verse to match.

## 1.1.5

### Patch Changes

- 097f605: English detection no longer matches prose as references: "Is 4,300 Years Old" (a thousands-grouped number), "Is 4" or "Am 3" (common-word abbreviations without a verse), and "Mark 5 times" (a quantity). Set `guardFalsePositives: false` to restore the old behavior.

## 1.1.4

### Patch Changes

- e589401: - `lookupReference` reads each part of a list as it reads alone: "4 Ne 1; JS-H 1" is two whole chapters, "Gen 1; Mt 5:3, 7" no longer drops Matthew, and "D&C 76:22, 23; 88" keeps section 88.
  - References written with HTML entity dashes ("Mt 5:3&ndash;5", "Ex 20:1&minus;17") and the minus sign "−" are detected and looked up as ranges.
  - `detectReferences` honours the `chapterOnly` and `abbreviations` options, as `findReferences` does, also for spans written with entities.

## 1.1.3

### Patch Changes

- 561e0c5: Detection (`detectReferences`, `findReferences`) asks for more evidence when a match is thin, while `lookupReference` is unchanged (`lookupReference('l3')` is still Luke 3):

  - A chapter-only match needs a book of four or more letters, or two or three starting with a capital: "Lk 21", "Mt 24", "Luke 3" and "D&C 4" are linked; "L3", "lu 3", "gen 1" and "d&c 4" in running text are not. With a verse, lowercase is fine ("rom 8:28").
  - A single letter needs a capital and a ":" verse ("L 3:16"); "L3.5" and "l 3:30" are not references. A numbered book counts as two letters, so French "1 S 3,10" and "2 R 5,14" still link.
  - Only the first number decides: "L 3, 4:5" is not carried by the later "4:5"; "lu 3. 5" is not a verse.
  - A lowercase copy of an accepted reference elsewhere in the text is no longer linked on its strength ("Lu 3 … lu 3").
  - A "v. 16" no longer binds to an earlier citation past a label detection rejected ("Mt 5:3 … lu 3 (v. 16)").

  This replaces 1.1.2's lone-letter rule, which also skipped "L 3:16".

## 1.1.2

### Patch Changes

- fcde968: `findReferences` and `detectReferences` no longer read a lone letter as a book: "L3", "L 3" and "L. 3" in running text are labels, not Luke 3. Two-letter abbreviations ("Lk 3:5", "Lu 3:16") still match, and `lookupReference('l3')` is still Luke 3.

## 1.1.1

### Patch Changes

- 4b04056: `lookupReference(query, { maxVerses })` sets how many verses one range expands to. The default stays 1000.
- 21bcf0a: Song of Solomon references resolve in every common form ("Song of Solomon", "Song", "SoS", "Canticles", "Song of Songs", "Solomon's Song"), and English refs read "Solomon's Song", the name the LDS edition uses.

## 1.1.0

### Minor Changes

- 06aabc2: Add `toSlug(ref)`: converts a reference string to a scripture.guide URL slug (e.g. "John 3:16" -> "john.3.16").

### Patch Changes

- 0dad274: Faster lookups: the per-language config and `cleanReference`'s compiled book-alias regexes are built once instead of on every call (about 4x faster on mixed references, same results).
- 39be84c: Reference detection no longer freezes on long or unusual text. The book-prefix pattern backtracked exponentially ("hiiii…", long runs of spaces or digits), failed candidates retried all 11 languages and rebuilt the verse index, each candidate was looked up several times, and several overlap checks were quadratic. A 50 KB article now takes about 15 ms instead of several seconds. Detection also stops merging references across a sentence end ("John 3:16. Mosiah 2:17") and no longer reads clock times ("at 4:15 pm") as verses.
- 0dc442a: References with nothing between them ("D&C 88:1-17 Matthew 11:28-30", or the same with dots) now resolve as separate references, and a multi-reference page keeps every reference in its URL.
- 21a4fa3: A range across books after another piece is no longer dropped: `lookupReference("John 3:16; Malachi 4:5-Matthew 1:2")` returns both pieces (it returned only "John 3:16"). Such a range does not change the running book, as on scripture.guide: in "John 3:16; Malachi 4:5-Matthew 1:2; 3" the bare "3" is John 3.
