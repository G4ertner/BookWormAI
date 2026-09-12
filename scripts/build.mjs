import { build } from 'esbuild';
import { mkdir, copyFile, readFile, rm } from 'node:fs/promises';
// Build one reader for both runtimes; remove retired bundles on every build.
await rm('dist', { recursive: true, force: true });
await mkdir('dist/public', { recursive: true });
await build({ entryPoints: ['src/simple/client.ts'], outfile: 'dist/public/simple.js', bundle: true, platform: 'browser', format: 'esm', target: 'es2022' });
await copyFile('src/simple/index.html', 'dist/public/simple.html');
await build({ entryPoints: ['src/server/index.ts'], outfile: 'dist/server/index.js', bundle: true, platform: 'node', format: 'esm', target: 'node22' });
await build({ entryPoints: ['src/server/cloudflare.ts'], outfile: 'dist/cloudflare/worker.js', bundle: true, platform: 'browser', format: 'esm', target: 'es2022', loader: { '.html': 'text' }, plugins: [{ name: 'embedded-reader', setup(b) {
  b.onResolve({ filter: /\?raw$/ }, args => ({ path: new URL('../dist/public/simple.js', import.meta.url).pathname, namespace: 'reader-text' }));
  b.onLoad({ filter: /.*/, namespace: 'reader-text' }, async args => ({ contents: await readFile(args.path, 'utf8'), loader: 'text' }));
} }] });
console.log('Built one reader for local Node and Cloudflare Workers.');
