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

The copyright lines above are copied from each family's upstream `OFL.txt` in the
google/fonts repository. They are not all in the font files themselves: the Sorts Mill
Goudy and Yanone Kaffeesatz files have an empty copyright field (name ID 0) and carry only
the OFL URL.

OFL condition 2 requires each copy to contain the copyright notice and the license. Until
`OFL.txt` was added, the repository shipped neither alongside these fonts, so those earlier
copies did not meet that condition. `public/css/webfont/OFL.txt` now sits beside the
fonts (and is served at `/css/webfont/OFL.txt`) with the three copyright lines followed by
the full OFL 1.1 text, as Google Fonts packages it per family.

## Needs owner decision

| File(s) | Family | Copyright holder (from file) | License | Source | Decision |
|---|---|---|---|---|---|
| `Goudy-Regular.{eot,svg,ttf,woff}`, `Goudy-Bold.{eot,svg,ttf,woff}`, `Goudy-Italic.{eot,svg,ttf,woff}` | Goudy Old Style / Bold / Italic (v1.51) | "Data by URW, Type Solutions, Inc. © 1993. Microsoft Corporation. All rights reserved." | No license in file (IDs 13/14 empty). From the copyright string, this appears to be the Goudy Old Style that ships with Microsoft Office/Windows, not the OFL Goudy Bookletter 1911. Treat as proprietary: no redistribution right is shown. | Unknown (converted with FontForge in 2016 per the `.svg` metadata) | Needs owner decision |

`style.css` declares `@font-face { font-family: 'Goudy' }` from these files and uses it as a
fallback after Sorts Mill Goudy, so deleting them would change requests the page makes and
break asset parity. Options:

- (a) Keep the files as they are and accept the risk.
- (b) Serve them from an external `FONT_BASE` (e.g. `https://media.scripture.guide/fonts`)
  and rewrite the `url()`s in `style.css`. This only takes the files out of the repository.
  The site still sends the font to every visitor, so it is still distribution and does not
  resolve the licensing issue.
- (c) Substitute an OFL equivalent, e.g. Goudy Bookletter 1911 (The League of Moveable
  Type), or drop the `'Goudy'` fallback and rely on Sorts Mill Goudy alone. This is the
  only option that resolves the licensing issue. It changes the font requests the page
  makes, so the asset parity corpus (`test/parity/corpus.mjs`) has to change with it.

None of these has been implemented.

## Removed

Nothing in `apps/web/public` or `apps/web/src` references these (checked by family and file
name). The live site still serves them, but no page uses them, so they were deleted in
`0c3c858`.

| File(s) | Family | Copyright holder (from file) | License | Notes |
|---|---|---|---|---|
| `Comfortaa-Regular.woff`, `Comfortaa-Bold.woff` | Comfortaa (v2.001) | Not in file | SIL OFL 1.1 (name ID 14) | Unused |
| `UnBatang.ttf`, `UnBatangBold.ttf` | Un Batang / Un Batang Bold (v1.00) | Copyright © 1998-2004 by Koaunghi Un | "GNU Public License" (name ID 13; URL `http://korea.gnu.org/copyleft/gpl.ko.html`). Whether this copy carries the font exception is not stated in the file. | Unused (Korean text uses KoPub Batang from Google Fonts in `versions.css`) |
| `LotteMartBold.ttf` | 12LotteMartDreamBold | Not in file | Unknown (no license fields; not verified against Lotte Mart's terms) | Unused |
| `palatino.ttf` | Palatino (v1.0) | Not in file | Unknown (no copyright or license fields; unique ID "DHBK Tp.HCM:231:Palatino" suggests a modified third-party copy; Palatino is a Linotype design) | Unused |

## Git history

All of these files, including the Goudy Old Style files and the removed ones, are in the
public GitHub repository's history. Deleting a file now does not remove it from history.
They have lived at three paths:

- `public/webfont/` in the web app's own history before it was merged in (first added in
  `921287b`, 2026-03-17),
- `apps/web/public/webfont/` from the subtree import (`172a48d`) until `eab50b2`,
- `apps/web/public/css/webfont/` from `eab50b2` on.

Anyone rewriting history has to filter all three paths. Rewriting history (and the related
force-push) is an owner decision and has not been done.
