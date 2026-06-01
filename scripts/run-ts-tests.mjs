import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const roots = process.argv.slice(2);

if (roots.length === 0) {
  console.error('Usage: node scripts/run-ts-tests.mjs <dir> [dir...]');
  process.exit(1);
}

function collectTestFiles(directory) {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectTestFiles(path));
      continue;
    }

    if (entry.isFile() && /\.test\.tsx?$/.test(entry.name)) {
      files.push(path);
    }
  }

  return files;
}

const testFiles = roots.flatMap(collectTestFiles).sort();

if (testFiles.length === 0) {
  console.error(`No test files found under: ${roots.join(', ')}`);
  process.exit(1);
}

const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const result = spawnSync(command, ['exec', 'tsx', '--test', ...testFiles], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.error) {
  console.error(result.error.message);
}

process.exit(result.status ?? 1);
