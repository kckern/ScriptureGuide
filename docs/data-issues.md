# Data issues

Problems in the scripture database (production MySQL on `bom`; local copy `sg-full`, restored from the 2026-10-20 backup). Code bugs found alongside these are fixed in the repo; these need data work.

## Open

### Ransom note table left in production
- **What:** production and the 2026-10-20 backup both contain `RECOVER_YOUR_DATA_info`: one row, a bot ransom note asking for 0.01 BTC. It predates closing port 3306 on 2026-10-20.
- **To do:** drop it (`DROP TABLE RECOVER_YOUR_DATA_info;`) once nothing else in it is needed; finish rotating database credentials (still pending as of 2026-10-20). Data missing since the attack (possibly HBRS below) may need restoring from an older backup.

### HBRS version is missing
- **Seen at:** `scripture.guide/hbrs/isa.49~isa.9;11`, `scripture.guide/hbrs*mev/isa.56.9-58.14;65-66.17` (old bug reports).
- **What:** `scripture_versions` has no `HBRS` row and `scripture_verses` has no `HBRS` text. Links that name it fall back to LDS.
- **To decide:** was HBRS removed on purpose, or lost in a migration? If it should exist, restore it from an older backup or its source; if not, nothing to do (the site now says when a version doesn't exist).

### 2HRBOM leaves out 2 Nephi 12–24
- **Seen at:** `scripture.guide/2hrbom/2.ne.16`.
- **What:** every 2HRBOM row in 2 Nephi 12–24 is a `*` filler row (2 Ne 12: 21 of 22; 13–24: all). The Two-Hour Book of Mormon abridges the Isaiah chapters.
- **To decide:** confirm this matches the printed edition. If so, it's correct data (the site now says the version doesn't include the passage).

### Version titles (SQL given to KC 2026-11-20)
- CTBOM `title_long` was "Easy-To-Read: Book of MormonConcisely Translated Book of Mormon" (ERBOM's title glued on). Fix: `UPDATE scripture_versions SET title_long = 'Concisely Translated Book of Mormon' WHERE id = 'CTBOM';`
- 1837 titles say "1387". Fix: `UPDATE scripture_versions SET title = '1837 Kirtland Edition', title_long = '1837 Kirtland Edition of the Book of Mormon' WHERE id = '1837';`
- Eight versions are all titled "Tao Te Ching" (CHEN, CLEARY, ENGLISH, LUDD, MITCHELL, WU, MEARS, GORNOLD), so `/v1/versions` can't tell them apart. Needs each translator's name from KC.

## Closed

### CTBOM verse merges in 1 Nephi 14
- Checked 2026-11-20: CTBOM's filler rows are correct (each follows the verse whose text covers it). The odd merges on `ctbom~2hrbom/1.ne.14` were a parallel-alignment code bug, fixed in 6487bbc.

### Rows with only filler text
- 10,413 `scripture_verses` rows hold only `*` or `/` (2HRBOM 3541, TLB 3029, CEV 2111, CTBOM 1620, others), and 63 rows are empty. Filler rows are expected for merged verses; the empty ones are worth a look.
