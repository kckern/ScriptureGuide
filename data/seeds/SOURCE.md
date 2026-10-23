# Seed data

Public seed data for local development, CI, and the `scripture-guide-seed` image. Licensed translations are never included; `scripts/seeds/check-seeds.mjs` (run in CI) rejects any version not listed in `manifest.json` `publicVersions`, in every version-scoped table (text, version metadata, headings).

| File | Rows | Contents | Basis |
|---|---|---|---|
| `schema.sql` | | DDL for the 13 tables the public site reads | Structure only |
| `01-lds_scriptures_volumes.sql.gz` | 17 | Volume names and counts | Structural |
| `02-lds_scriptures_books.sql.gz` | 167 | Book names, abbreviations, chapter/verse counts | Structural |
| `03-lds_scriptures_verses.sql.gz` | 93,382 | Verse ID to book/chapter/verse map and labels. `verse_scripture` (LDS edition text) is exported blank | Structural |
| `04-scripture_versions.sql.gz` | 12 | Version metadata for the public versions below. `desc` is exported blank (the edition blurbs in the private database may be quoted from a modern source) | |
| `05-scripture_verses.sql.gz` | 148,802 | Verse text, see the version table below | See below |
| `06-scripture_headings.sql.gz` | 1,724 | Book titles, chapter headings, headnotes and chapter summaries of the public versions only | Printed with each public-domain edition |

## Public versions

| Code | Version | Verses | Headings | Basis |
|---|---|---|---|---|
| `KJV` | King James Version | 31,102 | 66 | Public domain in the US |
| `ASV` | American Standard Version (1901) | 31,102 | 218 | Public domain |
| `WEB` | World English Bible | 31,101 | 66 | Dedicated to the public domain |
| `TYN` | Tyndale Bible (original spelling) | 13,841 | 33 | 16th century; owner decision #8 |
| `1830` | Book of Mormon, 1830 Palmyra edition | 6,604 | 156 | Owner decision #8 |
| `1837` | Book of Mormon, 1837 Kirtland edition | 6,604 | 156 | Owner decision #8 |
| `1840` | Book of Mormon, 1840 Nauvoo edition | 6,604 | 155 | Owner decision #8 |
| `1841` | Book of Mormon, 1841 Liverpool edition | 6,604 | 156 | Owner decision #8 |
| `1879` | Book of Mormon, 1879 edition (Orson Pratt) | 6,604 | 84 | Owner decision #8 |
| `1920` | Book of Mormon, 1920 edition (James E. Talmage), with its chapter summaries | 6,604 | 297 | Published 1920, public domain in the US; owner decision #8 |
| `1833` | Book of Commandments | 1,342 | 130 | Owner decision #8 |
| `1835` | 1835 Doctrine and Covenants | 690 | 207 | Owner decision #8 |

Owner decision #8 (2026-10-22) judged these transcriptions free to publish. Decision #9 allows headings, cross-references and footnotes, but only those attached to a public version.

## Not seeded

- Versions `GNV` (1599 Geneva) and `WYC` (Wycliffe): the database text is a modern-spelling edition, not the original, so it is likely a copyrighted modernisation. Held for the owner.
- `scripture_references` (cross-references): rows are keyed by verse id and not tied to a version. Sources: LDS edition footnote cross-references (`footnote`), JST and Pearl of Great Price parallels, Bible quotations and allusions in the Book of Mormon, and the 1835 D&C and Book of Commandments concordances. Authorship not confirmed.
- `scripture_footnotes`: only rows for licensed or non-public study editions exist.
- Facsimile index, word index, annotations.

Regenerate from a private copy of the database:

    DATABASE_URL=mysql://user:pass@127.0.0.1:3310/sgfull node scripts/seeds/export-seed.mjs
    npm run check-seeds
