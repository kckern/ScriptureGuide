# Detect Baseline Hardening — Design

**Date:** 2026-08-19
**Status:** Implemented

## Problem

A bare-semicolon merge bug (`Jn 10.17–18;2 Nephi 2.8` instead of `Jn 10.17–18; 2 Nephi 2.8`)
and a span-clipping bug that emitted `;;` both shipped and survived the full test suite.
The suite did not merely miss them — it asserted them.

Post-mortem found four distinct failure modes:

1. **The snapshot encoded the bug.** `detect-snapshots.test.js.snap` contained
   `[Jn 10.17–18;2 Nephi 2.8|…]` as expected output. A snapshot asserts "output matches
   last time," never "output is correct." It was re-baselined twice for unrelated work
   (`f71f49e`, `fac1a5e`), each time re-blessing the malformation.
2. **A hand-written assertion did the same.** `chain-across-markers.test.js:19` asserted
   `'<a>1 Nephi 2:13;Helaman 8:21</a>.'` — copy-pasted from actual output rather than
   derived from what a citation should read like.
3. **The fixture was contaminated by the bug's own output.** Since its first commit
   (`2546920`), `test/prose-samples/en/testDetect.en.txt` lines 4 and 8 read
   `Isa 45.22;Morm 3.18;Moro 10.24for prophets` — bare separators and an eaten space,
   the bug's exact signature. The text was scraped from a page already rendered by the
   buggy pipeline, so input and output looked alike and the defect was camouflaged.
4. **No test asserted a property, only values.** Nothing said "a merged citation is
   well-formed" or "a rendered span re-parses to the same verse IDs." Value-equality over
   a 3KB blob cannot express that.

## Contract

Merging is lossy **by design**: `(Jn 10.17-18; see 2 Nephi 2.8n)` renders as
`([Jn 10.17-18; 2 Nephi 2.8]n)` — the word `see` is dropped and ` and ` is rewritten to
`; `. We keep that normalizing behavior. The invariants are therefore calibrated to it
rather than to a naive `strip(output) === input`.

## Design

### 1. Invariant harness

`test/helpers/detect-invariants.js` exports `assertDetectInvariants(input, opts)`.
It runs `detectReferences` with a sentinel-wrapping callback that records every
`(text, verseIds)` pair, then asserts:

**I1 — Outside-text preservation.** Splitting the output on the sentinel yields
non-reference pieces at even indices. Each must occur in the *input*, in order, with a
monotonically advancing cursor. Guards span-arithmetic bugs: the full-document
contamination bug (`[1 ;`) and the eaten-space bug both break this immediately.

**I2 — Strict span grammar.** Every rendered span is trimmed, contains no `;;` and no
double space, has `;`/`,` always followed by a space, ends on no separator, and starts
with a word character. Direct guard on the bug just fixed.

**I3 — Round-trip, two-way classified.** For each span, `lookupReference(span.text)`:
- non-empty result → must equal the verse IDs handed to the callback, exactly;
- empty result → the span must match the implied-reference shape (`vv.`/`v.`/bare
  `chapter:verse`, no book name).

Garbage such as `"1 ;"` satisfies neither branch and fails. The classification is required
because context-derived spans (`vv. 20–24`) legitimately cannot parse standalone —
6 such spans exist in `vvtest-en.txt` under `contextAware: true`.

The harness is driven over every detect fixture, every prose sample, and both
`contextAware` modes, so all existing corpora gain invariant coverage with no new
hand-maintained expectations.

### 2. Fixture hygiene

`test/detect/fixture-hygiene.test.js` asserts every file under `test/prose-samples/` is
clean *input*: no `;`/`,` immediately followed by a word character, no digit fused to a
following lowercase word. This tests the corpus rather than the code, and is the check
that would have stopped the original paste.

`testDetect.en.txt` lines 4 and 8 are decontaminated to
`…Isa 45.22; Morm 3.18; Moro 10.24 for prophets addressing…`. This moves the snapshot;
re-baseline as a deliberate reviewed diff, never a blind `-u` sweep.

### 3. Adversarial corpus

`test/fixtures/en/detect/adversarial.yml`, same schema as `critical.yml`, covering inputs
no real document supplied:

