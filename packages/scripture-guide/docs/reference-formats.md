# Reference Formats

Scripture Guide supports a wide variety of scripture reference formats. This document describes all supported input patterns and how they are parsed.

## Basic Formats

### Simple Reference (Book Chapter:Verse)

The standard format for citing a single verse.

```javascript
lookupReference('Exodus 1:1');
// { ref: 'Exodus 1:1', verse_ids: [1534] }

lookupReference('John 3:16');
// { ref: 'John 3:16', verse_ids: [26137] }
```

### Chapter Only (Book Chapter)

Reference an entire chapter.

```javascript
lookupReference('Genesis 2');
// { ref: 'Genesis 2', verse_ids: [32, 33, 34, ... 56] }

lookupReference('Psalm 23');
// { ref: 'Psalms 23', verse_ids: [14240, 14241, ... 14245] }
```

## Range Formats

### Verse Range (Book Chapter:Verse-Verse)

A continuous range of verses within a single chapter.

```javascript
lookupReference('Exodus 20:1-10');
// { ref: 'Exodus 20:1-10', verse_ids: [2053, 2054, ... 2062] }
```

### Chapter Range (Book Chapter-Chapter)

Multiple complete chapters.

```javascript
lookupReference('Exodus 3-5');
// { ref: 'Exodus 3-5', verse_ids: [1556, 1557, ... 1651] }
```

### Cross-Chapter Verse Range (Book Chapter:Verse-Chapter:Verse)

A range spanning multiple chapters.

```javascript
lookupReference('Exodus 1:5-4:3');
// { ref: 'Exodus 1:5-4:3', verse_ids: [1538, 1539, ... 1614] }
```

### Chapter Range Ending in Partial Chapter

```javascript
lookupReference('Exodus 3-4:10');
// { ref: 'Exodus 3-4:10', verse_ids: [1556, 1557, ... 1588] }
```

### Multi-Book Range

A range spanning from one book into another.

```javascript
lookupReference('Genesis 30—Exodus 2');
// { ref: 'Genesis 30 - Exodus 2', verse_ids: [852, 853, ... 1555] }

lookupReference('Genesis 30:10—Exodus 2:5');
// { ref: 'Genesis 30:10 - Exodus 2:5', verse_ids: [861, 862, ... 1538] }
```

### Entire Book Range

```javascript
lookupReference('Genesis - Numbers');
// Returns all verses from Genesis through Numbers
```

## Split Formats

### Split Verses (Book Chapter:Verse,Verse)

Non-consecutive verses within a chapter.

```javascript
lookupReference('Exodus 20:5,10');
// { ref: 'Exodus 20:5, 10', verse_ids: [2057, 2062] }
```

### Verse Range with Split (Book Chapter:Verse-Verse,Verse)

Combination of range and discrete verses.

```javascript
lookupReference('Exodus 20:1-5,10');
// { ref: 'Exodus 20:1-5, 10', verse_ids: [2053, 2054, 2055, 2056, 2057, 2062] }
```

### Split Chapters (Book Chapter,Chapter)

Non-consecutive chapters.

```javascript
lookupReference('Genesis 1,3');
// Returns Genesis 1 and Genesis 3 (skipping Genesis 2)
```

### Chapter Range and Split

```javascript
lookupReference('Exodus 3-5,8');
// Returns Exodus 3, 4, 5, and 8
```

## Compound References

### Same Book Compound

Multiple references within the same book, separated by semicolons.

```javascript
lookupReference('Exodus 5:1;6:2;8:5');
// { ref: 'Exodus 5:1; 6:2; 8:5', verse_ids: [1617, 1642, 1716] }
```

### Multi-Book Compound

References across different books.

```javascript
lookupReference('Exodus 5:1; Leviticus 6:2; Numbers 8:5');
// { ref: 'Exodus 5:1; Leviticus 6:2; Numbers 8:5', verse_ids: [1617, 2947, 4050] }
```

### Compound Ranges

```javascript
lookupReference('Exodus 5:1-3; Leviticus 6:2-5; Numbers 8:5-6');
// Returns ranges from each book
```

## Abbreviations

Scripture Guide recognizes standard abbreviations for book names.

### Old Testament

| Full Name | Abbreviations |
|-----------|---------------|
| Genesis | Gen, Ge |
| Exodus | Ex, Exo, Exod |
| Leviticus | Lev, Le |
| Numbers | Num, Nu |
| Deuteronomy | Deut, Dt |
| Joshua | Josh, Jos |
| Judges | Judg, Jdg |
| Ruth | Ruth, Ru |
| 1 Samuel | 1 Sam, 1 Sa |
| 2 Samuel | 2 Sam, 2 Sa |
| 1 Kings | 1 Kgs, 1 Ki |
| 2 Kings | 2 Kgs, 2 Ki |
| 1 Chronicles | 1 Chr, 1 Ch |
| 2 Chronicles | 2 Chr, 2 Ch |
| Ezra | Ezr |
| Nehemiah | Neh, Ne |
| Esther | Est, Es |
| Job | Job |
| Psalms | Ps, Psa, Psalm |
| Proverbs | Prov, Pr |
| Ecclesiastes | Eccl, Ecc, Ec |
| Song of Solomon | Song, SoS, SS |
| Isaiah | Isa, Is |
| Jeremiah | Jer, Je |
| Lamentations | Lam, La |
| Ezekiel | Ezek, Eze |
| Daniel | Dan, Da |
| Hosea | Hos, Ho |
| Joel | Joel |
| Amos | Amos, Am |
| Obadiah | Obad, Ob |
| Jonah | Jon |
| Micah | Mic, Mi |
| Nahum | Nah, Na |
| Habakkuk | Hab |
| Zephaniah | Zeph, Zep |
| Haggai | Hag |
| Zechariah | Zech, Zec |
| Malachi | Mal |

