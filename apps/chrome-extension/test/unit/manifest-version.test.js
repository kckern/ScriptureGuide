import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '../..');
const read = f => JSON.parse(readFileSync(join(root, f), 'utf8'));

describe('manifest version', () => {
  test('matches package.json version', () => {
    expect(read('manifest.json').version).toBe(read('package.json').version);
  });
});
