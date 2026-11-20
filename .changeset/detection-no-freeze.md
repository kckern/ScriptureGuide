---
"scripture-guide": patch
---

Reference detection no longer freezes on long or unusual text. The book-prefix pattern backtracked exponentially ("hiiii…", long runs of spaces or digits), failed candidates retried all 11 languages and rebuilt the verse index, each candidate was looked up several times, and several overlap checks were quadratic. A 50 KB article now takes about 15 ms instead of several seconds. Detection also stops merging references across a sentence end ("John 3:16. Mosiah 2:17") and no longer reads clock times ("at 4:15 pm") as verses.
