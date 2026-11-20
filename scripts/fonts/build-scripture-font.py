#!/usr/bin/env python3
"""Rebuild Goudy Scripture so every glyph traces to an open source.

Goudy Scripture is Sorts Mill Goudy (Barry Schwartz, SIL Open Font License 1.1) with a faux
bold, plus composite accented, Cyrillic and Vietnamese letters made from its parts. Its digits
came from another font. This script:

  1. replaces the ten digits with Sorts Mill Goudy's lining figures (Google Fonts build),
     scaled to the height of the old digits and bolded like the letters;
  2. redraws the en dash from the em dash, keeping its slanted calligraphic ends (the old en
     dash was a plain rectangle) and shortening only the straight middle;
  3. adds a contextual rule (calt) that shows a hyphen between two digits as an en dash,
     so "3:16-18" displays as "3:16–18" while the text keeps its hyphen;
  4. replaces the leftover metadata with the OFL notices.

Needs fontTools, skia-pathops and brotli:
  python3 -m venv /tmp/fontvenv && /tmp/fontvenv/bin/pip install fonttools skia-pathops brotli
  /tmp/fontvenv/bin/python scripts/fonts/build-scripture-font.py \
      --source goudy-scripture-1.51.woff2 --sorts-mill SortsMillGoudy-Regular.ttf
--source is the earlier build (1.51), which is not in the repository.
SortsMillGoudy-Regular.ttf: https://github.com/google/fonts/tree/main/ofl/sortsmillgoudy
The output goes to fonts/goudy-scripture/ (the font of record) unless --out says otherwise;
then copy GoudyScripture.woff2 to apps/web/public/css/webfont/ and apps/chrome-extension/fonts/.
"""
import argparse
from pathlib import Path

import pathops
from fontTools.misc.transform import Transform
from fontTools.otlLib import builder as otl
from fontTools.pens.basePen import BasePen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables import otTables as ot

FONT_OF_RECORD = Path(__file__).resolve().parents[2] / 'fonts' / 'goudy-scripture'
DIGITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
# Outward offset of the digits' faux bold, in Goudy Scripture units (2048 per em). Chosen by
# measuring stems at 400 px: the letters' stems run 36-42 px, and 36 units gives the digits
# 38-42 px. (A bounding-box fit of the letters suggests about 13, which renders visibly light.)
BOLD = 36
VERSION = '2.000'

NAMES = {
    0: 'Copyright (c) 2010, Barry Schwartz (chemoelectric@chemoelectric.org). '
       'Modifications copyright (c) 2026, Scripture Guide.',
    3: f'{VERSION};SGDE;GoudyScripture',
    5: f'Version {VERSION}',
    8: 'Scripture Guide',
    9: 'Barry Schwartz (Sorts Mill Goudy); bold, extended and modified by Scripture Guide',
    10: 'Sorts Mill Goudy with a faux bold, lining figures and added Cyrillic, Greek and '
        'Vietnamese letters.',
    11: 'https://scripture.guide/',
    13: 'This Font Software is licensed under the SIL Open Font License, Version 1.1. '
        'This license is available with a FAQ at: https://openfontlicense.org',
    14: 'https://openfontlicense.org',
}
DROP_NAMES = {7}  # trademark notice of the font the old digits came from


def bounds(glyphset, name):
    pen = BoundsPen(glyphset)
    glyphset[name].draw(pen)
    return pen.bounds


def bolded_digit(smg, name, scale, bold):
    """Sorts Mill Goudy's lining digit, scaled and grown outward by `bold` units."""
    path = pathops.Path()
    smg.getGlyphSet()[name + '.lining'].draw(TransformPen(path.getPen(), Transform(scale, 0, 0, scale, 0, 0)))
    ring = pathops.Path(path)
    ring.stroke(2 * bold, pathops.LineCap.ROUND_CAP, pathops.LineJoin.ROUND_JOIN, 4)
    ring.convertConicsToQuads()  # round joins come out as conics, which path ops cannot take
    return pathops.op(path, ring, pathops.PathOp.UNION)


