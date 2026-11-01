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

## Served privately

The site's text font is the owner's licensed "Goudy Scripture" (one file, `scripture.woff2`:
upright, 563 glyphs including Latin Extended and Cyrillic). Its metadata is mixed (usWeightClass
400, but the Bold subfamily and style bits) and its outlines are heavy, about as heavy as Goudy
Old Style Bold, so nothing should thicken it further. The owner is licensing
it (decision 2026-10-20). A licence lets the site serve the font to visitors; it does not allow
publishing the file in this public repository or in the Docker image. So the file is never
committed or built into the image, and the app only points at it.

| Env | Meaning |
|---|---|
| `FONT_BASE` | URL or path the font is fetched from, e.g. `https://media.scripture.guide/fonts` or `/private-fonts`. A trailing slash is dropped; a value that is empty without it (`/`) is ignored with a warning. |
| `FONT_DIR` | A directory on the app's file system, served at `/private-fonts` (only when set; no directory listing, `Cache-Control: public, max-age=2592000`, 30 days). With `FONT_DIR` and no `FONT_BASE`, `FONT_BASE` defaults to `/private-fonts`. |
| `FONT_GOUDY_FILE` | File name under `FONT_BASE`. Default `scripture.woff2`. The `format()` follows the extension (`woff2`, `woff`, `ttf`, `otf`). |

With `FONT_BASE` or `FONT_DIR` set, the layout (`src/presentation/views/layouts/main.ejs`)
emits, after the stylesheets, a `<style id="private-fonts">` with two faces:

```css
@font-face {
  font-family: 'Goudy Scripture';
  src: url('<FONT_BASE>/scripture.woff2') format('woff2');
  font-weight: 400 1000;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'Goudy Scripture';
  src: url('/css/webfont/SortsMillGoudy-Italic.woff') format('woff');
  font-weight: 400;
  font-style: italic;
  font-display: swap;
}
```

The licensed file is upright only, so italic text (prompts, headnotes, summaries, backgrounds,
`parallel.css`) uses Sorts Mill Goudy Italic, a real italic, instead of an oblique the browser
would synthesize. The upright face covers weights 400 to 1000, so browsers do not synthesize bold
from it: bold text and headings use the same outlines as body text. The italic face stays at 400,
because Sorts Mill Goudy Italic is light and bold italic still needs synthesizing.

Scripture text is `1.25rem` (20px by default, set on `.passage`, and sizes inside it scale in
`em`). The earlier Chrome-only `font-weight: 800` rule was removed: it suited the lighter Sorts Mill
Goudy but smeared this font. Without the private font, verses therefore render at regular weight
in Sorts Mill Goudy in Chrome too.


Neither set: no `@font-face` for `'Goudy Scripture'`, so the page requests no font that would
404. At startup, when the font comes from `FONT_DIR` (`FONT_BASE` unset or `/private-fonts`)
and `FONT_DIR/<FONT_GOUDY_FILE>` does not exist, the app logs a warning and emits no
`@font-face` either. An external `FONT_BASE` is not checked.

The body stack in `style.css` is `'Goudy Scripture', 'Sorts Mill Goudy', 'SG Hangul', 'Noto Serif Devanagari', Georgia, serif` (live:
`'Sorts Mill Goudy', 'Goudy', Georgia, serif`). With the private font configured, it is the text
font; without it, the browser has no `'Goudy Scripture'` face and uses Sorts Mill Goudy, as
before. No standard system font has this family name, but a machine with Goudy Scripture installed locally uses that copy when nothing is configured, so test the Sorts Mill Goudy fallback on another machine. Notes:

- Characters the file lacks (outside Latin, Latin Extended and Cyrillic) fall back per glyph to
  Sorts Mill Goudy, then Georgia.
- From another origin (`FONT_BASE=https://…`), that host must send
  `Access-Control-Allow-Origin` for the site's origins, or browsers refuse the font.
- Replacing the font: browsers and proxies may keep the old file for 30 days, so give the new
  file a new name (e.g. `scripture-2.woff2`) and set `FONT_GOUDY_FILE` to it instead of
  overwriting `scripture.woff2`.
- Content Security Policy is off (`contentSecurityPolicy: false` in `src/app/middleware/headers.js`).
  When it is turned on, it has to allow the font and the block that declares it: `font-src
  'self'` plus the `FONT_BASE` origin when that is external, and `style-src` that permits this
  inline `<style>` (`'unsafe-inline'`, which the layout's other inline styles already need, or a
  nonce/hash).
- The home page search box keeps its own `'Sorts Mill Goudy', serif` (`home.ejs`), as live does.

Deploying on bom: put the file in a host directory outside the repository and the image, mount
it read-only into the web container and point `FONT_DIR` at it:

```yaml
  web:
    environment:
      FONT_DIR: /fonts
    volumes:
      - /srv/scripture-guide/fonts:/fonts:ro   # holds scripture.woff2, readable by uid 1000 (node)
```

Then check `curl -sI https://scripture.guide/private-fonts/scripture.woff2` returns 200 with
`Content-Type: font/woff2`, a page's `<head>` has `<style id="private-fonts">`, and the
start-up log has no `FONT_DIR: … not found` warning.

`.gitignore` and the root `.dockerignore` (the image's build context is the repository root)
exclude, in any case and anywhere in the tree, `goudy*` and `scripture*` font files
(`.woff`, `.woff2`, `.ttf`, `.otf`, `.eot`), so a copy dropped into the tree is neither committed
nor built into the image. Source files named `scripture*` (e.g. `scripture.ejs`,
`scriptures.mjs`) are not matched.

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
