---
"scripture-guide": patch
---

Faster lookups: the per-language config and `cleanReference`'s compiled book-alias regexes are built once instead of on every call (about 4x faster on mixed references, same results).
