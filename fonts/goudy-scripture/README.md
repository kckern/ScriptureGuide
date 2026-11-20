# Goudy Scripture

Goudy Scripture, version 2.000, is the text font of scripture.guide and the font of the Chrome
extension's reference badges. This folder holds the font of record: the site and the extension
use byte-identical copies of `GoudyScripture.woff2`, and a test fails if either copy differs.

It is a Modified Version of Sorts Mill Goudy by Barry Schwartz, under the SIL Open Font License
1.1, with these changes by Scripture Guide:

- a faux bold of Sorts Mill Goudy's outlines;
- composite Cyrillic, Greek and Vietnamese letters made from its parts;
- Sorts Mill Goudy's lining figures, bolded to match;
- an en dash redrawn from the em dash;
- a contextual (`calt`) rule that shows a hyphen between two digits as an en dash, so
  "3:16-18" displays as "3:16–18" while the text keeps its hyphen.

## Files

- `GoudyScripture.woff2`: the web font. Copies: `apps/web/public/css/webfont/` and
  `apps/chrome-extension/fonts/`.
- `GoudyScripture.otf`: the same font for desktop use.
- `OFL.txt`: the copyright notices and the full licence.

## Rebuilding

```sh
python3 -m venv /tmp/fontvenv && /tmp/fontvenv/bin/pip install fonttools skia-pathops brotli
/tmp/fontvenv/bin/python scripts/fonts/build-scripture-font.py \
    --source goudy-scripture-1.51.woff2 --sorts-mill SortsMillGoudy-Regular.ttf
```

`--source` is the earlier build (1.51), which is not in the repository. `SortsMillGoudy-Regular.ttf`
comes from https://github.com/google/fonts/tree/main/ofl/sortsmillgoudy. The script writes both
files here (`--out` picks another folder). Then copy `GoudyScripture.woff2` over the two copies.

## Licence

- Keep the copyright notices and `OFL.txt` with the font file whenever you share it.
- Anything derived from it must stay under the OFL.
- Do not sell the font file on its own; it may be bundled or sold with other software.