def replace_digits(font, smg):
    cmap = font.getBestCmap()
    gs, sgs = font.getGlyphSet(), smg.getGlyphSet()
    cff = font['CFF '].cff
    top = cff.topDictIndex[0]
    charstrings = top.CharStrings
    # The bold grows each digit by BOLD on every side; the digits are then raised by BOLD so a
    # flat bottom (the 2) sits on the baseline as before. One scale for all ten makes their
    # mean top match the old digits' mean top.
    old_h = sum(bounds(gs, cmap[ord(d)])[3] for d in '0123456789') / 10
    new_h = sum(bounds(sgs, n + '.lining')[3] for n in DIGITS) / 10
    scale = (old_h - 2 * BOLD) / new_h
    for digit, name in zip('0123456789', DIGITS):
        glyph = cmap[ord(digit)]
        path = bolded_digit(smg, name, scale, BOLD)
        xmin, _, xmax, _ = path.bounds
        lsb, adv = smg['hmtx'][name + '.lining'][1], smg['hmtx'][name + '.lining'][0]
        width = round(adv * scale + 2 * BOLD)
        shift = round(lsb * scale - BOLD - xmin)  # keep Sorts Mill Goudy's spacing
        pen = T2CharStringPen(width, gs)
        path.draw(TransformPen(pen, Transform(1, 0, 0, 1, shift, BOLD)))
        cs = pen.getCharString(private=charstrings[glyph].private, globalSubrs=charstrings[glyph].globalSubrs)
        charstrings[glyph] = cs
        font['hmtx'][glyph] = (width, round(xmin + shift))
    return scale


class _SqueezeMiddle(BasePen):
    """Pass a contour through, shortening the stretch between x=lo and x=hi by `cut` units."""
    def __init__(self, out, lo, hi, cut):
        super().__init__(None)
        self.out, self.lo, self.hi, self.k = out, lo, hi, (hi - lo - cut) / (hi - lo)
        self.cut = cut
    def _x(self, pt):
        x, y = pt
        if x <= self.lo:
            return (x, y)
        if x >= self.hi:
            return (x - self.cut, y)
        return (self.lo + (x - self.lo) * self.k, y)
    def _moveTo(self, p): self.out.moveTo(self._x(p))
    def _lineTo(self, p): self.out.lineTo(self._x(p))
    def _curveToOne(self, a, b, c): self.out.curveTo(self._x(a), self._x(b), self._x(c))
    def _closePath(self): self.out.closePath()


def redraw_endash(font):
    """The en dash, made from the em dash: same slanted ends and stroke, a shorter middle."""
    cmap = font.getBestCmap()
    em, en = cmap[0x2014], cmap[0x2013]
    gs = font.getGlyphSet()
    charstrings = font['CFF '].cff.topDictIndex[0].CharStrings
    em_adv, en_adv = font['hmtx'][em][0], font['hmtx'][en][0]
    cut = em_adv - en_adv
    xmin, _, xmax, _ = bounds(gs, em)
    # Leave the slanted ends (the outer 15% at each side) untouched; squeeze only the middle.
    lo, hi = xmin + 0.15 * (xmax - xmin), xmax - 0.15 * (xmax - xmin)
    pen = T2CharStringPen(en_adv, gs)
    gs[em].draw(_SqueezeMiddle(pen, lo, hi, cut))
    charstrings[en] = pen.getCharString(private=charstrings[en].private, globalSubrs=charstrings[en].globalSubrs)
    font['hmtx'][en] = (en_adv, round(xmin))


def add_range_dash(font):
    """calt: a hyphen with a digit on both sides is shown as an en dash."""
    cmap = font.getBestCmap()
    digits = [cmap[ord(d)] for d in '0123456789']
    hyphen, endash = cmap[0x2D], cmap[0x2013]
    gsub = font['GSUB'].table
    single = otl.buildLookup([otl.buildSingleSubstSubtable({hyphen: endash})])
    gsub.LookupList.Lookup.append(single)
    single_index = len(gsub.LookupList.Lookup) - 1

    st = ot.ChainContextSubst()
    st.Format = 3
    st.BacktrackGlyphCount = 1
    st.BacktrackCoverage = [otl.buildCoverage(digits, font.getReverseGlyphMap())]
    st.InputGlyphCount = 1
    st.InputCoverage = [otl.buildCoverage([hyphen], font.getReverseGlyphMap())]
    st.LookAheadGlyphCount = 1
    st.LookAheadCoverage = [otl.buildCoverage(digits, font.getReverseGlyphMap())]
    rec = ot.SubstLookupRecord()
    rec.SequenceIndex = 0
    rec.LookupListIndex = single_index
    st.SubstLookupRecord = [rec]
    st.SubstCount = 1
    chain = otl.buildLookup([st])
    gsub.LookupList.Lookup.append(chain)
    chain_index = len(gsub.LookupList.Lookup) - 1
    gsub.LookupList.LookupCount = len(gsub.LookupList.Lookup)

    feature = ot.FeatureRecord()
    feature.FeatureTag = 'calt'
    feature.Feature = ot.Feature()
    feature.Feature.LookupListIndex = [chain_index]
    feature.Feature.LookupCount = 1
    gsub.FeatureList.FeatureRecord.append(feature)
    gsub.FeatureList.FeatureCount = len(gsub.FeatureList.FeatureRecord)
    calt_index = gsub.FeatureList.FeatureCount - 1
    for script in gsub.ScriptList.ScriptRecord:
        systems = [script.Script.DefaultLangSys] + [r.LangSys for r in script.Script.LangSysRecord]
        for lang in filter(None, systems):
            lang.FeatureIndex.append(calt_index)
            lang.FeatureCount = len(lang.FeatureIndex)
    # Feature records must be sorted by tag; re-sort and remap the indexes.
    order = sorted(range(len(gsub.FeatureList.FeatureRecord)), key=lambda i: gsub.FeatureList.FeatureRecord[i].FeatureTag)
    remap = {old: new for new, old in enumerate(order)}
    gsub.FeatureList.FeatureRecord = [gsub.FeatureList.FeatureRecord[i] for i in order]
    for script in gsub.ScriptList.ScriptRecord:
        systems = [script.Script.DefaultLangSys] + [r.LangSys for r in script.Script.LangSysRecord]
        for lang in filter(None, systems):
            lang.FeatureIndex = sorted(remap[i] for i in lang.FeatureIndex)


