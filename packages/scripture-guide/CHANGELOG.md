# scripture-guide

## 1.1.0

### Minor Changes

- 06aabc2: Add `toSlug(ref)`: converts a reference string to a scripture.guide URL slug (e.g. "John 3:16" -> "john.3.16").

### Patch Changes

- 0dad274: Faster lookups: the per-language config and `cleanReference`'s compiled book-alias regexes are built once instead of on every call (about 4x faster on mixed references, same results).
- 39be84c: Reference detection no longer freezes on long or unusual text. The book-prefix pattern backtracked exponentially ("hiiii…", long runs of spaces or digits), failed candidates retried all 11 languages and rebuilt the verse index, each candidate was looked up several times, and several overlap checks were quadratic. A 50 KB article now takes about 15 ms instead of several seconds. Detection also stops merging references across a sentence end ("John 3:16. Mosiah 2:17") and no longer reads clock times ("at 4:15 pm") as verses.
- 0dc442a: References with nothing between them ("D&C 88:1-17 Matthew 11:28-30", or the same with dots) now resolve as separate references, and a multi-reference page keeps every reference in its URL.
- 21a4fa3: A range across books after another piece is no longer dropped: `lookupReference("John 3:16; Malachi 4:5-Matthew 1:2")` returns both pieces (it returned only "John 3:16"). Such a range does not change the running book, as on scripture.guide: in "John 3:16; Malachi 4:5-Matthew 1:2; 3" the bare "3" is John 3.
