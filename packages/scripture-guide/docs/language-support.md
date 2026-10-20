# Language Support

Scripture Guide supports scripture reference parsing and generation in 12 languages. This document describes how to use different languages and what formats are supported for each.

## Supported Languages

| Code | Language | Native Name |
|------|----------|-------------|
| `en` | English | English (default) |
| `ko` | Korean | 한국어 |
| `de` | German | Deutsch |
| `fr` | French | Français |
| `ru` | Russian | Русский |
| `vn` | Vietnamese | Tiếng Việt |
| `swe` | Swedish | Svenska |
| `tgl` | Tagalog | Tagalog |
| `jp` | Japanese | 日本語 |
| `tr` | Turkish | Türkçe |
| `slv` | Slovenian | Slovenščina |
| `eo` | Esperanto | Esperanto |

## Setting the Language

### Global Default

Set the language once for all subsequent operations:

```javascript
import { setLanguage, lookupReference, generateReference } from 'scripture-guide';

setLanguage('ko');

// All calls now use Korean
lookupReference('창세기 1:1');
generateReference([1]);
```

### Per-Call Override

Specify the language for individual function calls:

```javascript
import { lookupReference, generateReference } from 'scripture-guide';

// Parse Korean input
lookupReference('창세기 1:1', 'ko');

// Generate French output
generateReference([1], 'fr');
```

### Browser Persistence

In browser environments, the language setting is automatically persisted to `localStorage`. The preference survives page reloads and browser restarts.

```javascript
setLanguage('fr');
// Stored in localStorage as 'scriptureGuideUtils_language'

// On next page load, the setting is restored automatically
```

## Language Priority

When determining which language to use, Scripture Guide follows this priority:

1. Explicit parameter passed to the function
2. Stored language (from `localStorage` in browsers)
3. Global default set via `setLanguage()`
4. English (`'en'`)

## Cross-Language Lookup

By default, Scripture Guide attempts to parse references in the target language first, then falls back to other languages if no match is found:

```javascript
setLanguage('ko');

// This works even though the input is English
lookupReference('Genesis 1:1');
// { query: 'Genesis 1:1', ref: '창세기 1장 1절', verse_ids: [1] }
```

To disable cross-language fallback:

```javascript
lookupReference('Genesis 1:1', 'ko', { noMulti: true });
// { query: 'Genesis 1:1', ref: '', verse_ids: [] }
```

## Language-Specific Examples

### Korean (한국어)

```javascript
setLanguage('ko');

// Full book names
lookupReference('요한복음 3:16');
// { ref: '요한복음 3장 16절', verse_ids: [26137] }

// Abbreviated
lookupReference('요 3:16');
// { ref: '요한복음 3장 16절', verse_ids: [26137] }

// Korean formatting style (장/절)
generateReference([26137]);
// '요한복음 3장 16절'

// Korean formatting with ranges
generateReference([26137, 26138, 26139]);
// '요한복음 3장 16~18절'

// Book of Mormon
lookupReference('니파이전서 1:1');
lookupReference('니전 1:1');  // Abbreviated
```

**Korean-specific features:**
- Supports both traditional (장/절) and numeric formats
- Handles 편 (section) suffix for Doctrine and Covenants
- Recognizes Korean conjunction words (그리고, 또는, 비교)

### German (Deutsch)

```javascript
setLanguage('de');

lookupReference('Johannes 3:16');
// { ref: 'Johannes 3:16', verse_ids: [26137] }

// German book names (Mose instead of Genesis/Exodus)
lookupReference('1. Mose 1:1');  // Genesis
lookupReference('2. Mose 20:1'); // Exodus

// Abbreviated
lookupReference('Joh 3:16');

generateReference([26137]);
// 'Johannes 3:16'
```

### French (Français)

```javascript
setLanguage('fr');

lookupReference('Jean 3:16');
// { ref: 'Jean 3:16', verse_ids: [26137] }

// With ordinal prefixes
lookupReference('1er Corinthiens 13:1');
lookupReference('Première Corinthiens 13:1');

// Abbreviated
lookupReference('Jn 3:16');

generateReference([26137]);
// 'Jean 3:16'
```

**French-specific features:**
- Recognizes ordinal prefixes (Premier, Deuxième, 1er, 2ème)
- Handles "livre de" (book of) prefix
- Supports French conjunctions (et, voir, aussi)

