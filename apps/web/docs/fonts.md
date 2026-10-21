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

## Served privately

The site's text font is the owner's licensed "Goudy Scripture" (one file, `scripture.woff2`:
weight 400, upright, 563 glyphs including Latin Extended and Cyrillic). The owner is licensing
it (decision 2026-10-20). A licence lets the site serve the font to visitors; it does not allow
publishing the file in this public repository or in the Docker image. So the file is never
committed or built into the image, and the app only points at it.

| Env | Meaning |
|---|---|
| `FONT_BASE` | URL or path the font is fetched from, e.g. `https://media.scripture.guide/fonts` or `/private-fonts`. A trailing slash is dropped. |
| `FONT_DIR` | A directory on the app's file system, served at `/private-fonts` (only when set; no directory listing, `Cache-Control: max-age=30d`). With `FONT_DIR` and no `FONT_BASE`, `FONT_BASE` defaults to `/private-fonts`. |
| `FONT_GOUDY_FILE` | File name under `FONT_BASE`. Default `scripture.woff2`. The `format()` follows the extension (`woff2`, `woff`, `ttf`, `otf`). |

With `FONT_BASE` or `FONT_DIR` set, the layout (`src/presentation/views/layouts/main.ejs`)
emits, after the stylesheets:

```css
@font-face {
  font-family: 'Goudy';
  src: url('<FONT_BASE>/scripture.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
```

Neither set: no `@font-face` for `'Goudy'`, so the page requests no font that would 404.

The body stack in `style.css` is `'Goudy', 'Sorts Mill Goudy', Georgia, serif` (live has
Sorts Mill Goudy first). With the private font configured, `'Goudy'` is the text font; without
it, the browser has no `'Goudy'` face and uses Sorts Mill Goudy, as before. A system font whose
family is exactly "Goudy" would also match; that is accepted. Notes:

- The file has only a regular face. Bold and italic text in `'Goudy'` is synthesized by the
  browser from it; it does not fall back to Sorts Mill Goudy Italic.
- Characters the file lacks (outside Latin, Latin Extended and Cyrillic) fall back per glyph to
  Sorts Mill Goudy, then Georgia.
- From another origin (`FONT_BASE=https://…`), that host must send
  `Access-Control-Allow-Origin` for the site's origins, or browsers refuse the font.
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
`Content-Type: font/woff2`, and a page's `<head>` has `<style id="private-fonts">`.

`.gitignore` and the root `.dockerignore` (the image's build context is the repository root)
exclude `apps/web/public/css/webfont/goudy*` (any case) and `scripture*.woff2` anywhere, so
a copy dropped into the tree is neither committed nor built into the image.

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
| `UnBatang.ttf`, `UnBatangBold.ttf` | Un Batang / Un Batang Bold (v1.00) | Copyright © 1998-2004 by Koaunghi Un | "GNU Public License" (name ID 13; URL `http://korea.gnu.org/copyleft/gpl.ko.html`). Whether this copy carries the font exception is not stated in the file. | Unused (Korean text uses KoPub Batang from Google Fonts in `versions.css`) |
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
