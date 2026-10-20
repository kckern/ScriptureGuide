# Getting Started

Scripture Guide is a JavaScript library for parsing scripture references into structured data. It converts human-readable references like "John 3:16" into verse IDs that can be used to query scripture databases.

## Features

- Parse any standard scripture reference format
- Support for 12 languages (English, Korean, French, German, and more)
- Detect and link scripture references within text blocks
- Generate formatted references from verse IDs
- Works in Node.js and browsers

## Installation

```bash
npm install scripture-guide
```

## Quick Start

```javascript
import { lookupReference, generateReference } from 'scripture-guide';

// Parse a reference to get verse IDs
const result = lookupReference('John 3:16');
console.log(result);
// { query: 'John 3:16', ref: 'John 3:16', verse_ids: [26137] }

// Convert verse IDs back to a reference string
const ref = generateReference([26137, 26138, 26139]);
console.log(ref);
// 'John 3:16-18'
```

## Import Methods

### ES Modules (recommended)
```javascript
import { lookupReference, generateReference, detectReferences, setLanguage } from 'scripture-guide';
```

### CommonJS
```javascript
const { lookupReference, generateReference, detectReferences, setLanguage } = require('scripture-guide');
```

## Basic Usage

### Looking Up References

The `lookupReference` function accepts various reference formats:

```javascript
// Simple verse
lookupReference('Genesis 1:1');
// { query: 'Genesis 1:1', ref: 'Genesis 1:1', verse_ids: [1] }

// Verse range
lookupReference('Exodus 20:1-10');
// { query: 'Exodus 20:1-10', ref: 'Exodus 20:1-10', verse_ids: [2057, 2058, ...] }

// Abbreviated book names
lookupReference('Mt 5:3-12');
// { query: 'Mt 5:3-12', ref: 'Matthew 5:3-12', verse_ids: [23239, 23240, ...] }

// Entire chapter
lookupReference('Psalm 23');
// { query: 'Psalm 23', ref: 'Psalms 23', verse_ids: [14240, 14241, ...] }
```

### Generating References

Convert verse IDs back into human-readable references:

```javascript
generateReference([1, 2, 3]);           // 'Genesis 1:1-3'
generateReference([26137]);             // 'John 3:16'
generateReference([1, 2, 3, 10, 11]);   // 'Genesis 1:1-3, 10-11'
```

## Working with Languages

Set the default language for parsing and generating references:

```javascript
import { setLanguage, lookupReference, generateReference } from 'scripture-guide';

// Set Korean as the default language
setLanguage('ko');

lookupReference('요한복음 3:16');
// { query: '요한복음 3:16', ref: '요한복음 3장 16절', verse_ids: [26137] }

generateReference([26137]);
// '요한복음 3장 16절'
```

See [Language Support](./language-support.md) for all available languages.

## Detecting References in Text

Find and process scripture references within a block of text:

```javascript
import { detectReferences } from 'scripture-guide';

const text = 'Read John 3:16 and Romans 8:28 for encouragement.';

const result = detectReferences(text, (query, verseIds) => {
  return `<a href="/verse/${verseIds[0]}">${query}</a>`;
});

// 'Read <a href="/verse/26137">John 3:16</a> and <a href="/verse/28098">Romans 8:28</a> for encouragement.'
```

See [Context Detection](./context-detection.md) for advanced detection options.

## Next Steps

- [API Reference](./api-reference.md) - Complete function documentation
- [Reference Formats](./reference-formats.md) - All supported input formats
- [Examples](./examples.md) - Real-world usage patterns
