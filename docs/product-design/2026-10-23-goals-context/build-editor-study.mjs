import { build } from 'vite';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const study = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(study, '../../..');
const inputs = new Map();
const licenses = new Map();
await build({
  configFile: false,
  root: repo,
  publicDir: false,
  plugins: [
    {
      name: 'design-source-record',
      generateBundle(_, bundle) {
        for (const chunk of Object.values(bundle))
          if (chunk.type === 'chunk')
            for (const id of Object.keys(chunk.modules)) {
              if (!existsSync(id)) continue;
              const body = readFileSync(id);
              const relative = id.startsWith(repo + '/')
                ? id.slice(repo.length + 1)
                : id.includes('/node_modules/')
                  ? 'node_modules/' + id.split('/node_modules/').at(-1)
                  : path.basename(id);
              inputs.set(relative, {
                sha256: createHash('sha256').update(body).digest('hex'),
                bytes: body.length,
              });
              if (!id.includes('/node_modules/')) continue;
              let at = path.dirname(id);
              while (at !== path.dirname(at)) {
                if (existsSync(path.join(at, 'package.json'))) {
                  const metadata = JSON.parse(readFileSync(path.join(at, 'package.json'), 'utf8'));
                  for (const name of [
                    'LICENSE',
                    'LICENSE.md',
                    'LICENSE.txt',
                    'LICENSE-MIT',
                    'license',
                    'license.md',
                  ])
                    if (existsSync(path.join(at, name))) {
                      licenses.set(
                        metadata.name + '@' + metadata.version,
                        readFileSync(path.join(at, name), 'utf8'),
                      );
                      break;
                    }
                  break;
                }
                at = path.dirname(at);
              }
            }
      },
    },
  ],
  build: {
    outDir: path.join(study, 'editor-assets'),
    emptyOutDir: true,
    minify: true,
    sourcemap: false,
    lib: {
      entry: path.join(study, 'editor-study.ts'),
      formats: ['es'],
      fileName: 'editor-study',
      cssFileName: 'editor-study',
    },
    rolldownOptions: {
      output: {
        codeSplitting: false,
        entryFileNames: 'editor-study.js',
        assetFileNames: 'editor-study.[ext]',
      },
    },
  },
});
writeFileSync(
  path.join(study, 'editor-assets', 'source-inputs.json'),
  JSON.stringify(Object.fromEntries([...inputs].sort()), null, 2) + '\n',
);
writeFileSync(
  path.join(study, 'editor-assets', 'vendor-licenses.txt'),
  [...licenses]
    .sort()
    .map(([name, body]) => '=== ' + name + ' ===\n\n' + body)
    .join('\n\n'),
);
console.log(
  'Retained ' +
    inputs.size +
    ' bundled module identities and ' +
    licenses.size +
    ' package license texts.',
);

const styleInputs = {};
for (const name of [
  'index.css',
  'reset.css',
  'tokens.css',
  'shell.css',
  'cards.css',
  'markdown.css',
  'theme.css',
  'local-startup.css',
]) {
  const body = readFileSync(path.join(repo, 'src/styles', name));
  styleInputs['src/styles/' + name] = {
    sha256: createHash('sha256').update(body).digest('hex'),
    bytes: body.length,
  };
}
writeFileSync(
  path.join(study, 'editor-assets', 'style-inputs.json'),
  JSON.stringify(styleInputs, null, 2) + '\n',
);
