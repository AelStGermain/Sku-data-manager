import { readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const roots = ['js', 'api', 'scripts'];
const files = ['server.js', 'test_fb.mjs'];

for (const root of roots) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isFile() && ['.js', '.mjs', '.cjs'].includes(extname(entry.name))) {
      files.push(join(root, entry.name));
    }
  }
}

let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) failed = true;
}

if (failed) process.exit(1);
console.log(`Sintaxis validada: ${files.length} archivos.`);
