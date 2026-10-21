-- Optional index for the Node app (Task 7c). The app is correct without it.
--
-- scripture_verses(version, verse_id): passage text is read with
-- "WHERE version = ? AND verse_id IN (...)", which MySQL serves from the verse_id index alone
-- and then filters ~16 versions per verse. Measured on a full local copy (MySQL 8.0, MyISAM):
--   api  /nlv/gen.1-50   212 -> 106 ms     html /nlv/gen.1-50   84 -> 51 ms
--   MAX(verse_id) WHERE version = 'NLV'   37 -> 0.4 ms (the app caches it per process)
--   search fallback (no Sphinx) LDS/KJV range pages   125 -> 93 ms
-- Typical requests (a chapter or a few verses) do not change.
-- Building it took 75 s locally; MyISAM blocks writes to the table while it builds.
--
-- MySQL 8.0 has no CREATE INDEX IF NOT EXISTS: if the index exists, this fails with
-- error 1061 (duplicate key name) and changes nothing.
--
-- Measured and not recommended: scripture_headings(version, footer, verse_id). The app now loads
-- each version's heading starts once per process (5 ms), so the index gains nothing.

CREATE INDEX version_verse_id ON scripture_verses (version, verse_id);
