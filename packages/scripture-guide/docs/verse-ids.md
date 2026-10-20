# Verse ID System

Scripture Guide uses a numeric verse ID system to uniquely identify every verse in the scriptures. This document explains how verse IDs work and how to use them effectively.

## What Are Verse IDs?

A verse ID is a sequential integer that uniquely identifies a verse based on its position in the canonical scripture order. Genesis 1:1 is verse ID 1, Genesis 1:2 is verse ID 2, and so on through the entire scriptural canon.

```javascript
lookupReference('Genesis 1:1');   // verse_ids: [1]
lookupReference('Genesis 1:10');  // verse_ids: [10]
lookupReference('Genesis 2:1');   // verse_ids: [32]
lookupReference('Exodus 1:1');    // verse_ids: [1534]
```

## Why Use Verse IDs?

Verse IDs provide several advantages:

1. **Database Indexing**: Use verse IDs as primary keys or indexes in scripture databases
2. **Range Queries**: Find all verses between two IDs with simple numeric comparison
3. **Language Independence**: The same verse ID represents the same verse regardless of language
4. **Compact Storage**: Store references as integers rather than strings
5. **Fast Lookups**: Numeric comparisons are faster than string parsing

## Verse ID Reference

### Key Verse IDs

| Verse | Verse ID | Notes |
|-------|----------|-------|
| Genesis 1:1 | 1 | First verse |
| Genesis 1:31 | 31 | End of Day 6 |
| Genesis 2:1 | 32 | Day 7 begins |
| Genesis 50:26 | 1533 | Last verse of Genesis |
| Exodus 1:1 | 1534 | First verse of Exodus |
| Malachi 4:6 | 23145 | Last verse of Old Testament |
| Matthew 1:1 | 23146 | First verse of New Testament |
| Revelation 22:21 | 31102 | Last verse of Bible |
| 1 Nephi 1:1 | 31103 | First verse of Book of Mormon |

### Book Boundaries

| Book | First Verse ID | Last Verse ID | Verse Count |
|------|----------------|---------------|-------------|
| Genesis | 1 | 1533 | 1533 |
| Exodus | 1534 | 2746 | 1213 |
| Leviticus | 2747 | 3605 | 859 |
| Numbers | 3606 | 4893 | 1288 |
| Deuteronomy | 4894 | 5852 | 959 |
| ... | ... | ... | ... |
| Matthew | 23146 | 24216 | 1071 |
| Mark | 24217 | 24894 | 678 |
| Luke | 24895 | 26045 | 1151 |
| John | 26046 | 26924 | 879 |
| ... | ... | ... | ... |
| Revelation | 30744 | 31102 | 404 |

## Working with Verse IDs

### Converting References to IDs

```javascript
import { lookupReference } from 'scripture-guide';

const result = lookupReference('John 3:16');
console.log(result.verse_ids); // [26137]

// Ranges return multiple IDs
const range = lookupReference('John 3:16-18');
console.log(range.verse_ids); // [26137, 26138, 26139]
```

### Converting IDs to References

```javascript
import { generateReference } from 'scripture-guide';

generateReference([26137]);
// 'John 3:16'

generateReference([26137, 26138, 26139]);
// 'John 3:16-18'

// Non-consecutive IDs
generateReference([1, 10, 100]);
// 'Genesis 1:1, 10; 4:14'
```

### Range Calculations

Since verse IDs are sequential, you can calculate ranges:

```javascript
// Get all verses between two references
const start = lookupReference('Matthew 5:1').verse_ids[0];  // 23182
const end = lookupReference('Matthew 7:29').verse_ids[0];   // 23293

const sermonOnMount = [];
for (let id = start; id <= end; id++) {
  sermonOnMount.push(id);
}

generateReference(sermonOnMount);
// 'Matthew 5 - 7'
```

### Checking Verse Proximity

```javascript
function areVersesNear(ref1, ref2, maxDistance = 10) {
  const id1 = lookupReference(ref1).verse_ids[0];
  const id2 = lookupReference(ref2).verse_ids[0];
  return Math.abs(id1 - id2) <= maxDistance;
}

areVersesNear('John 3:16', 'John 3:17');  // true (distance: 1)
areVersesNear('John 3:16', 'John 4:1');   // false (distance: 20+)
```

