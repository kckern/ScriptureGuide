---
"scripture-guide": patch
---
- `lookupReference` reads each part of a list as it reads alone: "4 Ne 1; JS-H 1" is two whole chapters, "Gen 1; Mt 5:3, 7" no longer drops Matthew, and "D&C 76:22, 23; 88" keeps section 88.
- References written with HTML entity dashes ("Mt 5:3&ndash;5", "Ex 20:1&minus;17") and the minus sign "−" are detected and looked up as ranges.
- `detectReferences` honours the `chapterOnly` and `abbreviations` options, as `findReferences` does, also for spans written with entities.
