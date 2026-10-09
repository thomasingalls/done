/** Standard tar -> gzip -> age. No plaintext archive and no decryption identity are needed. */
import { spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { BACKUP_FILES, fileDigest } from './snapshot.ts';

export async function encryptSnapshot(
  directory: string,
  output: string,
  recipient: string,
  signal: AbortSignal,
) {
  if (!/^age1[0-9a-z]{58}$/.test(recipient)) throw Error('Backup needs one X25519 age recipient');
  const options = { stdio: ['ignore', 'pipe', 'ignore'] as ['ignore', 'pipe', 'ignore'], signal };
  const tar = spawn('tar', ['-cf', '-', '-C', directory, ...BACKUP_FILES], options);
  const age = spawn('age', ['--encrypt', '--recipient', recipient], {
    ...options,
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  const ended = (child: ChildProcess) =>
    new Promise<void>((accept, reject) => {
      child.once('error', () => reject(Error('Backup archive/encryption process failed')));
      child.once('exit', (code) =>
        code === 0 ? accept() : reject(Error('Backup archive/encryption process failed')),
      );
    });
  const operations = [
    ended(tar),
    ended(age),
    pipeline(tar.stdout!, createGzip(), age.stdin!, { signal }),
    pipeline(age.stdout!, createWriteStream(output, { flags: 'wx', mode: 0o600 }), { signal }),
  ];
  try {
    await Promise.all(operations);
  } catch (cause) {
    tar.kill('SIGKILL');
    age.kill('SIGKILL');
    await Promise.allSettled(operations);
    throw cause;
  }
  return fileDigest(output);
}
