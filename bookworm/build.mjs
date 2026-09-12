/**
 * Compile src/gutenberg.ts and inline the result into index.html.
 *
 * The prototype has to stay a single file that opens straight off disk, so the
 * compiled JS is injected between two markers rather than linked. Run:
 *
 *   npm run build    # compile + inline
 *   npm run check    # type-check only, no write
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const checkOnly = process.argv.includes('--check');

const START = '/* CATALOG:START — generated from src/gutenberg.ts by build.mjs. Do not edit. */';
const END = '/* CATALOG:END */';

function tsc(args) {
  try {
    execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['--yes', 'tsc', ...args], {
      cwd: root,
      stdio: 'inherit',
    });
  } catch {
    console.error('\nTypeScript failed. index.html was not modified.');
    process.exit(1);
  }
}

if (checkOnly) {
  tsc(['--noEmit']);
  console.log('Types OK.');
  process.exit(0);
}

tsc([]);

const compiled = readFileSync(resolve(root, 'build/gutenberg.js'), 'utf8').trimEnd();
const htmlPath = resolve(root, 'index.html');
const html = readFileSync(htmlPath, 'utf8');

const start = html.indexOf(START);
const end = html.indexOf(END);
if (start === -1 || end === -1 || end < start) {
  console.error('Could not find the CATALOG markers in index.html.');
  process.exit(1);
}

writeFileSync(htmlPath, html.slice(0, start + START.length) + '\n' + compiled + '\n' + html.slice(end));
console.log(`Inlined ${compiled.length.toLocaleString()} bytes into index.html`);