## Database Integration

### Schema Design

```sql
-- Verse content table
CREATE TABLE verses (
  verse_id INTEGER PRIMARY KEY,
  text TEXT NOT NULL
);

-- Cross-reference table
CREATE TABLE cross_references (
  source_verse_id INTEGER,
  target_verse_id INTEGER,
  FOREIGN KEY (source_verse_id) REFERENCES verses(verse_id),
  FOREIGN KEY (target_verse_id) REFERENCES verses(verse_id)
);

-- Index for range queries
CREATE INDEX idx_verse_id ON verses(verse_id);
```

### Query Examples

```sql
-- Get a single verse
SELECT text FROM verses WHERE verse_id = 26137;

-- Get a range of verses
SELECT text FROM verses WHERE verse_id BETWEEN 26137 AND 26139;

-- Get verses from John chapter 3 (if you know the boundaries)
SELECT text FROM verses WHERE verse_id BETWEEN 26107 AND 26142;
```

### JavaScript Integration

```javascript
import { lookupReference, generateReference } from 'scripture-guide';

async function getVerseText(reference) {
  const { verse_ids } = lookupReference(reference);

  const results = await db.query(
    'SELECT verse_id, text FROM verses WHERE verse_id = ANY($1) ORDER BY verse_id',
    [verse_ids]
  );

  return results.rows;
}

async function searchVerses(query) {
  const results = await db.query(
    'SELECT verse_id FROM verses WHERE text ILIKE $1',
    [`%${query}%`]
  );

  const verseIds = results.rows.map(r => r.verse_id);
  return generateReference(verseIds);
}
```

## Verse ID Calculation

Verse IDs are calculated by counting verses sequentially through the canon:

```
Verse ID = (sum of verses in all preceding books)
         + (sum of verses in preceding chapters of current book)
         + (verse number within current chapter)
```

### Example: John 3:16

1. Verses before John: 26045 (Genesis through Luke)
2. Verses in John 1: 51
3. Verses in John 2: 25
4. Plus verse 16 in John 3
5. Total: 26045 + 51 + 25 + 16 = **26137**

## Language Independence

Verse IDs are independent of language. The same verse ID always refers to the same verse:

```javascript
// All return verse_ids: [26137]
lookupReference('John 3:16', 'en');
lookupReference('요한복음 3:16', 'ko');
lookupReference('Jean 3:16', 'fr');
lookupReference('Johannes 3:16', 'de');

// All return the equivalent reference in each language
generateReference([26137], 'en');  // 'John 3:16'
generateReference([26137], 'ko');  // '요한복음 3장 16절'
generateReference([26137], 'fr');  // 'Jean 3:16'
generateReference([26137], 'de');  // 'Johannes 3:16'
```

## Extended Canon

Scripture Guide supports an extended canon including:

- **Old Testament**: Genesis through Malachi (23,145 verses)
- **New Testament**: Matthew through Revelation (7,957 verses)
- **Book of Mormon**: 1 Nephi through Moroni
- **Doctrine and Covenants**: Sections 1-138 + Official Declarations
- **Pearl of Great Price**: Moses, Abraham, Joseph Smith—Matthew, Joseph Smith—History, Articles of Faith

Verse IDs continue sequentially through all canonical works.

## Best Practices

### Do

- Store verse IDs in databases for efficient indexing
- Use verse IDs for cross-referencing between verses
- Calculate ranges using numeric comparison
- Cache verse ID lookups for frequently accessed references

### Don't

- Assume verse IDs are stable across library versions (they depend on canon definition)
- Hard-code verse IDs without documenting what they represent
- Mix verse IDs from different versification systems

### Example: Bookmarking System

```javascript
// Save bookmark as verse ID
function saveBookmark(reference, userId) {
  const { verse_ids } = lookupReference(reference);
  db.insert('bookmarks', {
    user_id: userId,
    verse_id: verse_ids[0],
    created_at: new Date()
  });
}

// Load bookmarks with formatted references
async function getBookmarks(userId) {
  const rows = await db.query(
    'SELECT verse_id FROM bookmarks WHERE user_id = $1',
    [userId]
  );

  return rows.map(row => ({
    verse_id: row.verse_id,
    reference: generateReference([row.verse_id])
  }));
}
```
