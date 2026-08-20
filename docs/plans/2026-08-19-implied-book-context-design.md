# Implied-Book Context — Design Brief

**Date:** 2026-08-19
**Status:** Implemented — option (1) preceding-token gate composed with (3) sentence scoping,
behind `strictImpliedBooks` (defaults to the strict behavior). Fixtures at
`test/fixtures/en/detect/implied-book.yml`, spec at `test/detect/implied-book.test.js`.
Suite after the change: **36 suites, 2244 passed, 126 skipped, 0 failed** (baseline 34/2204/121).

**Outstanding, deliberately not done here:**
- §5 rows `1 Nephi (see 1:16…)` and `Jeremiah including 16:16…` are quarantined, not fixed.
  A book name with no digit after it produces no explicit match, so `findBookContexts` records no
  context at all — both return `[]` on 1.0.97 too. Admitting bare book names as contexts is a
  separate change.
- §6 blast-radius sweep HAS now been run, over all 51,581 rows of `bom_xtras_commentary`
  (69MB, 61 sources; 27,815 bodies contain a bare `n:m` candidate). Method: each body detected twice,
  `strictImpliedBooks:false` vs the new default, diffed on `(start,end,ref)` and again on verse-id
  coverage. Corpus stayed outside the repo.

  | Measure | Result |
  |---|---|
  | Links, old -> new | 105,135 -> 103,694 (-1,441) |
  | Bodies changed | 941 of 27,815 (3.4%) |
  | Dropped links | 1,575 |
  | ...of which duplicates already covered elsewhere in the body | 200 |
  | ...of which FALSE links removed | **1,276 (92.8% of real losses)** |
  | ...of which correct links lost | **99 (0.09% of all links)** |
  | Genuinely new links | **0** (the gate only ever refuses) |

  The 99 collateral losses concentrate in bodies whose inline markup is malformed
  (`"1 Ne. 3:161 Nephi 3:16`, book name and verse split across table cells), where the explicit
  matcher fails and the implied pass was accidentally covering for it. Well-formed prose is
  essentially unaffected. This supports defaulting `strictImpliedBooks: true`.

  An earlier revision also scanned the whole gap for a sentence boundary; the sweep showed that
  vetoed 375 correct parenthetical binds ('...of the Lord" (1:12)'), and it was removed. Only the
  token immediately before the number decides.

- Known remaining gap: citation connectives in other languages ("siehe", "voir") are not recognised
  when non-English text is detected with the English config, because the connective set comes from
  `lang_extra.joiners`. 3 occurrences in the corpus. The fix is to detect with the right language
  config, not to hardcode foreign markers into the English list.
- Separate pre-existing bug found while writing fixtures: `JS—H 2:20` resolves to
  `Joseph Smith—History 1:2` instead of failing (JS—H has one chapter).
**Reported from:** bookofmormon.online `/commentary/1229609101`, alongside the separator bugs fixed in 1.0.97

> **For Claude:** This is a brief, not a task list — the design decision is genuinely open.
> REQUIRED SUB-SKILL: start with `superpowers:brainstorming` to settle the approach against the
> evidence below, then `superpowers:test-driven-development` to implement it. Do **not** start
> editing `scriptdetectcontext.mjs` before you have the acceptance fixtures (§5) failing.

## 1. The bug

`findImpliedReferences` links a bare `chapter:verse` by binding it to the nearest preceding book
context. The only guard is a character-distance budget, so it happily reaches across sentence
boundaries, bibliographic citations, and the names of books that are not in the canon.

Minimal reproducer:

```js
detectReferences(
  "Job 23:10; Teachings of the Prophet Joseph Smith, p. 185; Lectures on Faith, 6:3",
  (s) => `[${s}]`
)
// actual:   "[Job 23:10]; Teachings of the Prophet Joseph Smith, p. 185; Lectures on Faith, [6:3]"
// wanted:   "[Job 23:10]; Teachings of the Prophet Joseph Smith, p. 185; Lectures on Faith, 6:3"
```

`6:3` there is a lecture-and-paragraph number. It renders as a live link to Job 6:3 on production
today.

## 2. Where it lives

`src/scriptdetectcontext.mjs`

| Lines | What |
|---|---|
| `184-242` | `findImpliedReferences` — the whole implied pass |
| `191` | `verseGroupPattern` — the `vv. 3-5` form. Well-anchored; **not** the problem. |
| `213` | `chapterVersePattern = /\b(\d+):(\d+…)/g` — matches *any* `n:m` in the document |
| `221-227` | the only rejection: skip if the span is inside an already-found explicit match |
| `230` | `getNearestBookContext(position, bookContexts, options.maxContextDistance)` |
| `155-173` | `getNearestBookContext` — nearest preceding context within `maxContextDistance` |

`maxContextDistance` defaults to **500 characters** (`scriptures.mjs:851`).

`contextScope: 'sentence'` is declared in `detectReferences`' defaults (`scriptures.mjs:850`) and in
`findReferences`' (`scriptures.mjs:893`) — and is **never read anywhere in the codebase**. Grep it.
The option has been inert since it was introduced; distance is the only thing gating the bind.

