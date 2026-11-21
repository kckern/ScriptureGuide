---
"scripture-guide": patch
---
`findReferences` and `detectReferences` no longer read a lone letter as a book: "L3", "L 3" and "L. 3" in running text are labels, not Luke 3. Two-letter abbreviations ("Lk 3:5", "Lu 3:16") still match, and `lookupReference('l3')` is still Luke 3.
