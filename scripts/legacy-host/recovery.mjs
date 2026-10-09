import { readFile, open } from 'node:fs/promises';
import { sha } from './assets.mjs';

export const hasFirstWrite = (inventory, id) =>
  inventory.local.some(([key]) => key === `preflight.sentinel.${id}`) ||
  inventory.databases.some(
    (db) =>
      db.name === 'preflight-worker-probe' &&
      db.stores.some((store) => store.rows.some(([key]) => key === id)),
  );

/** All authority stays outside this helper: it checks an actual external file against separate input. */
export async function savePacket(file, captured) {
  const bytes = Buffer.from(captured.bytes);
  if (sha(bytes) !== captured.digest) throw Error('capture-digest-mismatch');
  const handle = await open(file, 'wx', 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    bytes.fill(0);
    await handle.close();
  }
  return {
    digest: captured.digest,
    sourceDigest: captured.sourceDigest,
    origin: captured.origin,
    policy: captured.policy,
  };
}
export async function readPacket(file, binding) {
  const bytes = await readFile(file);
  if (bytes.length > 64 * 1024 * 1024 || sha(bytes) !== binding.digest) {
    bytes.fill(0);
    throw Error('saved-file-mismatch');
  }
  return bytes;
}

/** Conservative host census. Unknown source carriers are preserved, not added to a deletion allowlist. */
export function classifyCarriers(inventory) {
  const ancillary = new Set(['done.actor', 'done.device', 'done.sync', 'done.sync.last']);
  for (const [key] of inventory.local) {
    if (/^wss?:\/\//u.test(key)) return 'unsupported-carrier';
    if (key === 'done.sync') return 'remote-reconciliation-required';
    if (
      !ancillary.has(key) &&
      !/^done\.pending-update\.done\.[A-Za-z0-9_-]+\.(0|[1-9][0-9]*)$/u.test(key)
    )
      return 'unsupported-carrier';
  }
  if (inventory.databases.some((db) => db.name !== 'done')) return 'unsupported-carrier';
  return 'known-source-only';
}
