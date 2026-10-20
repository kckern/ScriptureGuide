# Web font licenses

Fonts in this directory are served at `/css/webfont/*` and referenced by `../style.css`.
Each entry was identified from the font's own `name` table (fontTools; IDs 4 full name,
0 copyright, 13 license, 14 license URL). For the `.eot` and `.svg` files the embedded
family/metadata strings were checked and match the `.ttf`/`.woff` of the same name.
Where a field is not in the file, it says so; "unknown" means it could not be confirmed.

Checked 2026-10-20.

## Kept

| File(s) | Family (name ID 4) | Copyright holder | License | Source | Decision |
|---|---|---|---|---|---|
| `SortsMillGoudy-Regular.woff`, `SortsMillGoudy-Italic.woff` | Sorts Mill Goudy Regular / Italic (v003.101) | Not in file. Font by Barry Schwartz | SIL OFL 1.1 (name ID 14: `http://scripts.sil.org/OFL`) | https://fonts.google.com/specimen/Sorts+Mill+Goudy | Keep (referenced, redistributable) |
| `YanoneKaffeesatz-Light.woff`, `YanoneKaffeesatz-Regular.woff`, `YanoneKaffeesatz-Bold.woff` | Yanone Kaffeesatz Light / Regular / Bold (v1.003) | Not in file. Font by Yanone (Jan Gerner) | SIL OFL 1.1 (name ID 14: `http://scripts.sil.org/OFL`) | https://fonts.google.com/specimen/Yanone+Kaffeesatz | Keep (referenced, redistributable) |
| `ShadowsIntoLight.woff2` | Shadows Into Light (v001.000) | Copyright (c) 2010, Kimberly Geswein (kimberlygeswein.com) | SIL OFL 1.1 (name ID 14: `http://scripts.sil.org/OFL`) | https://fonts.google.com/specimen/Shadows+Into+Light | Keep (referenced, redistributable) |

OFL note: the OFL asks that the copyright notice and license travel with the font. These
files carry the license URL in their metadata, and the Sorts Mill Goudy and Yanone
Kaffeesatz files have no copyright string (name ID 0 is empty). This file records both.
License text: https://openfontlicense.org/open-font-license-official-text/

## Needs owner decision

| File(s) | Family | Copyright holder (from file) | License | Source | Decision |
|---|---|---|---|---|---|
| `Goudy-Regular.{eot,svg,ttf,woff}`, `Goudy-Bold.{eot,svg,ttf,woff}`, `Goudy-Italic.{eot,svg,ttf,woff}` | Goudy Old Style / Bold / Italic (v1.51) | "Data by URW, Type Solutions, Inc. © 1993. Microsoft Corporation. All rights reserved." | No license in file (IDs 13/14 empty). This is the Goudy Old Style that ships with Microsoft Office/Windows, not the OFL Goudy Bookletter 1911. Treat as proprietary: no redistribution right is shown. | Unknown (converted with FontForge in 2016 per the `.svg` metadata) | Needs owner decision |

`style.css` declares `@font-face { font-family: 'Goudy' }` from these files and uses it as a
fallback after Sorts Mill Goudy, so deleting them would change requests the page makes and
break asset parity. Options:

- (a) Keep the files as they are and accept the risk.
- (b) Serve them from an external `FONT_BASE` (e.g. `https://media.scripture.guide/fonts`):
  upload the files privately and rewrite the `url()`s in `style.css`.
- (c) Substitute an OFL equivalent, e.g. Goudy Bookletter 1911 (The League of Moveable
  Type) or rely on Sorts Mill Goudy alone.

None of these has been implemented.

## Removed

Nothing in `apps/web/public` or `apps/web/src` references these (checked by family and file
name). The live site still serves them, but no page uses them, so they were deleted.

| File(s) | Family | Copyright holder (from file) | License | Notes |
|---|---|---|---|---|
| `Comfortaa-Regular.woff`, `Comfortaa-Bold.woff` | Comfortaa (v2.001) | Not in file | SIL OFL 1.1 (name ID 14) | Unused |
| `UnBatang.ttf`, `UnBatangBold.ttf` | Un Batang / Un Batang Bold (v1.00) | Copyright © 1998-2004 by Koaunghi Un | "GNU Public License" (name ID 13; URL `http://korea.gnu.org/copyleft/gpl.ko.html`). Whether this copy carries the font exception is not stated in the file. | Unused (Korean text uses KoPub Batang from Google Fonts in `versions.css`) |
| `LotteMartBold.ttf` | 12LotteMartDreamBold | Not in file | Unknown (no license fields; not verified against Lotte Mart's terms) | Unused |
| `palatino.ttf` | Palatino (v1.0) | Not in file | Unknown (no copyright or license fields; unique ID "DHBK Tp.HCM:231:Palatino" suggests a modified third-party copy; Palatino is a Linotype design) | Unused |

## Git history

All of these files, including the Goudy Old Style files and the removed ones, have been in
the public GitHub repository's history since the web app import (commit `921287b`,
2026-03-17). Deleting a file now does not remove it from history. Rewriting history
(and the related force-push) is an owner decision and has not been done.
