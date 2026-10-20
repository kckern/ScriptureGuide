// build/generate-rlds-mapping.cjs
// Generates compressed RLDS ↔ Bible mapping from cross_index table
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// DB verse_id 42600 = JST Genesis 1:1 = RLDS ID 1
// So: RLDS_ID = DB_ID - 42599
const DB_OFFSET = 42599;

// Run DB query and parse results
function query(sql) {
  const escaped = sql.replace(/`/g, '\\`');
  const result = execSync(`node db.mjs "${escaped}"`, { 
    encoding: 'utf8',
    cwd: path.join(__dirname, '..')
  });
  
  // Filter to data rows only (contains │, not header/separator lines)
  const lines = result.split('\n').filter(l => {
    if (!l.includes('│')) return false;
    if (l.includes('index')) return false;  // Skip row index column header
    if (l.includes('rlds') || l.includes('bible') || l.includes('bibles')) return false; // Skip column headers
    if (l.includes('─') || l.includes('┌') || l.includes('└')) return false; // Skip table borders
    return true;
  });
  return lines.map(line => {
    // Split by │, skip empty first element and (index) column (positions 0 and 1)
    const cells = line.split('│').slice(2, -1).map(c => c.trim());
    return cells;
  });
}

async function generateMapping() {
  console.log('Fetching cross_index data...');
  
  // Get all 1:1 mappings (JST verses that map to exactly one Bible verse)
  const sql1to1 = `
    SELECT CAST(src AS UNSIGNED) - ${DB_OFFSET} as rlds, CAST(dst AS UNSIGNED) as bible
    FROM \`scripture.guide\`.cross_index 
    WHERE src IN (
      SELECT src FROM \`scripture.guide\`.cross_index GROUP BY src HAVING COUNT(*) = 1
    )
    ORDER BY rlds
  `;
  
  const oneToOne = query(sql1to1).map(([rlds, bible]) => [parseInt(rlds), parseInt(bible)]);
  console.log(`Found ${oneToOne.length} 1:1 mappings`);
  
  // Get multi-mappings (JST verses that map to multiple Bible verses)
  const sqlMulti = `
    SELECT CAST(src AS UNSIGNED) - ${DB_OFFSET} as rlds, GROUP_CONCAT(CAST(dst AS UNSIGNED) ORDER BY dst) as bibles
    FROM \`scripture.guide\`.cross_index 
    WHERE src IN (
      SELECT src FROM \`scripture.guide\`.cross_index GROUP BY src HAVING COUNT(*) > 1
    )
    GROUP BY src
    ORDER BY rlds
  `;
  
  const multiMappings = query(sqlMulti).map(([rlds, bibles]) => [
    parseInt(rlds), 
    bibles.replace(/'/g, '').split(',').map(b => parseInt(b.trim()))
  ]);
  console.log(`Found ${multiMappings.length} multi-mappings`);
  
  // Compress 1:1 mappings into sequential runs
  const runs = [];
  let currentRun = null;
  
  for (const [rlds, bible] of oneToOne) {
    if (!currentRun) {
      currentRun = { rldsStart: rlds, bibleStart: bible, len: 1 };
    } else if (rlds === currentRun.rldsStart + currentRun.len && 
               bible === currentRun.bibleStart + currentRun.len) {
      currentRun.len++;
    } else {
      runs.push([currentRun.rldsStart, currentRun.bibleStart, currentRun.len]);
      currentRun = { rldsStart: rlds, bibleStart: bible, len: 1 };
    }
  }
  if (currentRun) {
    runs.push([currentRun.rldsStart, currentRun.bibleStart, currentRun.len]);
  }
  
  // Separate single-verse runs from multi-verse runs
  const sequentialRuns = runs.filter(r => r[2] > 1);
  const singles = runs.filter(r => r[2] === 1).map(r => [r[0], r[1]]);
  
  console.log(`Compressed into ${sequentialRuns.length} sequential runs + ${singles.length} singles`);
  
  // Calculate stats
  const versesInRuns = sequentialRuns.reduce((sum, r) => sum + r[2], 0);
  console.log(`Sequential runs cover ${versesInRuns} verses`);
  
  // Generate YAML
  const yaml = `# RLDS ↔ Bible Cross-Reference Mapping (Compressed)
# Generated: ${new Date().toISOString()}
# 
# This maps JST (Inspired Version) verse IDs to KJV Bible verse IDs.
# RLDS verse IDs start at 1 (JST Genesis 1:1 = RLDS ID 1)
# Bible verse IDs start at 1 (Genesis 1:1 = Bible ID 1)
#
# Format:
#   runs: [rlds_start, bible_start, length] - sequential 1:1 mappings
#   singles: [rlds, bible] - isolated 1:1 mappings  
#   multi: [rlds, [bible_ids]] - one JST verse maps to multiple Bible verses

# Sequential runs (${sequentialRuns.length} runs covering ${versesInRuns} verses)
# Each run: rlds_start → bible_start for 'length' consecutive verses
runs:
${sequentialRuns.map(r => `  - [${r[0]}, ${r[1]}, ${r[2]}]`).join('\n')}

# Isolated 1:1 mappings not part of a run (${singles.length} entries)
singles:
${singles.map(s => `  - [${s[0]}, ${s[1]}]`).join('\n')}

# Multi-mappings: one RLDS verse → multiple Bible verses (${multiMappings.length} entries)
multi:
${multiMappings.map(m => `  - [${m[0]}, [${m[1].join(', ')}]]`).join('\n')}
`;

  // Write YAML
  const outPath = path.join(__dirname, '..', 'data', 'canons', 'rlds', '_mapping.yml');
  fs.writeFileSync(outPath, yaml);
  console.log(`\nWritten to ${outPath}`);
  console.log(`Total lines: ${yaml.split('\n').length}`);
}

generateMapping().catch(console.error);
