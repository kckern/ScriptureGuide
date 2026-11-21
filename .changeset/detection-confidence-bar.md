---
"scripture-guide": patch
---
Detection (`detectReferences`, `findReferences`) asks for more evidence when a match is thin, while `lookupReference` is unchanged (`lookupReference('l3')` is still Luke 3):

- A chapter-only match needs a book of four or more letters, or two or three starting with a capital: "Lk 21", "Mt 24", "Luke 3" and "D&C 4" are linked; "L3", "lu 3", "gen 1" and "d&c 4" in running text are not. With a verse, lowercase is fine ("rom 8:28").
- A single letter needs a capital and a ":" verse ("L 3:16"); "L3.5" and "l 3:30" are not references. A numbered book counts as two letters, so French "1 S 3,10" and "2 R 5,14" still link.
- Only the first number decides: "L 3, 4:5" is not carried by the later "4:5"; "lu 3. 5" is not a verse.
- A lowercase copy of an accepted reference elsewhere in the text is no longer linked on its strength ("Lu 3 … lu 3").
- A "v. 16" no longer binds to an earlier citation past a label detection rejected ("Mt 5:3 … lu 3 (v. 16)").

This replaces 1.1.2's lone-letter rule, which also skipped "L 3:16".