- no space after separators — `D&C 58:2-4; 136:31;1 Cor. 10:13`, `1 Ne. 3:7,8;Mosiah 3:19`
- separators already doubled in source — `Isa 1:1;; Isa 2:2`
- reference flush against string start/end and against `(`, `)`, newline
- overlapping-abbreviation trap — `1 Ne 8.15–18` in a document also naming `3 Ne`, `2 Ne`, Nehemiah
- sentence-boundary non-merge — two `(see …)` citations in adjacent sentences
- unicode — en/em-dash ranges, non-breaking space, curly quotes
- the same reference repeated adjacently

Each case carries an explicit hand-derived `expected_output` **and** passes through the
invariant harness.

## Verification

The new invariant tests must **fail** against the pre-fix code (`git stash` the `src/`
changes). A guard that passes both before and after the fix guards nothing.

## What implementation found

The design above was sound but incomplete. Wiring the invariants required fixing
the fixture loader, which exposed a far larger problem.

### The loader was reading 25 of 703 fixture cases

`loadFixtures()` globbed `test/fixtures/*.yml`, matching only the flat aggregated
`en.yml`/`ko.yml`. The real corpus lives in `test/fixtures/<lang>/<fn>/<tier>.yml`
and held 703 cases that nothing loaded. `detect.negative.test.js` resolved to
**zero** cases and passed silently -- `describe.each([])` is a no-op, so 45
false-positive guards reported green without ever executing. The aggregated
`en.yml` turned out to be a byte-identical subset of the per-tier files.

Suite size after the fix: **76 tests -> 2,325**.

### Bugs the newly-live corpus found

| Fix | Cause |
| --- | --- |
| `"the aspect ratio is 16:9"` detected Isaiah 16:9 | `is` (Isaiah), `am` (Amos) etc. matched case-insensitively. New `capitalized_only` list in `data/shared/en.yml`: these count only when capitalized, so `Is 16:9` resolves and the English verb does not. Full book names are unaffected -- lowercase `leviticus 19` still matches. |
| `"Exodus 3D"` detected Exodus 3 | An uppercase letter fused to the closing digit now invalidates a match. Evidence-backed: 1 such occurrence corpus-wide (the false positive) vs 10 legitimate lowercase footnote markers (`1 Ne 8.15-18n`, `Heb 11:1ff`). |
| `"2 Ne. 21:10-12 & 2 Ne. 27:26"` rendered a link that would not re-parse | `&` was a joiner for detection but unparseable by lookup. New pre-rule joins on `&` **only after a digit**, so the book names `D & C` and `Doctrine & Covenants` survive -- caught immediately by the newly-live lookup fixtures. |
| `en-detect-prose-004` expected `Revelation 20:8-11` for input `Exod 20:8-11` | The fixture was wrong and the detector right. It had never run. |

### Findings recorded rather than fixed

- **The `contextAware: false` path still has the original bug.** It emits
  `[Isa 1:1;; Isa 2:2]` and `[D&C 58:2-4; 136:31;1 Cor. 10:13]`. The fix landed
  only on the contextAware path. Quarantined in `adversarial.yml`.
- **A non-breaking space defeats detection entirely** -- the book/chapter gap
  pattern accepts only `[ \t]`, and U+00A0 is routine in copy-pasted text.
- **10 lookup variants do not resolve**, including the canonical common name
  `Song of Solomon` itself. `Jm 1:1` is a disputed fixture (it expects Jarom;
  James is conventional).
- **`generateReference` throws** on an id past the end of the RLDS id space
  (`loadRefsFromRanges` dereferences an empty range).
- 5 negative cases are **inherently ambiguous** (`Mark 2` as a name, `Genesis 3`
  as a console) and cannot be fixed without semantics.

Everything above is quarantined via a `known_issue` field on the fixture case, or
a tag in the shared `UNIMPLEMENTED_FEATURES` list. Quarantined cases still load
and report as skips carrying their reason: 121 skipped, none deleted, none silent.

### Guard verification

Reverting the two original bug-fix lines and re-running produces **21 failures**
across the invariant sweep, the adversarial corpus, and the snapshot. Restoring
them returns the suite to green. The guards detect the bug they were built for.

## Out of scope

Flagged as real, deferred by decision:

- A lint pass over `.snap` content so re-baselining cannot silently bless a malformed citation.
- Build wiring: `test:jest` has no prebuild step and `dist/` is gitignored, so snapshot
  tests (which import `dist/`) can pass against a stale build while `src/` changes go
  unverified. Partly mitigated: the invariant sweep runs against **both** `src` and
  `dist`, so a stale bundle now surfaces as a failure there.
