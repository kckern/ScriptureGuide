#!/usr/bin/env python3
"""Build the Korean and Hindi web fonts in public/css/webfont from their OFL sources.

Sources (google/fonts, ofl/kopubbatang and ofl/notoserifdevanagari):
  KoPubBatang-Regular.ttf, KoPubBatang-Bold.ttf, NotoSerifDevanagari[wdth,wght].ttf

Usage: build-fonts.py <source dir> <output dir> [extra-syllables.json]

'KoPub Batang' is a Reserved Font Name under its OFL, and a subset is a Modified Version, so
the subset is renamed 'SG Batang' in its name table and in CSS. Noto has no Reserved Font Name.
"""
import json
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

BATANG = 'SG Batang'
# KS X 1001: the 2,350 Hangul syllables in everyday use. Lead bytes B0-C8, trail bytes A1-FE.
KS_X_1001 = {ord(bytes([a, b]).decode('euc-kr')) for a in range(0xB0, 0xC9) for b in range(0xA1, 0xFF)}
BATANG_EXTRA = [*range(0x20, 0x7F), *range(0xA0, 0x100), 0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D,
                0x2026, 0x3001, 0x3002, 0x3008, 0x3009, 0x300A, 0x300B, 0x300C, 0x300D, 0x318D]
DEVANAGARI = [*range(0x900, 0x980), *range(0x1CD0, 0x1D00), *range(0xA8E0, 0xA900), 0x200C, 0x200D, 0x25CC, 0x20B9]


def make_subset(font, unicodes, out):
    opts = subset.Options(flavor='woff2', layout_features=['*'], hinting=False, notdef_outline=True,
                          name_IDs=['*'], name_languages=['*'], drop_tables=subset.Options().drop_tables + ['FFTM'])
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=unicodes)
    sub.subset(font)
    subset.save_font(font, str(out), opts)
    print(f'{out.name}: {out.stat().st_size / 1024:.0f} KB')


def rename(font, family, style):
    ps = f"{family.replace(' ', '')}-{style}"
    values = {1: family, 2: style, 3: ps, 4: f'{family} {style}', 6: ps}
    name = font['name']
    # Remove every record that could still carry the Reserved Font Name, then write ours.
    name.names = [r for r in name.names if r.nameID in (0, 13, 14)]
    for nid, value in values.items():
        name.setName(value, nid, 3, 1, 0x409)


def main():
    src, out = Path(sys.argv[1]), Path(sys.argv[2])
    syllables = {ord(c) for c in json.loads(Path(sys.argv[3]).read_text())} if len(sys.argv) > 3 else set()
    for style in ('Regular', 'Bold'):
        font = TTFont(src / f'KoPubBatang-{style}.ttf')
        rename(font, BATANG, style)
        make_subset(font, [*KS_X_1001, *syllables, *BATANG_EXTRA], out / f'SGBatang-{style}.woff2')
    for style, wght in (('Regular', 400), ('Bold', 700)):
        font = instancer.instantiateVariableFont(TTFont(src / 'NotoSerifDevanagari[wdth,wght].ttf'), {'wght': wght, 'wdth': 100})
        make_subset(font, DEVANAGARI, out / f'NotoSerifDevanagari-{style}.woff2')


main()
