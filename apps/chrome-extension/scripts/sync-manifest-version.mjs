// Copy package.json "version" into manifest.json. Run by `npm run version-packages`.
import { readFileSync, writeFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
if (manifest.version !== pkg.version) {
  manifest.version = pkg.version;
  writeFileSync('manifest.json', JSON.stringify(manifest, null, 2) + '\n');
}
