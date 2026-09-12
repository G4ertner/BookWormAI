import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('dist/public', { recursive: true });
await build({ entryPoints: ['src/server/index.ts'], outfile: 'dist/server/index.js', bundle: true, platform: 'node', format: 'esm', target: 'node22', sourcemap: true });
await build({ entryPoints: ['src/web/client.ts'], outfile: 'dist/public/client.js', bundle: true, platform: 'browser', format: 'esm', target: 'es2022', sourcemap: false });
await copyFile('src/web/index.html', 'dist/public/index.html');
await copyFile('src/web/styles.css', 'dist/public/styles.css');
console.log('Built the audio server and replaceable prototype client.');
