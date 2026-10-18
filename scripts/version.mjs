// Writes dist/version.json so a deployed site can be checked against the release that was uploaded.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
const dist = new URL('../dist/', import.meta.url).pathname;
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
const files = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : files.push(p); } })(dist);
const h = createHash('sha256');
for (const f of files.sort()) { if (f.endsWith('version.json')) continue; h.update(relative(dist, f)); h.update(readFileSync(f)); }
const out = { name: pkg.name, version: pkg.version, builtAt: new Date().toISOString(), contentHash: h.digest('hex').slice(0, 16), files: files.length };
writeFileSync(join(dist, 'version.json'), JSON.stringify(out, null, 2) + '\n');
console.log('version.json', out);
