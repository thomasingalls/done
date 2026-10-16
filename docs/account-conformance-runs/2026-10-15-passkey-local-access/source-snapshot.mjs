import fs from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { createHash } from 'node:crypto';
const source = process.cwd();
const target = '/private/tmp/done-passkey-access-checkout';
fs.mkdirSync(target, { recursive: false });
for (const directory of ['src', 'account-protocol', 'account-service', 'scripts', 'test', 'wasm', 'private', 'public', 'vite', 'relay'])
  fs.cpSync(join(source, directory), join(target, directory), { recursive: true, filter: path => !path.includes('/node_modules') });
for (const entry of fs.readdirSync(source, { withFileTypes: true }))
  if (entry.isFile() && /\.(?:json|yaml|mjs|ts|html|css)$/.test(entry.name)) fs.copyFileSync(join(source, entry.name), join(target, entry.name));
fs.symlinkSync(join(source, 'node_modules'), join(target, 'node_modules'));
fs.cpSync('/private/tmp/done-passkey-access-candidate-build-2', join(target, 'dist'), { recursive: true });
const pins = [];
function visit(path) {
  for (const entry of fs.readdirSync(path, { withFileTypes: true })) {
    const file = join(path, entry.name);
    if (entry.isDirectory()) visit(file);
    else if (entry.isFile()) pins.push({ path: relative(target, file), sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex') });
  }
}
for (const directory of ['src', 'account-protocol', 'account-service', 'scripts', 'test', 'wasm', 'private', 'public', 'vite', 'dist']) visit(join(target, directory));
fs.writeFileSync('/private/tmp/done-passkey-access-source-pins.json', JSON.stringify(pins, null, 2) + '\n');
console.log(JSON.stringify({ target, pinnedFiles: pins.length, sourceDigest: createHash('sha256').update(JSON.stringify(pins)).digest('hex') }));
