# Context Detection

Scripture Guide includes a context-aware reference detection system that can identify implied scripture references based on surrounding context. This allows the library to recognize references like "v. 16" or "verses 3-5" when a book and chapter have been established earlier in the text.

## Overview

Traditional reference detection only finds explicit references like "John 3:16". Context-aware detection extends this to find:

- **Verse abbreviations**: "v. 16", "vv. 3-5", "verse 10"
- **Chapter:verse patterns**: "3:16" when a book is established in context
- **Implied references**: References that rely on a previously mentioned book

## Enabling Context Detection

Context detection is **enabled by default**. You can control it via options:

```javascript
import { detectReferences } from 'scripture-guide';

// Context-aware (default)
detectReferences(text, callback);
detectReferences(text, callback, { contextAware: true });

// Traditional detection only
detectReferences(text, callback, { contextAware: false });
```

## How It Works

### 1. Explicit Reference Establishes Context

When the detector finds an explicit reference, it remembers the book and chapter:

```javascript
const text = 'In John 3, Jesus teaches about being born again.';
// Context established: book="John", chapter=3
```

### 2. Implied References Use Context

Subsequent patterns that look like verse references are resolved using the established context:

```javascript
const text = 'In John 3, Jesus teaches about being born again (v. 16).';

detectReferences(text, (query, ids) => `[${query}]`);
// 'In [John 3], Jesus teaches about being born again ([v. 16]).'

// The "v. 16" is resolved as "John 3:16"
```

### 3. Context Has Distance Limits

By default, context extends up to 500 characters. References beyond this distance won't inherit context:

```javascript
detectReferences(text, callback, { maxContextDistance: 500 }); // default
detectReferences(text, callback, { maxContextDistance: 1000 }); // extended
detectReferences(text, callback, { maxContextDistance: 200 });  // restricted
```

## Supported Patterns

### Verse Abbreviations

The detector recognizes common verse abbreviation patterns:

| Pattern | Example | Resolved As |
|---------|---------|-------------|
| `v.` | `v. 16` | Chapter:16 |
| `v` | `v 16` | Chapter:16 |
| `vv.` | `vv. 3-5` | Chapter:3-5 |
| `vv` | `vv 3, 5, 7` | Chapter:3, 5, 7 |
| `vs.` | `vs. 10` | Chapter:10 |
| `verse` | `verse 16` | Chapter:16 |
| `verses` | `verses 1-10` | Chapter:1-10 |

```javascript
const text = `
  John 3 is a pivotal chapter. The famous verse (v. 16) speaks of God's love.
  The following verses (vv. 17-18) explain judgment. See also verse 36.
`;

detectReferences(text, (q, ids) => `[${q}:${ids.length}]`);
// John 3 -> [John 3:36]
// v. 16 -> [v. 16:1] (John 3:16)
// vv. 17-18 -> [vv. 17-18:2] (John 3:17-18)
// verse 36 -> [verse 36:1] (John 3:36)
```

### Standalone Chapter:Verse

When a book is in context, bare `chapter:verse` patterns are detected:

```javascript
const text = 'In John, compare 3:16 with 1:1 and 14:6.';

detectReferences(text, (q, ids) => `[${q}]`);
// 'In John, compare [3:16] with [1:1] and [14:6].'
```

**Note**: This pattern requires that the chapter:verse not already be part of an explicit reference.

## Configuration Options

### Full Options Reference

```javascript
detectReferences(content, callback, {
  language: 'en',           // Language for parsing
  contextAware: true,       // Enable context detection (default: true)
  contextScope: 'sentence', // Context scope (currently: 'sentence')
  maxContextDistance: 500,  // Max characters to look back for context
  enableImpliedBooks: true, // Detect references without book names
  enableVerseAbbrev: true   // Detect v., vv., verse patterns
});
```

### Disabling Specific Features

```javascript
// Only detect explicit references
detectReferences(text, callback, { contextAware: false });

// Context-aware, but don't detect "v." abbreviations
detectReferences(text, callback, { enableVerseAbbrev: false });

// Context-aware, but don't infer books from context
detectReferences(text, callback, { enableImpliedBooks: false });
```

## Real-World Examples

### Academic Commentary

```javascript
const commentary = `
  The prologue to John's Gospel (1:1-18) establishes key themes.
  The Word (vv. 1-2) is identified with God, yet distinct.
  The incarnation (v. 14) is central to John's theology.
  Compare with Genesis 1:1 and Colossians 1:15-17.
`;

detectReferences(commentary, (query, verseIds) => {
  return `<span class="ref" data-ids="${verseIds.join(',')}">${query}</span>`;
});
```

**Result**: All references are detected:
- "John's Gospel (1:1-18)" - explicit
- "vv. 1-2" - implied (John 1:1-2)
- "v. 14" - implied (John 1:14)
- "Genesis 1:1" - explicit (resets context)
- "Colossians 1:15-17" - explicit

### Scripture Study Notes

```javascript
const notes = `
  Alma 32 teaches about faith. The famous passage on faith as a seed
  begins at v. 28. Verses 32-34 explain how the seed grows.
  Compare with Ether 12:6 and Hebrews 11:1.
`;

detectReferences(notes, (query, ids) => `[[${query}]]`, { language: 'en' });
```

### Multiple Context Switches

```javascript
const text = `
  In Matthew 5 (the Sermon on the Mount), Jesus teaches the Beatitudes (vv. 3-12).
  Luke's version in chapter 6 (vv. 20-23) has some differences.
  Both accounts emphasize blessing.
`;

detectReferences(text, (q, ids) => `[${q}]`);
// [Matthew 5], [vv. 3-12] (Matt 5:3-12)
// [chapter 6], [vv. 20-23] (Luke 6:20-23) - context switched to Luke
```

## Edge Cases

### No Context Available

If no explicit reference precedes an implied reference, it won't be detected:

```javascript
const text = 'See verses 3-5 for more details.';

detectReferences(text, (q, ids) => `[${q}]`);
// 'See verses 3-5 for more details.' (no change - no context)
```

### Overlapping References

When an implied reference overlaps with an explicit one, the explicit reference takes precedence:

```javascript
const text = 'John 3:16-18 is important, especially v. 16.';

detectReferences(text, (q, ids) => `[${q}]`);
// '[John 3:16-18] is important, especially v. 16.'
// The "v. 16" is not double-detected since it's conceptually covered
```

### Context Distance

References too far from the context source aren't detected:

```javascript
const text = 'John 3 teaches...' + 'x'.repeat(600) + '...see v. 16.';

detectReferences(text, (q, ids) => `[${q}]`, { maxContextDistance: 500 });
// The "v. 16" won't be detected (too far from "John 3")
```

## Performance Considerations

Context-aware detection performs additional analysis:

1. First pass: Find all explicit references
2. Build context map from explicit references
3. Second pass: Find implied references using context
4. Merge and deduplicate all matches

For very large documents, you may want to:
- Process text in smaller chunks
- Reduce `maxContextDistance` for faster processing
- Disable context detection if not needed

```javascript
// Faster for large documents without implied references
detectReferences(largeText, callback, { contextAware: false });
```

## Comparison: With vs Without Context

| Input Text | Without Context | With Context |
|------------|-----------------|--------------|
| `John 3:16` | `[John 3:16]` | `[John 3:16]` |
| `In John 3, see v. 16` | `In [John 3], see v. 16` | `In [John 3], see [v. 16]` |
| `vv. 3-5 are key` | `vv. 3-5 are key` | `[vv. 3-5]` (if context exists) |
| `Read 3:16` | `Read 3:16` | `Read [3:16]` (if context exists) |