### Russian (Русский)

```javascript
setLanguage('ru');

lookupReference('От Иоанна 3:16');
// { ref: 'От Иоанна 3:16', verse_ids: [26137] }

// Russian book naming (Царств for Samuel/Kings)
lookupReference('1я Царств 1:1');  // 1 Samuel

// Abbreviated
lookupReference('Ин 3:16');

generateReference([26137]);
// 'От Иоанна 3:16'
```

### Vietnamese (Tiếng Việt)

```javascript
setLanguage('vn');

lookupReference('Giăng 3:16');
// { ref: 'Giăng 3:16', verse_ids: [26137] }

// Vietnamese book naming
lookupReference('Sáng Thế Ký 1:1');  // Genesis

// With chapter/verse words
lookupReference('Giăng chương 3 câu 16');

generateReference([26137]);
// 'Giăng 3:16'
```

**Vietnamese-specific features:**
- Supports "chương" (chapter) and "câu/đoạn" (verse) markers
- Handles Vietnamese diacritics
- Recognizes "Thứ nhất/hai/ba" ordinal prefixes

### Japanese (日本語)

```javascript
setLanguage('jp');

lookupReference('ヨハネによる福音書 3:16');
// { ref: 'ヨハネによる福音書 3:16', verse_ids: [26137] }

// Abbreviated
lookupReference('ヨハ 3:16');

// Book of Mormon
lookupReference('ニーファイ第一書 1:1');
lookupReference('1ニフ 1:1');  // Abbreviated

generateReference([26137]);
// 'ヨハネによる福音書 3:16'
```

### Swedish (Svenska)

```javascript
setLanguage('swe');

lookupReference('Johannes 3:16');
// { ref: 'Johannes 3:16', verse_ids: [26137] }

// Swedish Bible naming
lookupReference('1 Moseboken 1:1');  // Genesis

generateReference([26137]);
// 'Johannes 3:16'
```

### Turkish (Türkçe)

```javascript
setLanguage('tr');

lookupReference('Yuhanna 3:16');
// { ref: 'Yuhanna 3:16', verse_ids: [26137] }

// Turkish naming
lookupReference('Tekvin 1:1');  // Genesis (Yaratılış)

generateReference([26137]);
// 'Yuhanna 3:16'
```

### Tagalog

```javascript
setLanguage('tgl');

lookupReference('Juan 3:16');
// { ref: 'Juan 3:16', verse_ids: [26137] }

// Tagalog naming
lookupReference('Genesis 1:1');
lookupReference('Gen. 1:1');

generateReference([26137]);
// 'Juan 3:16'
```

### Slovenian (Slovenščina)

```javascript
setLanguage('slv');

lookupReference('Janez 3:16');
// { ref: 'Janez 3:16', verse_ids: [26137] }

// Slovenian naming (Mojzesova knjiga)
lookupReference('1 Mz 1:1');  // Genesis

generateReference([26137]);
// 'Janez 3:16'
```

### Esperanto

```javascript
setLanguage('eo');

lookupReference('Johano 3:16');
// { ref: 'Johano 3:16', verse_ids: [26137] }

lookupReference('Genezo 1:1');  // Genesis

generateReference([26137]);
// 'Johano 3:16'
```

## Detection by Language

The `detectReferences` function also respects language settings:

```javascript
setLanguage('ko');

const text = '요한복음 3:16을 읽으세요.';
detectReferences(text, (query, ids) => `[${query}]`);
// '[요한복음 3:16]을 읽으세요.'
```

```javascript
setLanguage('fr');

const text = 'Lisez Jean 3:16 et Romains 8:28.';
detectReferences(text, (query, ids) => `[${query}]`);
// 'Lisez [Jean 3:16] et [Romains 8:28].'
```

## Book Name Reference

Each language has its own set of book names and abbreviations. The canonical book order (for verse ID calculation) remains consistent across all languages—only the display names differ.

| Verse ID 1 | English | Korean | French | German |
|------------|---------|--------|--------|--------|
| Genesis | 창세기 | Genèse | Genesis |
| | Gen | 창 | Ge, Gn | 1. Mose |

| Verse ID 26137 | English | Korean | French | German |
|----------------|---------|--------|--------|--------|
| John | 요한복음 | Jean | Johannes |
| | Jn | 요 | Jn | Joh |

For complete book name mappings in each language, refer to the source data files.
