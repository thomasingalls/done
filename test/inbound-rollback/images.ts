/** Exact bytes extracted from the identified local images; never an app import. */
import { readFileSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
export function imageArtifact(root: string, writer: 0 | 1) {
  if (!isAbsolute(root)) throw Error('Expected absolute image evidence root');
  const manifest = JSON.parse(
    readFileSync(resolve(root, `430-writer-${writer}-assets.json`), 'utf8'),
  ) as {
    imageId: string;
    platform: string;
    build: string;
    rangeWriter: string;
    assets: { path: string; bytes: number; sha256: string }[];
  };
  if (
    !/^sha256:[0-9a-f]{64}$/.test(manifest.imageId) ||
    manifest.platform !== 'linux/arm64' ||
    manifest.rangeWriter !== String(writer)
  )
    throw Error('Expected identified ARM64 writer profile');
  const files = new Map<string, Buffer>();
  for (const entry of manifest.assets) {
    const value = readFileSync(resolve(manifest.build, entry.path));
    if (
      value.length !== entry.bytes ||
      createHash('sha256').update(value).digest('hex') !== entry.sha256
    )
      throw Error('Image asset bytes changed');
    files.set('/' + entry.path, value);
  }
  return { ...manifest, name: `image-writer-${writer}`, files };
}