### New Testament

| Full Name | Abbreviations |
|-----------|---------------|
| Matthew | Matt, Mt |
| Mark | Mark, Mk |
| Luke | Luke, Lk |
| John | John, Jn |
| Acts | Acts, Ac |
| Romans | Rom, Ro |
| 1 Corinthians | 1 Cor, 1 Co |
| 2 Corinthians | 2 Cor, 2 Co |
| Galatians | Gal, Ga |
| Ephesians | Eph, Ep |
| Philippians | Phil, Php |
| Colossians | Col |
| 1 Thessalonians | 1 Thess, 1 Th |
| 2 Thessalonians | 2 Thess, 2 Th |
| 1 Timothy | 1 Tim, 1 Ti |
| 2 Timothy | 2 Tim, 2 Ti |
| Titus | Titus, Tit |
| Philemon | Phlm, Phm |
| Hebrews | Heb |
| James | Jas, Ja |
| 1 Peter | 1 Pet, 1 Pe |
| 2 Peter | 2 Pet, 2 Pe |
| 1 John | 1 John, 1 Jn |
| 2 John | 2 John, 2 Jn |
| 3 John | 3 John, 3 Jn |
| Jude | Jude |
| Revelation | Rev, Re |

### Book of Mormon & Other LDS Scriptures

| Full Name | Abbreviations |
|-----------|---------------|
| 1 Nephi | 1 Ne, 1 Nephi |
| 2 Nephi | 2 Ne, 2 Nephi |
| Jacob | Jacob, Jac |
| Enos | Enos |
| Jarom | Jarom, Jar |
| Omni | Omni |
| Words of Mormon | W of M, WofM |
| Mosiah | Mosiah, Mos |
| Alma | Alma, Al |
| Helaman | Hel |
| 3 Nephi | 3 Ne, 3 Nephi |
| 4 Nephi | 4 Ne, 4 Nephi |
| Mormon | Morm, Mrm |
| Ether | Ether, Eth |
| Moroni | Moro, Mor |
| Doctrine and Covenants | D&C, DC |
| Moses | Moses, Mos |
| Abraham | Abr |
| Joseph Smith—Matthew | JS-M, JSM |
| Joseph Smith—History | JS-H, JSH |
| Articles of Faith | A of F, AofF |

## Separator Variations

Scripture Guide is flexible with separators:

### Chapter-Verse Separators

Both `:` and `.` are accepted:

```javascript
lookupReference('John 3:16');  // Standard colon
lookupReference('John 3.16');  // Period (common in some styles)
// Both return the same result
```

### Range Separators

Various dash characters are accepted:

```javascript
lookupReference('Mt 5:3-12');   // Hyphen
lookupReference('Mt 5:3–12');   // En dash
lookupReference('Mt 5:3—12');   // Em dash
// All return the same result
```

### Reference Separators

```javascript
lookupReference('Mt 5:3; Mk 1:1');   // Semicolon
lookupReference('Mt 5:3, Mk 1:1');   // Comma (between books)
```

## Special Cases

### Single-Chapter Books

Books with only one chapter (Obadiah, Philemon, 2 John, 3 John, Jude) can be referenced with just verse numbers:

```javascript
lookupReference('Jude 4');      // Interpreted as Jude 1:4
lookupReference('Philemon 10'); // Interpreted as Philemon 1:10
```

### Numbered Book Prefixes

Various formats for numbered books are supported:

```javascript
lookupReference('1 John 1:1');
lookupReference('I John 1:1');
lookupReference('1st John 1:1');
lookupReference('First John 1:1');
// All return the same result
```

### Spacing Flexibility

```javascript
lookupReference('1John1:1');    // No spaces
lookupReference('1 John 1:1');  // Standard spacing
lookupReference('1  John  1:1'); // Extra spaces
// All return the same result
```

## Format Summary Table

| Format Type | Example | Description |
|-------------|---------|-------------|
| Simple | `Exodus 1:1` | Single verse |
| Chapter | `Genesis 2` | Entire chapter |
| Verse range | `Exodus 20:1-10` | Consecutive verses |
| Chapter range | `Exodus 3-5` | Multiple chapters |
| Cross-chapter | `Exodus 1:5-4:3` | Range across chapters |
| Multi-book | `Genesis 30—Exodus 2` | Range across books |
| Split verses | `Exodus 20:5,10` | Non-consecutive verses |
| Split chapters | `Genesis 1,3` | Non-consecutive chapters |
| Compound | `Ex 5:1;6:2;8:5` | Multiple references |
| Abbreviated | `Mt 5:3-12` | With book abbreviation |