def set_metadata(font):
    name = font['name']
    for rec in list(name.names):
        if rec.nameID in DROP_NAMES or rec.nameID in NAMES:
            name.removeNames(nameID=rec.nameID)
    for name_id, text in NAMES.items():
        name.setName(text, name_id, 3, 1, 0x409)
        name.setName(text, name_id, 1, 0, 0)
    font['OS/2'].achVendID = 'SGDE'
    font['OS/2'].fsType = 0  # installable: the OFL places no embedding restriction
    font['head'].fontRevision = float(VERSION)
    top = font['CFF '].cff.topDictIndex[0]
    top.Notice = NAMES[0]
    top.Copyright = NAMES[0]
    top.version = VERSION


def write_truetype(otf_path, ttf_path):
    """A TrueType (quadratic) copy of the OTF, for tools that cannot read CFF outlines."""
    from fontTools.pens.cu2quPen import Cu2QuPen
    from fontTools.pens.ttGlyphPen import TTGlyphPen
    from fontTools.ttLib import newTable
    font = TTFont(otf_path)
    order = font.getGlyphOrder()
    cff_glyphs = font.getGlyphSet()
    glyf = newTable('glyf')
    glyf.glyphOrder = order
    glyf.glyphs = {}
    for name in order:
        pen = TTGlyphPen(None)
        cff_glyphs[name].draw(Cu2QuPen(pen, max_err=1.0, reverse_direction=True))
        glyf.glyphs[name] = pen.glyph()
    font['glyf'] = glyf
    font['loca'] = newTable('loca')
    del font['CFF ']
    font.sfntVersion = '\x00\x01\x00\x00'
    maxp = font['maxp']
    maxp.tableVersion = 0x00010000
    for field in ('maxZones', 'maxTwilightPoints', 'maxStorage', 'maxFunctionDefs', 'maxInstructionDefs',
                  'maxStackElements', 'maxSizeOfInstructions', 'maxComponentElements'):
        setattr(maxp, field, 0)
    maxp.maxZones = 1
    maxp.maxComponentDepth = 0
    post = font['post']
    post.formatType = 2.0
    post.extraNames = []
    post.mapping = {}
    post.glyphOrder = order
    font['head'].indexToLocFormat = 0
    font['head'].glyphDataFormat = 0
    font.save(ttf_path)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--source', required=True, help='current Goudy Scripture (woff2/otf)')
    ap.add_argument('--sorts-mill', required=True, help="Google Fonts' SortsMillGoudy-Regular.ttf")
    ap.add_argument('--out', default=str(FONT_OF_RECORD), help='output directory (default: fonts/goudy-scripture)')
    a = ap.parse_args()
    font, smg = TTFont(a.source), TTFont(a.sorts_mill)
    scale = replace_digits(font, smg)
    redraw_endash(font)
    add_range_dash(font)
    set_metadata(font)
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    font.flavor = 'woff2'
    font.save(out / 'GoudyScripture.woff2')
    font.flavor = None
    font.save(out / 'GoudyScripture.otf')
    write_truetype(out / 'GoudyScripture.otf', out / 'GoudyScripture.ttf')
    print(f'digits scaled {scale:.4f}, bold {BOLD} units; wrote {out}/GoudyScripture.woff2, .otf and .ttf')


if __name__ == '__main__':
    main()