## 3. Evidence

Run over 400 real commentary bodies from the consuming app: **35 implied-book links, of which
roughly 20 are wrong.** They fall into four groups.

**(a) Bibliographic volume:page — the reported class.** A book title or editor list ends the clause,
then a volume:page pair:

```
Kelly Ogden, Studies in Scripture, ed by K. Jackson,   ⟦7:19-20⟧
Ogden and Skinner, Book of Mormon,                     ⟦1:15⟧
McConkie and Millet, Doctrinal Commentary,             ⟦1:26–27⟧
Reynolds and Sjodahl, Commentary on the Book of Mormon,⟦1:10⟧
Lectures on Faith,                                     ⟦6:3⟧
```

**(b) A non-canonical work named immediately before the number.** The preceding token *is* a book
name — just not one in the canon — so binding to some earlier canonical book is doubly wrong:

```
there are two references in the Apocrypha: 2 Maccabees ⟦1:36⟧
…are called "angels," (Enoch                           ⟦7:2⟧
…like the Sun of righteousness” (Testament of Judah    ⟦24:1⟧
…while raised on high is also found in the Apocalypse of Abraham ⟦17:3–21⟧
```

**(c) A canonical book named immediately before, where the explicit matcher should have won.**

```
Why Does Nephi Begin by Saying ‘I, Nephi …’? (1 Nephi  ⟦1:1⟧
…described as enervating (JS—H 2:20, Moses             ⟦27:29; Acts 9:3–6⟧
```

`Moses ⟦27:29⟧` is the sharpest one: Moses has 8 chapters, so `27:29` cannot belong to the book
sitting right in front of it, yet it still resolved — against a context from earlier in the sentence.

**(d) Correct binds, which any fix must preserve.** These are the reason the feature exists:

```
…judgment and justice in the earth” (Jeremiah 23:5; see also ⟦33:15⟧
…some of these were from Jeremiah including ⟦16:16; 30:18-21; 31:1,6,8,27-28,32-33; 50:4-5⟧
…"secret lying conspiracy" (the term is also used in Jeremiah 11:9; see ⟦12:6⟧
…Lehi’s dream is only one of several dreams mentioned in 1 Nephi (see ⟦1:16; 3:1; 8:2⟧
…“all of which were on the east borders by the seashore” (Alma 31:3, italics added; ⟦51:22, 26, 32⟧
…(Lev. 3:1, 6, 12), accompanied by unleavened baked goods (⟦7:12–13⟧
…a person was to ‘sacrifice the sacrifices of thanksgiving’ (⟦107:22⟧   [context: Psalm 107]
```

### The insight to design around

Look at what separates (d) from (a)–(c): it is **not** distance. Several correct binds sit further
from their context than `Lectures on Faith, 6:3` does from `Job 23:10`. What actually separates them
is the **token immediately preceding the number**:

- correct binds are preceded by a citation connective — `see`, `see also`, `including`, `;`, `(`,
  `italics added;`, or a bare open paren continuing a citation already in progress;
- wrong binds are preceded by a **title, a proper name, or a non-canonical book name** — `Faith,`,
  `Commentary,`, `Jackson,`, `Enoch`, `Testament of Judah`, `Moses`.

Tuning `maxContextDistance` down cannot separate these two sets. Do not spend effort there.

## 4. Design options

Ordered by how well they match the evidence. Pick in `brainstorming`, argue against the fixtures.

1. **Preceding-token gate (recommended).** Before binding, look at the ~40 characters immediately
   before the `n:m` match. Bind only when that tail is citation material — a joiner from
   `lang_extra.joiners`, an opening bracket, a comma/semicolon following an established reference, or
   whitespace after one. Refuse when the tail ends in a word that is not a joiner. This kills (a),
   (b) and (c) and leaves every case in (d) intact. It is also language-configurable, which matters:
   `lang_extra` already carries the joiner list per language.
2. **Blocklist the shape `Title, n:m`.** Refuse when the immediately-preceding token is capitalised
   and not a known book, or when a `p.`/`pp.`/`vol.` marker appears in the same clause. Narrower than
   (1), catches (a) but not (b) or (c).
3. **Actually implement `contextScope: 'sentence'`.** Stop the context search at the nearest sentence
   boundary before the match. Cheap and honest — the option already claims to do this — but on the
   evidence it is not sufficient alone: `(Enoch 7:2)` and `Lectures on Faith, 6:3` sit in the same
   sentence as their false context. Good as a second guard, not as the fix.
4. **Require chapter plausibility.** Refuse when the chapter number exceeds the chapter count of the
   candidate book. Would have killed `Moses 27:29` and `Doctrinal Commentary 1:26–27` only when the
   numbers happen to overflow — a cheap extra filter, never a primary gate.

Options (1) and (3) compose well. Consider shipping both, with (4) as a backstop.

Whatever you choose, it must be **reachable from options** so consumers can opt out. Follow the
`chainAcrossMarkers` precedent in `scriptures.mjs:818-837`: a named boolean, defaulting to the new
safer behavior only if the blast-radius measurement in §6 supports it, otherwise defaulting to
today's behavior for one release.

