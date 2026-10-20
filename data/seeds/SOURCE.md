# Seed data

Public seed data for local development, CI, and the `scripture-guide-seed` image. Licensed translations are never included; `scripts/seeds/check-seeds.mjs` (run in CI) rejects any version not listed in `manifest.json` `publicVersions`.

| File | Rows | Contents | Basis |
|---|---|---|---|
| `schema.sql` | | DDL for the 13 tables the public site reads | Structure only |
| `01-lds_scriptures_volumes.sql.gz` | 17 | Volume names and counts | Structural |
| `02-lds_scriptures_books.sql.gz` | 167 | Book names, abbreviations, chapter/verse counts | Structural |
| `03-lds_scriptures_verses.sql.gz` | 93,382 | Verse ID to book/chapter/verse map and labels. `verse_scripture` (LDS edition text) is exported blank | Structural |
| `04-scripture_versions.sql.gz` | 3 | Version metadata for KJV, ASV, WEB | |
| `05-scripture_verses.sql.gz` | 93,305 | Verse text: KJV (31,102), ASV (31,102), WEB (31,101) | KJV and ASV (1901): public domain in the US. WEB: dedicated to the public domain |

Not seeded (authorship or license not yet confirmed): headings, cross-references, footnotes, facsimile index, word index, annotations.

Regenerate from a private copy of the database:

    DATABASE_URL=mysql://user:pass@127.0.0.1:3310/sgfull node scripts/seeds/export-seed.mjs
    npm run check-seeds
