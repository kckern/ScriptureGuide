# scripture-guide

## 1.1.0

### Minor Changes

- 06aabc2: Add `toSlug(ref)`: converts a reference string to a scripture.guide URL slug (e.g. "John 3:16" -> "john.3.16").

### Patch Changes

- 0dad274: Faster lookups: the per-language config and `cleanReference`'s compiled book-alias regexes are built once instead of on every call (about 4x faster on mixed references, same results).
- 21a4fa3: A range across books after another piece is no longer dropped: `lookupReference("John 3:16; Malachi 4:5-Matthew 1:2")` returns both pieces (it returned only "John 3:16"). Such a range does not change the running book, as on scripture.guide: in "John 3:16; Malachi 4:5-Matthew 1:2; 3" the bare "3" is John 3.