## 5. Acceptance fixtures

Write these **first**, as a new `test/fixtures/en/detect/implied-book.yml` plus a spec that walks it.
Match the fixture-loader conventions already used by `test/detect/detect.negative.test.js` and
`adversarial.yml`.

**Must NOT produce an implied link:**

| Input tail | Why |
|---|---|
| `Job 23:10; … Lectures on Faith, 6:3` | lecture:paragraph |
| `Ogden and Skinner, Book of Mormon, 1:15` | volume:page |
| `McConkie and Millet, Doctrinal Commentary, 1:26–27` | volume:page |
| `Studies in Scripture, ed by K. Jackson, 7:19-20` | volume:page |
| `…are called "angels," (Enoch 7:2)` | non-canonical book |
| `…righteousness” (Testament of Judah 24:1)` | non-canonical book |
| `…found in the Apocalypse of Abraham 17:3–21` | non-canonical book |
| `there are two references in the Apocrypha: 2 Maccabees 1:36` | non-canonical book |
| `(JS—H 2:20, Moses 27:29, Acts 9:3–6)` | Moses has 8 chapters |

**Must STILL produce the implied link:**

| Input | Expected |
|---|---|
| `(Jeremiah 23:5; see also 33:15)` | Jeremiah 33:15 |
| `…used in Jeremiah 11:9; see 12:6` | Jeremiah 12:6 |
| `…mentioned in 1 Nephi (see 1:16; 3:1; 8:2)` | 1 Nephi 1:16, 3:1, 8:2 |
| `…(Alma 31:3, italics added; 51:22, 26, 32)` | Alma 51:22, 26, 32 |
| `(Lev. 3:1, 6, 12) … unleavened baked goods (7:12–13)` | Leviticus 7:12-13 |
| `…from Jeremiah including 16:16; 30:18-21; 50:4-5` | Jeremiah, those verses |
| `vv. 3-5` after any explicit chapter context | unchanged — the `verseGroupPattern` path |

Also run the existing invariant harness (`test/helpers/detect-invariants.js`,
`assertDetectInvariants`) over every new fixture. It is the thing that would have caught the 1.0.97
bugs, and it is cheap to extend.

## 6. Verification protocol

**Do not trust a green suite until you have rebuilt.** `dist/` and `src/data/` are gitignored and
most test files import `../../dist/scriptures.mjs`, not `src/`. Run `npm run build` after every
source edit or the suite is asserting against stale output.

```bash
npm run build
node --experimental-vm-modules node_modules/jest/bin/jest.js
```

Baseline on `44593b6` (1.0.97): **34 suites, 2204 passed, 0 failed, 121 skipped.** Any new failure is
yours.

**Snapshots are not evidence.** `detect-snapshots.test.js.snap` asserts "same as last time," and it
encoded the bare-`;` bug for two releases. If your change moves a snapshot line, read every moved
line and justify it in the commit message before running `-u`. See
`docs/plans/2026-08-19-detect-baseline-hardening-design.md` for that post-mortem.

**Measure the blast radius on real prose before releasing.** The corpus that produced §3 is the
`bom_xtras_commentary` table in the consuming app's database — it is third-party commentary text and
**must not be committed to this repo**. Ask the maintainer to run the differential sweep, or run it
yourself from the BoM workspace. The method:

1. Install the current published version into a scratch dir; import your patched `src/` alongside it.
2. Run `detectScriptures` over every body with a sentinel-wrapping callback.
3. Classify each body as identical / separator-formatting-only / structurally different, where
   "structural" means the sequence of linked payloads changed.
4. Read **every** structural diff by hand and classify it as a fix or a regression.

For reference, 1.0.95 → 1.0.97 over 400 bodies was 320 / 78 / 2. A correct fix here should show
roughly 20 structural diffs, every one of them removing a link, and **zero** removing a link from
group (d).

## 7. Release gotchas

- `prepublishOnly` is `npm version patch && npm run build`, so `npm publish` bumps by itself. Running
  `npm version patch` first double-bumps and burns a number — that is why 1.0.94 and 1.0.96 are git
  tags that never reached npm. Check `npm view scripture-guide versions` before promising a version
  to anyone.
- Other sessions work in this repo concurrently and it keeps worktrees under `.worktrees/`. Re-check
  `git log` and `npm view` immediately before publishing; uncommitted edits left in the shared tree
  have been swept into another branch mid-session.
- The consuming app pins this package in `frontend/webapp/package.json`. A prod rollout is a
  frontend-only static-asset layer, not a rebuild — the maintainer has that procedure.

## 8. Out of scope

- The separator bugs (bare `;` join, `;;` from clipped spans) — fixed in 1.0.97.
- `Hel. 10:36` and similar unresolvable citations. Helaman 10 ends at verse 19; returning zero
  verse_ids and leaving the text unlinked is correct. Do not add clamping or fuzzy fallback.
- `verseGroupPattern` (`vv. 3-5`, `verses 3-5`). It is anchored on an explicit verse marker and shows
  no false positives in the corpus. Leave it alone.
