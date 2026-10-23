---
"scripture-guide": patch
---

A range across books after another piece is no longer dropped: `lookupReference("John 3:16; Malachi 4:5-Matthew 1:2")` returns both pieces (it returned only "John 3:16"), and a bare chapter after such a range takes the book it ends in.
