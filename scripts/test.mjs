import { build } from 'esbuild';
import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const entries = (await readdir('tests')).filter(name => name.endsWith('.test.ts')).map(name => `tests/${name}`);
await build({ entryPoints: entries, outdir: 'dist/tests', bundle: true, platform: 'node', format: 'esm', target: 'node22' });
const result = spawnSync(process.execPath, ['--test', ...entries.map(name => name.replace('tests/', 'dist/tests/').replace('.ts', '.js'))], { stdio: 'inherit' });
process.exitCode = result.status ?? 1;
