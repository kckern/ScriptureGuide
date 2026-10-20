import { writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { load } from 'js-yaml';

/**
 * Custom Jest reporter that generates a comprehensive markdown report
 * with all input/output data and pass/fail status for each test.
 */
class MarkdownReporter {
  constructor(globalConfig, options) {
    this.globalConfig = globalConfig;
    this.options = options || {};
    this.outputFile = this.options.outputFile || 'test-results.md';
    this.fixtures = null;
    this.library = null;
  }

  async onRunStart() {
    // Load fixtures at start
    try {
      const fixtureContent = readFileSync('test/fixtures/en.yml', 'utf8');
      this.fixtures = load(fixtureContent);
    } catch (e) {
      console.warn('Could not load fixtures:', e.message);
    }

    // Load the library to get actual outputs
    try {
      this.library = await import('../../dist/scriptures.mjs');
    } catch (e) {
      console.warn('Could not load library:', e.message);
    }
  }

  onRunComplete(contexts, results) {
    const report = this.generateReport(results);
    const outputPath = join(process.cwd(), this.outputFile);
    writeFileSync(outputPath, report, 'utf8');
    console.log(`\n📄 Detailed test report written to: ${this.outputFile}`);
  }

  generateReport(results) {
    const timestamp = new Date().toISOString();
    const lines = [];

    // Header
    lines.push('# Test Results Report');
    lines.push('');
    lines.push(`**Generated:** ${timestamp}`);
    lines.push(`**Node Version:** ${process.version}`);
    lines.push('');

    // Summary
    lines.push('## Summary');
    lines.push('');
    const totalPassed = results.numPassedTests;
    const totalFailed = results.numFailedTests;
    const totalSkipped = results.numPendingTests;
    const total = totalPassed + totalFailed + totalSkipped;

    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    lines.push(`| ✅ Passed | ${totalPassed} |`);
    lines.push(`| ❌ Failed | ${totalFailed} |`);
    lines.push(`| ⏭️ Skipped | ${totalSkipped} |`);
    lines.push(`| **Total** | **${total}** |`);
    lines.push('');

    // Overall status banner
    if (totalFailed === 0) {
      lines.push('```');
      lines.push('╔═══════════════════════════════════════╗');
      lines.push('║        ✅ ALL TESTS PASSED            ║');
      lines.push('╚═══════════════════════════════════════╝');
      lines.push('```');
    } else {
      lines.push('```');
      lines.push('╔═══════════════════════════════════════╗');
      lines.push(`║     ❌ ${totalFailed} TEST(S) FAILED              ║`);
      lines.push('╚═══════════════════════════════════════╝');
      lines.push('```');
    }
    lines.push('');

    // Test results by suite
    lines.push('---');
    lines.push('');
    lines.push('## Test Suite Results');
    lines.push('');

    for (const testResult of results.testResults) {
      const fileName = testResult.testFilePath.split('/').pop();
      const suiteStatus = testResult.numFailingTests === 0 ? '✅' : '❌';
      const passCount = testResult.numPassingTests;
      const failCount = testResult.numFailingTests;

      lines.push(`### ${suiteStatus} ${fileName}`);
      lines.push('');
      lines.push(`**${passCount} passed, ${failCount} failed**`);
      lines.push('');

      // Build a map of test results by their full path
      const testMap = new Map();
      for (const test of testResult.testResults) {
        const fullName = [...test.ancestorTitles, test.title].join(' > ');
        testMap.set(fullName, test);
      }

      // Group by top-level describe
      const groups = this.groupByTopDescribe(testResult.testResults);

      for (const [groupName, tests] of Object.entries(groups)) {
        lines.push(`#### ${groupName}`);
        lines.push('');
        lines.push('| Status | Test Case | Time |');
        lines.push('|:------:|-----------|-----:|');

        for (const test of tests) {
          const status = this.getStatusEmoji(test.status);
          const name = this.formatTestName(test);
          const time = `${test.duration || 0}ms`;
          lines.push(`| ${status} | ${this.escapeMarkdown(name)} | ${time} |`);
        }
        lines.push('');

        // Show failures inline
        const failures = tests.filter(t => t.status === 'failed');
        if (failures.length > 0) {
          for (const test of failures) {
            lines.push(`<details><summary>❌ <b>${this.escapeMarkdown(this.formatTestName(test))}</b> - Error Details</summary>`);
            lines.push('');
            lines.push('```');
            lines.push(this.cleanErrorMessage(test.failureMessages.join('\n')));
            lines.push('```');
            lines.push('</details>');
            lines.push('');
          }
        }
      }
    }

    // Detailed fixture data with actual results
    lines.push('---');
    lines.push('');
    lines.push('## Detailed Test Case Data');
    lines.push('');
    lines.push('This section shows each test case with its input, expected output, and actual output from the library.');
    lines.push('');

    if (this.fixtures && this.library) {
      lines.push(this.generateDetailedFixtureReport(results));
    } else {
      lines.push('_Could not generate detailed fixture report - fixtures or library not loaded._');
    }

    return lines.join('\n');
  }

  generateDetailedFixtureReport(jestResults) {
    const lines = [];
    const { lookupReference, generateReference, detectReferences } = this.library;

    // Build a map of test results for quick lookup
    const resultMap = this.buildResultMap(jestResults);

    // ========== LOOKUP TESTS ==========
    lines.push('### 📖 Lookup Reference Tests');
    lines.push('');

    if (this.fixtures.lookup?.critical) {
      lines.push('#### Critical');
      lines.push('');
      lines.push('| Status | ID | Input | Expected IDs | Actual IDs | Expected Ref | Actual Ref |');
      lines.push('|:------:|----|----- |--------------|------------|--------------|------------|');

      for (const tc of this.fixtures.lookup.critical) {
        try {
          const result = lookupReference(tc.input, 'en');
          const idsMatch = JSON.stringify(result.verse_ids) === JSON.stringify(tc.expected_ids);
          const refMatch = result.ref === tc.expected_ref;
          const status = (idsMatch && refMatch) ? '✅' : '❌';

          lines.push(`| ${status} | ${tc.id} | \`${tc.input}\` | \`${JSON.stringify(tc.expected_ids)}\` | \`${JSON.stringify(result.verse_ids)}\` | ${tc.expected_ref} | ${result.ref || '(none)'} |`);
        } catch (e) {
          lines.push(`| ❌ | ${tc.id} | \`${tc.input}\` | \`${JSON.stringify(tc.expected_ids)}\` | ERROR | ${tc.expected_ref} | ${e.message} |`);
        }
      }
      lines.push('');
    }

    if (this.fixtures.lookup?.edge_cases) {
      lines.push('#### Edge Cases');
      lines.push('');
      lines.push('| Status | ID | Input | Tags | Expected IDs | Actual IDs | Match |');
      lines.push('|:------:|----|----- |------|--------------|------------|:-----:|');

      for (const tc of this.fixtures.lookup.edge_cases) {
        try {
          const result = lookupReference(tc.input, 'en');
          const idsMatch = JSON.stringify(result.verse_ids) === JSON.stringify(tc.expected_ids);
          const status = idsMatch ? '✅' : '❌';
          const tags = (tc.tags || []).map(t => `\`${t}\``).join(', ');

          lines.push(`| ${status} | ${tc.id} | \`${tc.input}\` | ${tags} | \`${JSON.stringify(tc.expected_ids)}\` | \`${JSON.stringify(result.verse_ids)}\` | ${idsMatch ? 'Yes' : 'No'} |`);
        } catch (e) {
          lines.push(`| ❌ | ${tc.id} | \`${tc.input}\` | - | \`${JSON.stringify(tc.expected_ids)}\` | ERROR | No |`);
        }
      }
      lines.push('');
    }

    if (this.fixtures.lookup?.invalid) {
      lines.push('#### Invalid Inputs');
      lines.push('');
      lines.push('| Status | ID | Input | Description | Actual IDs | Correct |');
      lines.push('|:------:|----|----- |-------------|------------|:-------:|');

      for (const tc of this.fixtures.lookup.invalid) {
        try {
          const result = lookupReference(tc.input, 'en');
          const isEmpty = result.verse_ids.length === 0;
          const status = isEmpty ? '✅' : '❌';

          lines.push(`| ${status} | ${tc.id} | \`${tc.input || '""'}\` | ${tc.description} | \`${JSON.stringify(result.verse_ids)}\` | ${isEmpty ? 'Yes' : 'No'} |`);
        } catch (e) {
          lines.push(`| ✅ | ${tc.id} | \`${tc.input || '""'}\` | ${tc.description} | (threw error) | Yes |`);
        }
      }
      lines.push('');
    }

    // ========== GENERATE TESTS ==========
    lines.push('### 🔄 Generate Reference Tests');
    lines.push('');

    if (this.fixtures.generate?.critical) {
      lines.push('#### Critical');
      lines.push('');
      lines.push('| Status | ID | Input IDs | Expected | Actual | Match |');
      lines.push('|:------:|----|-----------| ---------|--------|:-----:|');

      for (const tc of this.fixtures.generate.critical) {
        try {
          const result = generateReference(tc.input_ids, 'en');
          const match = result === tc.expected;
          const status = match ? '✅' : '❌';

          lines.push(`| ${status} | ${tc.id} | \`${JSON.stringify(tc.input_ids)}\` | ${tc.expected || '""'} | ${result || '""'} | ${match ? 'Yes' : 'No'} |`);
        } catch (e) {
          lines.push(`| ❌ | ${tc.id} | \`${JSON.stringify(tc.input_ids)}\` | ${tc.expected || '""'} | ERROR: ${e.message} | No |`);
        }
      }
      lines.push('');
    }

    if (this.fixtures.generate?.edge_cases) {
      lines.push('#### Edge Cases');
      lines.push('');
      lines.push('| Status | ID | Input IDs | Tags | Expected | Actual | Match |');
      lines.push('|:------:|----|-----------|------|----------|--------|:-----:|');

      for (const tc of this.fixtures.generate.edge_cases) {
        try {
          const result = generateReference(tc.input_ids, 'en');
          const match = result === tc.expected;
          const status = match ? '✅' : '❌';
          const tags = (tc.tags || []).map(t => `\`${t}\``).join(', ');

          lines.push(`| ${status} | ${tc.id} | \`${JSON.stringify(tc.input_ids)}\` | ${tags} | ${tc.expected} | ${result} | ${match ? 'Yes' : 'No'} |`);
        } catch (e) {
          lines.push(`| ❌ | ${tc.id} | \`${JSON.stringify(tc.input_ids)}\` | - | ${tc.expected} | ERROR | No |`);
        }
      }
      lines.push('');
    }

    // ========== DETECT TESTS ==========
    lines.push('### 🔍 Detect Reference Tests');
    lines.push('');
    lines.push('This section shows what references were detected in each input text, including the original matched text, resolved verse IDs, and canonical reference.');
    lines.push('');

    if (this.fixtures.detect?.critical) {
      lines.push('#### Critical');
      lines.push('');

      for (const tc of this.fixtures.detect.critical) {
        lines.push(`##### ${tc.id}: ${tc.description}`);
        lines.push('');
        lines.push('**Input:**');
        lines.push('```');
        lines.push(tc.input);
        lines.push('```');
        lines.push('');

        // Collect detailed detection info
        const detections = [];
        try {
          detectReferences(
            tc.input,
            (originalText, verseIds) => {
              detections.push({
                originalText,
                verseIds: [...verseIds],
                canonical: generateReference(verseIds, 'en'),
                verseCount: verseIds.length
              });
              return `[${generateReference(verseIds, 'en')}]`;
            },
            { language: 'en', contextAware: true }
          );
        } catch (e) {
          lines.push(`❌ Detection error: ${e.message}`);
        }

        if (detections.length > 0) {
          lines.push('**Detected References:**');
          lines.push('');
          lines.push('| # | Original Text | Verse IDs | Canonical Reference |');
          lines.push('|:-:|---------------|-----------|---------------------|');
          detections.forEach((d, i) => {
            const idsDisplay = d.verseIds.length > 5
              ? `[${d.verseIds.slice(0, 3).join(', ')}, ... ${d.verseIds.length} total]`
              : `[${d.verseIds.join(', ')}]`;
            lines.push(`| ${i + 1} | \`${this.escapeMarkdown(d.originalText)}\` | ${idsDisplay} | ${d.canonical} |`);
          });
          lines.push('');
        } else {
          lines.push('_No references detected_');
          lines.push('');
        }

        // Test contextAware: true
        if (tc.context_variations?.contextAware_true) {
          try {
            const result = detectReferences(
              tc.input,
              (text, ids) => `[${generateReference(ids, 'en')}]`,
              { language: 'en', contextAware: true }
            );
            const expected = tc.context_variations.contextAware_true.expected_output;
            const match = result === expected;

            lines.push('**Output (contextAware: true):**');
            lines.push('| Expected | Actual | Status |');
            lines.push('|----------|--------|:------:|');
            lines.push(`| \`${this.escapeMarkdown(expected)}\` | \`${this.escapeMarkdown(result)}\` | ${match ? '✅' : '❌'} |`);
            lines.push('');
          } catch (e) {
            lines.push(`**contextAware: true** - ❌ ERROR: ${e.message}`);
            lines.push('');
          }
        }

        // Test contextAware: false
        if (tc.context_variations?.contextAware_false) {
          try {
            const result = detectReferences(
              tc.input,
              (text, ids) => `[${generateReference(ids, 'en')}]`,
              { language: 'en', contextAware: false }
            );
            const expected = tc.context_variations.contextAware_false.expected_output;
            const match = result === expected;

            lines.push('**Output (contextAware: false):**');
            lines.push('| Expected | Actual | Status |');
            lines.push('|----------|--------|:------:|');
            lines.push(`| \`${this.escapeMarkdown(expected)}\` | \`${this.escapeMarkdown(result)}\` | ${match ? '✅' : '❌'} |`);
            lines.push('');
          } catch (e) {
            lines.push(`**contextAware: false** - ❌ ERROR: ${e.message}`);
            lines.push('');
          }
        }
      }
    }

    if (this.fixtures.detect?.edge_cases) {
      lines.push('#### Edge Cases');
      lines.push('');

      for (const tc of this.fixtures.detect.edge_cases) {
        lines.push(`##### ${tc.id}: ${tc.description}`);
        lines.push('');
        lines.push('**Input:** `' + tc.input + '`');
        lines.push('');
        lines.push('**Tags:** ' + (tc.tags || []).map(t => `\`${t}\``).join(', '));
        lines.push('');

        // Collect detailed detection info
        const detections = [];
        try {
          detectReferences(
            tc.input,
            (originalText, verseIds) => {
              detections.push({
                originalText,
                verseIds: [...verseIds],
                canonical: generateReference(verseIds, 'en'),
                verseCount: verseIds.length
              });
              return `[${originalText}]`;
            },
            { language: 'en', contextAware: true }
          );
        } catch (e) {
          lines.push(`❌ Detection error: ${e.message}`);
        }

        if (detections.length > 0) {
          lines.push('**Detected References:**');
          lines.push('');
          lines.push('| # | Original Text | Verse IDs | Canonical Reference |');
          lines.push('|:-:|---------------|-----------|---------------------|');
          detections.forEach((d, i) => {
            const idsDisplay = d.verseIds.length > 5
              ? `[${d.verseIds.slice(0, 3).join(', ')}, ... ${d.verseIds.length} total]`
              : `[${d.verseIds.join(', ')}]`;
            lines.push(`| ${i + 1} | \`${this.escapeMarkdown(d.originalText)}\` | ${idsDisplay} | ${d.canonical} |`);
          });
          lines.push('');

          const foundRefs = detections.map(d => d.canonical);
          const match = JSON.stringify(foundRefs) === JSON.stringify(tc.expected_refs);

          lines.push('| Expected Refs | Actual Refs | Status |');
          lines.push('|---------------|-------------|:------:|');
          lines.push(`| ${tc.expected_refs?.join(', ')} | ${foundRefs.join(', ')} | ${match ? '✅' : '❌'} |`);
          lines.push('');
        } else {
          lines.push('_No references detected_');
          lines.push('');
        }
      }
    }

    // ========== ROUNDTRIP SUMMARY ==========
    lines.push('### 🔄 Roundtrip Tests');
    lines.push('');
    lines.push('Roundtrip tests verify: `input → lookupReference → generateReference → lookupReference = same IDs`');
    lines.push('');

    if (this.fixtures.lookup?.critical) {
      lines.push('| Status | Input | Forward IDs | Canonical | Backward IDs | Match |');
      lines.push('|:------:|-------|-------------|-----------|--------------|:-----:|');

      for (const tc of this.fixtures.lookup.critical) {
        try {
          const forward = lookupReference(tc.input, 'en');
          const canonical = generateReference(forward.verse_ids, 'en');
          const backward = lookupReference(canonical, 'en');
          const match = JSON.stringify(forward.verse_ids) === JSON.stringify(backward.verse_ids);
          const status = match ? '✅' : '❌';

          lines.push(`| ${status} | \`${tc.input}\` | \`[${forward.verse_ids.length} ids]\` | ${canonical} | \`[${backward.verse_ids.length} ids]\` | ${match ? 'Yes' : 'No'} |`);
        } catch (e) {
          lines.push(`| ❌ | \`${tc.input}\` | ERROR | - | - | No |`);
        }
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  buildResultMap(jestResults) {
    const map = new Map();
    for (const suite of jestResults.testResults) {
      for (const test of suite.testResults) {
        const key = [...test.ancestorTitles, test.title].join(' > ');
        map.set(key, test);
      }
    }
    return map;
  }

  groupByTopDescribe(tests) {
    const groups = {};
    for (const test of tests) {
      const topDescribe = test.ancestorTitles[0] || 'Other';
      if (!groups[topDescribe]) {
        groups[topDescribe] = [];
      }
      groups[topDescribe].push(test);
    }
    return groups;
  }

  formatTestName(test) {
    // Get just the immediate parent and test name
    const ancestors = test.ancestorTitles.slice(1); // Skip top-level describe
    return [...ancestors, test.title].join(' > ');
  }

  getStatusEmoji(status) {
    switch (status) {
      case 'passed': return '✅';
      case 'failed': return '❌';
      case 'pending': return '⏭️';
      case 'skipped': return '⏭️';
      default: return '❓';
    }
  }

  escapeMarkdown(text) {
    if (!text) return '';
    return String(text).replace(/\|/g, '\\|').replace(/\n/g, ' ').replace(/`/g, "'");
  }

  cleanErrorMessage(msg) {
    return msg
      .replace(/\x1b\[[0-9;]*m/g, '')
      .replace(/\n+/g, '\n')
      .trim()
      .split('\n')
      .slice(0, 30)
      .join('\n');
  }
}

export default MarkdownReporter;
