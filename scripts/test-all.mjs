import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
function discover(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? discover(path)
      : entry.isFile() && /\.test\.[cm]js$/.test(entry.name) ? [relative(root, path)] : [];
  });
}
const files = discover(join(root, 'tests')).sort();
if (!files.length) throw new Error('No JavaScript tests found');

const steps = [
  [`JavaScript tests (${files.length} files)`, process.execPath, ['--test', '--test-concurrency=4', ...files]],
  ['Python daemon tests', process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), ['-m', 'unittest', 'discover', '-s', 'tests', '-v']],
  ['TypeScript checking', process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit']],
];
for (const [label, command, args] of steps) {
  console.log(`\n${label}`);
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: false });
  if (result.error) console.error(`${label}: ${result.error.message}`);
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}
console.log('\nAll automated checks passed. Live provider, browser, account and delivery checks remain separate.');
