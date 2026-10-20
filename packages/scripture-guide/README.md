# Scripture Guide

A multilingual scripture reference parser for looking up, generating, and detecting scripture references across multiple religious canons.

**[scripture.guide](https://scripture.guide)**

## Features

- **Parse references** - Convert "John 3:16" to verse IDs
- **Generate references** - Convert verse IDs back to human-readable strings
- **Detect references** - Find and link scripture references in text
- **12 languages** - English, Korean, German, French, Russian, Vietnamese, Swedish, Tagalog, Japanese, Turkish, Slovenian, Esperanto
- **Multiple canons** - Bible, LDS, RLDS, Hindu, Buddhist, Islamic texts
- **Context-aware detection** - Recognizes implied references like "v. 16" and "vv. 17-18"

## Installation

```bash
npm install scripture-guide
```

## Quick Start

```javascript
import { lookupReference, generateReference, detectReferences } from 'scripture-guide';

// Parse a reference to verse IDs
lookupReference('John 3:16');
// { query: 'John 3:16', ref: 'John 3:16', verse_ids: [26137] }

// Generate a reference from verse IDs
generateReference([26137, 26138, 26139]);
// 'John 3:16-18'

// Detect and link references in text
detectReferences('Read John 3:16 today.', (ref, ids) => `<a href="/v/${ids[0]}">${ref}</a>`);
// 'Read <a href="/v/26137">John 3:16</a> today.'
```

## API Reference

### lookupReference(query, options?)

Parse a scripture reference string into verse IDs.

```javascript
lookupReference('Mt 5:3-12');
// { query: 'Mt 5:3-12', ref: 'Matthew 5:3-12', verse_ids: [23239, 23240, ...] }

lookupReference('Genesis 1:1', 'ko');  // string options = language
// { query: 'Genesis 1:1', ref: '창세기 1:1', verse_ids: [1] }

lookupReference('1 Nephi 3:7', { language: 'en', canon: 'lds' });
// { query: '1 Nephi 3:7', ref: '1 Nephi 3:7', verse_ids: [23152] }
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `query` | string | Scripture reference to parse |
| `options` | string \| object | If string, treated as language code |
| `options.language` | string | Language code |
| `options.canon` | string | Canon: `'lds'`, `'rlds'`, etc. |

> **Backward Compatibility:** The old 3-parameter signature `lookupReference(query, language, config)` is deprecated but still supported.

**Returns:**
```typescript
{
  query: string;        // Original input
  ref: string;          // Normalized reference
  verse_ids: number[];  // Verse ID array
  error?: string;       // Error message if failed
}
```

### generateReference(verse_ids, options?)

Convert verse IDs to a formatted reference string.

```javascript
generateReference([1, 2, 3]);
// 'Genesis 1:1-3'

generateReference([26137], 'de');  // string options = language
// 'Johannes 3:16'

generateReference([1, 2, 3, 10, 11], { language: 'en', canon: 'lds' });
// 'Genesis 1:1-3, 10-11'
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `verse_ids` | number[] | Array of verse IDs |
| `options` | string \| object | If string, treated as language code |
| `options.language` | string | Language code |
| `options.canon` | string | Canon: `'lds'`, `'rlds'`, etc. |

> **Backward Compatibility:** The old 3-parameter signature `generateReference(ids, language, options)` is deprecated but still supported.

### detectReferences(content, callback?, options?)

Find scripture references in text and optionally transform them.

```javascript
// Default: wrap in brackets
detectReferences('See Matthew 5:3-12 and John 3:16.');
// 'See [Matthew 5:3-12] and [John 3:16].'

// Custom callback
detectReferences('Read John 3:16.', (ref, ids) => {
  return `<a href="/bible/${ids.join(',')}">${ref}</a>`;
});

// Context-aware: detects "v. 16" from surrounding context
detectReferences('In John 3, Jesus explains (v. 16) that God loved the world.');
// Detects 'John 3:16'
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `content` | string | Text containing references |
| `callback` | function | `(query, verseIds) => string` |
| `options.language` | string | Language code |
| `options.contextAware` | boolean | Enable context detection (default: true) |
| `options.enableImpliedBooks` | boolean | Detect bare verse numbers (default: true) |
| `options.chainAcrossMarkers` | boolean | Merge references joined by prose markers — `see also`, `cf.`, `compare`, `cited at` — into a single reference (default: true). Set `false` to keep the marker words outside the link: `'A; see also B'` yields two links instead of one. Structural joiners (`;` `,` `&` `and`) still merge either way. |

### setLanguage(language)

Set the default language for all subsequent calls.

```javascript
import { setLanguage, lookupReference } from 'scripture-guide';

setLanguage('ko');
lookupReference('요한복음 3:16');
// Works in Korean
```

### setCanon(canon)

Set the default canon for all subsequent calls.

```javascript
import { setCanon, lookupReference } from 'scripture-guide';

setCanon('lds');    // LDS Standard Works (default)
setCanon('rlds');   // RLDS/Community of Christ
```

## Supported Reference Formats

| Format | Example |
|--------|---------|
| Simple verse | `Exodus 1:1` |
| Chapter only | `Genesis 2` |
| Verse range | `Exodus 20:1-10` |
| Split verses | `Exodus 20:5,10` |
| Split chapters | `Genesis 1,3` |
| Chapter range | `Exodus 3-5` |
| Multi-chapter range | `Exodus 1:5-4:3` |
| Multi-book range | `Genesis 30—Exodus 2` |
| Compound references | `Exodus 5:1; Leviticus 6:2` |
| Abbreviations | `Mt 2:5`, `Mk 3`, `1 Jn 1:5` |
| Entire book | `Genesis` |

## Language Support

| Code | Language | Example Reference |
|------|----------|-------------------|
| `en` | English | John 3:16 |
| `ko` | Korean | 요한복음 3:16 |
| `de` | German | Johannes 3:16 |
| `fr` | French | Jean 3:16 |
| `ru` | Russian | Иоанна 3:16 |
| `jp` | Japanese | ヨハネによる福音書 3:16 |
| `vn` | Vietnamese | Giăng 3:16 |
| `tr` | Turkish | Yuhanna 3:16 |
| `swe` | Swedish | Johannes 3:16 |
| `tgl` | Tagalog | Juan 3:16 |
| `slv` | Slovenian | Janez 3:16 |
| `eo` | Esperanto | Johano 3:16 |

## Canons

| Canon | Description |
|-------|-------------|
| `bible` | Protestant Bible (66 books) |
| `lds` | LDS Standard Works (Bible + Book of Mormon + D&C + Pearl of Great Price) |
| `rlds` | RLDS/Community of Christ canon |
| `hindu` | Hindu scriptures |
| `buddhist` | Buddhist texts |
| `islam` | Islamic texts |

## Verse IDs

Verse IDs are sequential integers starting from Genesis 1:1.

| Reference | Verse ID |
|-----------|----------|
| Genesis 1:1 | 1 |
| Genesis 1:2 | 2 |
| Genesis 50:26 | 1533 |
| Exodus 1:1 | 1534 |
| Malachi 4:6 | 23145 |
| Matthew 1:1 | 23146 |
| John 3:16 | 26137 |
| Revelation 22:21 | 31102 |

Use verse IDs to query your scripture database:

```sql
SELECT * FROM verses WHERE verse_id IN (26137, 26138, 26139);
```

## Configuration

### Custom Canon Data

Canon data is stored in `data/canons/{canon}/{language}.yml`:

```yaml
canon: bible
language: en

books:
  genesis:
    name: Genesis
    pattern: "[Gg]enesis"
    alt: [Gen, Gn]
  exodus:
    name: Exodus
    pattern: "[Ee]xodus"
    alt: [Exod, Ex]
```

### Structure Data

Verse counts per chapter are in `data/structure/{canon}.yml`:

```yaml
genesis: [31, 25, 24, 26, 32, 22, 24, ...]  # verses per chapter
exodus: [22, 25, 22, 31, 23, 30, 25, ...]
```

## Function Aliases

For convenience, functions have shorter aliases:

| Full Name | Aliases |
|-----------|---------|
| `lookupReference` | `lookup`, `parse`, `read`, `ref2VerseId` |
| `generateReference` | `generate`, `gen`, `ref`, `verseId2Ref` |
| `detectReferences` | `detect`, `detectRefs`, `linkRefs` |
| `setLanguage` | `lang`, `setLang` |
| `setCanon` | `canon` |

## Build

```bash
npm run build       # Build dist files
npm run test:jest   # Run tests
```

## License

ISC

## Author

KC Kern - [kckern](https://github.com/kckern)
