# Web font licenses

The web fonts live in `public/css/webfont/`, are served at `/css/webfont/*`, and are
referenced by `public/css/style.css`. Each entry was identified from the font's own `name`
table (fontTools; IDs 4 full name, 0 copyright, 13 license, 14 license URL). For the `.eot`
and `.svg` files the embedded family/metadata strings were checked and match the
`.ttf`/`.woff` of the same name. Where a field is not in the file, it says so; "unknown"
means it could not be confirmed.

Checked 2026-10-20.

## Kept

| File(s) | Family (name ID 4) | Copyright holder | License | Source | Decision |
|---|---|---|---|---|---|
| `SortsMillGoudy-Regular.woff`, `SortsMillGoudy-Italic.woff` | Sorts Mill Goudy Regular / Italic (v003.101) | Copyright (c) 2010, Barry Schwartz (chemoelectric@chemoelectric.org) | SIL OFL 1.1 | https://github.com/google/fonts/blob/main/ofl/sortsmillgoudy/OFL.txt | Keep |
| `GoudyScripture.woff2` | Goudy Scripture (v2.000): Modified Version of Sorts Mill Goudy | Copyright (c) 2010, Barry Schwartz; modifications copyright (c) 2026, Scripture Guide | SIL OFL 1.1 (no Reserved Font Name) | `fonts/goudy-scripture/` at the repository root, built by `scripts/fonts/build-scripture-font.py` (see Goudy Scripture below) | Keep |
| `YanoneKaffeesatz-Light.woff`, `YanoneKaffeesatz-Regular.woff`, `YanoneKaffeesatz-Bold.woff` | Yanone Kaffeesatz Light / Regular / Bold (v1.003) | Copyright 2010 The Yanone Kaffeesatz Project Authors (https://github.com/yanone/kaffeesatz) | SIL OFL 1.1 | https://github.com/google/fonts/blob/main/ofl/yanonekaffeesatz/OFL.txt | Keep |
| `ShadowsIntoLight.woff2` | Shadows Into Light (v001.000) | Copyright (c) 2010, Kimberly Geswein (kimberlygeswein.com) | SIL OFL 1.1 | https://github.com/google/fonts/blob/main/ofl/shadowsintolight/OFL.txt | Keep |
| `SGBatang-Regular.woff2`, `SGBatang-Bold.woff2` | SG Batang: subset of KoPub Batang Regular / Bold (v1.01), renamed | Copyright 2014 Ministry of Culture, Sports and Tourism and Korea Publishers Society, Reserved Font Name 'KoPub Batang' | SIL OFL 1.1 | https://github.com/google/fonts/tree/main/ofl/kopubbatang | Keep |
| `NotoSerifDevanagari-Regular.woff2`, `NotoSerifDevanagari-Bold.woff2` | Noto Serif Devanagari, static subsets of the variable font | Copyright 2022 The Noto Project Authors | SIL OFL 1.1 | https://github.com/google/fonts/tree/main/ofl/notoserifdevanagari | Keep |

The copyright lines above are copied from each family's upstream `OFL.txt` in the
google/fonts repository. They are not all in the font files themselves: the Sorts Mill
Goudy and Yanone Kaffeesatz files have an empty copyright field (name ID 0) and carry only
the OFL URL.

OFL condition 2 requires each copy to contain the copyright notice and the license. Until
`OFL.txt` was added, the repository shipped neither alongside these fonts, so those earlier
copies did not meet that condition. `public/css/webfont/OFL.txt` now sits beside the
fonts (and is served at `/css/webfont/OFL.txt`) with the three copyright lines followed by
the full OFL 1.1 text, as Google Fonts packages it per family.

## Language fonts

Checked 2026-11-01 against `scripture_versions`: 89 English versions, 7 Korean (`KRBOM`, `KRSEB`,
`KLB`, `KRLDS`, `ERKRB`, `KRBOM67`, `KRREB`) and 1 Hindi (`HIBOM`). `versions.css` declares the faces,
which browsers download only on pages that use them.

Korean used to ask for KoPub Batang at `fonts.gstatic.com/ea/kopubbatang/v3/`. Those files now
return 404, although Google's CSS at `fonts.googleapis.com/earlyaccess/kopubbatang.css` still lists
them, so each device fell back to its own system font. `KLB` and `KRREB` were not in the rule at all.
The fonts are now self-hosted, so a third party cannot take them away again. `scripts/build-fonts.py`
rebuilds them from the google/fonts sources.

KoPub licensing: Google's copy is under the OFL, and "KoPub Batang" is a Reserved Font Name. A subset
is a Modified Version, so these files and the CSS family are named `SG Batang`. KOPUS's own download
page for the later KoPubWorld release says serving a font from a server for a web service needs
separate approval. These files do not come from that release. Do not swap them for a KoPubWorld
download without that approval.

The Korean subset holds the 2,350 KS X 1001 syllables plus every syllable the Korean versions use
(1,425 distinct), about 225 KB per weight. `body` uses `word-break: keep-all`, so Korean lines break
between words; it does not affect English. In Korean versions synthesized bold and oblique are off,
because Hangul has no true italic: headnotes are upright.

Pages with no version class (parallel view) get these fonts through the `body` stack. Those faces
(`SG Hangul`, the same files as `SG Batang`, and `Noto Serif Devanagari`) have a `unicode-range`, so
a page downloads them only if it has such characters.

## Goudy Scripture

The site's text font, 'Goudy Scripture' (`GoudyScripture.woff2`, upright only), is a Modified
Version of Sorts Mill Goudy (Barry Schwartz, SIL OFL 1.1, no Reserved Font Name): a faux bold of
its outlines, Sorts Mill Goudy's lining figures bolded to match, composite Cyrillic, Greek and
Vietnamese letters made from its parts, an en dash redrawn from the em dash, and a `calt` rule
that shows a hyphen between two digits as an en dash ("3:16-18" displays as "3:16–18"; the text
keeps its hyphen). Every glyph is OFL or Scripture Guide's own work, so the file is in the
repository and the Docker image like the other fonts, and `OFL.txt` lists it under Sorts Mill
Goudy's copyright line. The Chrome extension ships the same file for its badges
(`apps/chrome-extension/fonts/`, with its own `OFL.txt`).

The font of record is `fonts/goudy-scripture/` at the repository root (woff2, otf, `OFL.txt` and a
README). The copy here and the extension's are plain files, because the Docker image and webpack
need real files; `test/unit/scriptureFont.test.js` fails if either differs from the font of record.
To rebuild, run `scripts/fonts/build-scripture-font.py` from the repository root (its docstring
and `fonts/goudy-scripture/README.md` list the inputs and Python packages); it writes into
`fonts/goudy-scripture/`. Then copy the new `GoudyScripture.woff2` here and into
`apps/chrome-extension/fonts/`.

`style.css` declares two faces:

```css
@font-face {
  font-family: 'Goudy Scripture';
  font-style: normal;
  font-weight: 400 1000;
  font-display: swap;
  src: url('/css/webfont/GoudyScripture.woff2') format('woff2');
}
@font-face {
  font-family: 'Goudy Scripture';
  font-style: italic;
  font-weight: 400;
  font-display: swap;
  src: url('/css/webfont/SortsMillGoudy-Italic.woff') format('woff');
}
```

The outlines are already bold, so the upright face covers weights 400 to 1000 and browsers do not
synthesize bold from it: bold text and headings use the same outlines as body text. Italic text
(prompts, headnotes, summaries, backgrounds, `parallel.css`) uses Sorts Mill Goudy Italic, a real
italic, instead of an oblique the browser would synthesize. The italic face stays at 400, because
Sorts Mill Goudy Italic is light and bold italic still needs synthesizing.

Scripture text is `1.25rem` (20px by default, set on `.passage`, and sizes inside it scale in
`em`). The earlier Chrome-only `font-weight: 800` rule was removed: it suited the lighter Sorts Mill
Goudy but smeared this font.

The body stack in `style.css` is `'Goudy Scripture', 'Sorts Mill Goudy', 'SG Hangul', 'Noto Serif
Devanagari', Georgia, serif` (live before the Node app: `'Sorts Mill Goudy', 'Goudy', Georgia,
serif`). Characters the file lacks fall back per glyph to Sorts Mill Goudy, then Georgia. The home
page search box keeps its own `'Sorts Mill Goudy', serif` (`home.ejs`), as live does.

Until 2026-11 an earlier build, whose digits came from another font, was kept out of the
repository and the image and served from a directory mounted on the server. That setup is gone;
the repository's `docs/plans/` has its history.

### History: Goudy Old Style (removed)

Until 2026-10-20 the repository shipped these, declared as `@font-face 'Goudy'` in `style.css`
and used as the fallback after Sorts Mill Goudy:

| File(s) | Family | Copyright holder (from file) | License | Source |
|---|---|---|---|---|
| `Goudy-Regular.{eot,svg,ttf,woff}`, `Goudy-Bold.{eot,svg,ttf,woff}`, `Goudy-Italic.{eot,svg,ttf,woff}` | Goudy Old Style / Bold / Italic (v1.51) | "Data by URW, Type Solutions, Inc. © 1993. Microsoft Corporation. All rights reserved." | No license in file (IDs 13/14 empty). From the copyright string, this appears to be the Goudy Old Style that ships with Microsoft Office/Windows, not the OFL Goudy Bookletter 1911. Proprietary: no redistribution right is shown. | Unknown (converted with FontForge in 2016 per the `.svg` metadata) |

They were deleted, the asset parity corpus (`test/parity/corpus.mjs`) no longer requests them,
and `allow.json` records the `style.css` difference from live. They remain in git history (see
below).

## Removed

Nothing in `apps/web/public` or `apps/web/src` references these (checked by family and file
name). The live site still serves them, but no page uses them, so they were deleted in
`0c3c858`.

| File(s) | Family | Copyright holder (from file) | License | Notes |
|---|---|---|---|---|
| `Comfortaa-Regular.woff`, `Comfortaa-Bold.woff` | Comfortaa (v2.001) | Not in file | SIL OFL 1.1 (name ID 14) | Unused |
| `UnBatang.ttf`, `UnBatangBold.ttf` | Un Batang / Un Batang Bold (v1.00) | Copyright © 1998-2004 by Koaunghi Un | "GNU Public License" (name ID 13; URL `http://korea.gnu.org/copyleft/gpl.ko.html`). Whether this copy carries the font exception is not stated in the file. | Unused (Korean text uses SG Batang, see Language fonts) |
| `LotteMartBold.ttf` | 12LotteMartDreamBold | Not in file | Unknown (no license fields; not verified against Lotte Mart's terms) | Unused |
| `palatino.ttf` | Palatino (v1.0) | Not in file | Unknown (no copyright or license fields; unique ID "DHBK Tp.HCM:231:Palatino" suggests a modified third-party copy; Palatino is a Linotype design) | Unused |

## Git history

All of these files, including the Goudy Old Style files and the other removed ones, are in the
public GitHub repository's history. Deleting a file now does not remove it from history.
They have lived at three paths:

- `public/webfont/` in the web app's own history before it was merged in (first added in
  `921287b`, 2026-03-17),
- `apps/web/public/webfont/` from the subtree import (`172a48d`) until `eab50b2`,
- `apps/web/public/css/webfont/` from `eab50b2` on.

Anyone rewriting history has to filter all three paths. Rewriting history (and the related
force-push) is an owner decision and has not been done.
