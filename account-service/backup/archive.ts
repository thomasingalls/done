/** Standard tar -> gzip -> age. No plaintext archive and no decryption identity are needed. */
import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { BACKUP_FILES, fileDigest } from './snapshot.ts';
import { pack } from 'tar-stream';

export async function encryptSnapshot(
  directory: string,
  output: string,
  recipient: string,
  signal: AbortSignal,
) {
  if (!/^age1[0-9a-z]{58}$/.test(recipient)) throw Error('Backup needs one X25519 age recipient');
  // Build only the fixed recovery files. System tar on macOS can add AppleDouble/xattr entries.
  const tar = pack();
  const age = spawn('age', ['--encrypt', '--recipient', recipient], {
    signal,
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  const ended = new Promise<void>((accept, reject) => {
    age.once('error', () => reject(Error('Backup archive/encryption process failed')));
    age.once('exit', (code) =>
      code === 0 ? accept() : reject(Error('Backup archive/encryption process failed')),
    );
  });
  const operations = [
    ended,
    pipeline(tar, createGzip(), age.stdin!, { signal }),
    pipeline(age.stdout!, createWriteStream(output, { flags: 'wx', mode: 0o600 }), { signal }),
    (async () => {
      for (const name of BACKUP_FILES) {
        const path = join(directory, name);
        const s = lstatSync(path);
        if (!s.isFile()) throw Error('Invalid backup archive input');
        await pipeline(
          createReadStream(path),
          tar.entry({ name, size: s.size, mode: 0o600, type: 'file' }),
          { signal },
        );
      }
      tar.finalize();
    })(),
  ];
  try {
    await Promise.all(operations);
  } catch (cause) {
    tar.destroy();
    age.kill('SIGKILL');
    await Promise.allSettled(operations);
    throw cause;
  }
  return fileDigest(output);
}
