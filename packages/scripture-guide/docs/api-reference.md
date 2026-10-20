# API Reference

Complete documentation for all exported functions in Scripture Guide.

## Functions Overview

| Function | Description |
|----------|-------------|
| [`lookupReference`](#lookupreference) | Parse a scripture reference string into verse IDs |
| [`generateReference`](#generatereference) | Convert verse IDs into a formatted reference string |
| [`setLanguage`](#setlanguage) | Set the default language for parsing and output |
| [`detectReferences`](#detectreferences) | Find and process scripture references in text |

---

## lookupReference

Parse a scripture reference string and return structured data including verse IDs.

### Signature

```typescript
lookupReference(query: string, language?: string, config?: LookupConfig): LookupResult
```

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | `string` | required | The scripture reference to parse |
| `language` | `string` | `null` | Language code (e.g., 'en', 'ko', 'fr'). Falls back to default language if not specified |
| `config` | `LookupConfig` | `{}` | Configuration options |

#### LookupConfig

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `noMulti` | `boolean` | `false` | If `true`, disables multi-language fallback lookup |

### Returns

```typescript
interface LookupResult {
  query: string;      // Original input string
  ref: string;        // Normalized reference string
  verse_ids: number[]; // Array of verse ID integers
}
```

### Examples

```javascript
import { lookupReference } from 'scripture-guide';

// Basic usage
lookupReference('John 3:16');
// { query: 'John 3:16', ref: 'John 3:16', verse_ids: [26137] }

// With abbreviations
lookupReference('Mt 5:3-12');
// { query: 'Mt 5:3-12', ref: 'Matthew 5:3-12', verse_ids: [23239, 23240, ...] }

// Specific language
lookupReference('창세기 1:1', 'ko');
// { query: '창세기 1:1', ref: '창세기 1장 1절', verse_ids: [1] }

// Cross-language lookup (English input, Korean output)
lookupReference('Genesis 1:1', 'ko');
// { query: 'Genesis 1:1', ref: '창세기 1장 1절', verse_ids: [1] }

// Disable multi-language fallback
lookupReference('Genesis 1:1', 'ko', { noMulti: true });
// { query: 'Genesis 1:1', ref: '', verse_ids: [] }

// Invalid reference
lookupReference('Not a reference');
// { query: 'Not a reference', ref: '', verse_ids: [] }
```

### Aliases

The following aliases are available for convenience:

- `lookup`
- `parse`
- `read`
- `ref2VerseId`

```javascript
import { lookup, parse } from 'scripture-guide';

lookup('John 3:16');  // Same as lookupReference
parse('John 3:16');   // Same as lookupReference
```

---

## generateReference

Convert an array of verse IDs into a formatted scripture reference string.

### Signature

```typescript
generateReference(verse_ids: number[] | string, language?: string): string
```

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `verse_ids` | `number[]` or `string` | required | Array of verse IDs or comma-separated string |
| `language` | `string` | `null` | Language code for output formatting |

### Returns

A formatted scripture reference string. Returns empty string if input is invalid.

### Examples

```javascript
import { generateReference } from 'scripture-guide';

// Single verse
generateReference([26137]);
// 'John 3:16'

// Consecutive verses (collapsed to range)
generateReference([26137, 26138, 26139]);
// 'John 3:16-18'

// Non-consecutive verses
generateReference([1, 2, 3, 10, 11]);
// 'Genesis 1:1-3, 10-11'

// Spanning multiple chapters
generateReference([31, 32, 33]);
// 'Genesis 1:31-2:2'

// Spanning multiple books
generateReference([1533, 1534]);
// 'Genesis 50:26 - Exodus 1:1'

// String input
generateReference('26137,26138,26139');
// 'John 3:16-18'

// Different language output
generateReference([26137], 'ko');
// '요한복음 3장 16절'

generateReference([26137], 'fr');
// 'Jean 3:16'
```

### Aliases

- `ref`
- `gen`
- `generate`
- `verseId2Ref`

```javascript
import { ref, generate } from 'scripture-guide';

ref([26137]);       // Same as generateReference
generate([26137]);  // Same as generateReference
```

---

## setLanguage

Set the default language for all parsing and generation operations.

### Signature

```typescript
setLanguage(language: string): void
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `language` | `string` | Language code to set as default |

### Supported Languages

| Code | Language |
|------|----------|
| `en` | English (default) |
| `ko` | Korean (한국어) |
| `de` | German (Deutsch) |
| `fr` | French (Français) |
| `ru` | Russian (Русский) |
| `vn` | Vietnamese (Tiếng Việt) |
| `swe` | Swedish (Svenska) |
| `tgl` | Tagalog |
| `jp` | Japanese (日本語) |
| `tr` | Turkish (Türkçe) |
| `slv` | Slovenian (Slovenščina) |
| `eo` | Esperanto |

### Examples

```javascript
import { setLanguage, lookupReference, generateReference } from 'scripture-guide';

// Set Korean as default
setLanguage('ko');

// All subsequent calls use Korean
lookupReference('요한복음 3:16');
// { query: '요한복음 3:16', ref: '요한복음 3장 16절', verse_ids: [26137] }

generateReference([26137]);
// '요한복음 3장 16절'

// Override for a single call
generateReference([26137], 'en');
// 'John 3:16'
```

### Language Persistence

In browser environments, the language setting is persisted to `localStorage` under the key `scriptureGuideUtils_language`. This means the language preference survives page reloads.

### Aliases

- `lang`
- `language`
- `setLang`

---

## detectReferences

Find scripture references within a block of text and process them with a callback function.

### Signature

```typescript
detectReferences(
  content: string,
  callback?: (query: string, verseIds: number[]) => string,
  options?: DetectOptions | string
): string
```

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `content` | `string` | required | Text containing scripture references |
| `callback` | `function` | `(i) => \`[${i}]\`` | Function to process each found reference |
| `options` | `DetectOptions` or `string` | `{}` | Detection options or language code (legacy) |

#### Callback Function

```typescript
(query: string, verseIds: number[]) => string
```

- `query`: The matched reference text as it appeared in the content
- `verseIds`: Array of verse IDs for the reference
- Returns: Replacement string for the matched reference

#### DetectOptions

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `language` | `string` | `null` | Language code for parsing |
| `contextAware` | `boolean` | `true` | Enable context-aware detection |
| `contextScope` | `string` | `'sentence'` | Scope for context detection |
| `maxContextDistance` | `number` | `500` | Max character distance for context |
| `enableImpliedBooks` | `boolean` | `true` | Detect references without book names |
| `enableVerseAbbrev` | `boolean` | `true` | Detect "v." and "vv." abbreviations |

### Returns

The original content with all detected references replaced by the callback's return value.

### Examples

```javascript
import { detectReferences } from 'scripture-guide';

// Basic usage - wrap references in brackets
const text = 'Read John 3:16 for encouragement.';
detectReferences(text);
// 'Read [John 3:16] for encouragement.'

// Create HTML links
detectReferences(text, (query, verseIds) => {
  return `<a href="/bible/${verseIds[0]}">${query}</a>`;
});
// 'Read <a href="/bible/26137">John 3:16</a> for encouragement.'

// Multiple references
const multiText = 'Compare Genesis 1:1 with John 1:1.';
detectReferences(multiText, (query, ids) => `[${query}]`);
// 'Compare [Genesis 1:1] with [John 1:1].'

// Complex references
const complex = 'See Mt 5:3-12; Lk 6:20-23 for the Beatitudes.';
detectReferences(complex, (q, ids) => `<ref>${q}</ref>`);
// 'See <ref>Mt 5:3-12</ref>; <ref>Lk 6:20-23</ref> for the Beatitudes.'

// With language option
detectReferences('읽다 요한복음 3:16', (q, ids) => `[${q}]`, { language: 'ko' });
// '읽다 [요한복음 3:16]'

// Disable context-aware detection
detectReferences(text, callback, { contextAware: false });
```

### Context-Aware Detection

When `contextAware` is enabled (default), the function can detect implied references based on context:

```javascript
const text = 'In John 3, Jesus explains salvation (v. 16) and judgment (vv. 17-18).';

detectReferences(text, (q, ids) => `[${q}]`);
// 'In [John 3], Jesus explains salvation ([v. 16]) and judgment ([vv. 17-18]).'
// The "v. 16" is understood as "John 3:16" from context
```

See [Context Detection](./context-detection.md) for more details.

### Aliases

- `detect`
- `detectScriptureReferences`
- `detectRefs`
- `detectScriptures`
- `linkRefs`

---

## Type Definitions

For TypeScript users, here are the complete type definitions:

```typescript
interface LookupResult {
  query: string;
  ref: string;
  verse_ids: number[];
}

interface LookupConfig {
  noMulti?: boolean;
}

interface DetectOptions {
  language?: string;
  contextAware?: boolean;
  contextScope?: 'sentence' | 'paragraph';
  maxContextDistance?: number;
  enableImpliedBooks?: boolean;
  enableVerseAbbrev?: boolean;
}

type DetectCallback = (query: string, verseIds: number[]) => string;
```
