/** Closed, plaintext-free source removal manifest; its enclosing Local claim authenticates presence and progress. */
import {
  fields,
  hex,
  hkdf,
  openFactor,
  utf8,
  normalizeDeviceCode,
  guardedSubtle,
  type Bytes,
} from './custodyCrypto';
import type { LocalClaim } from './localGenesisRecord';
import type { SessionTask } from './writeSession';
import { stopStartup } from './startupState';

export interface LegacyCleanupRecord {
  v: 1;
  intentId: string;
  databaseDigest: string | null;
  entries: { key: string; digest: string }[];
  /** 0 authorizes database removal; n+1 authorizes entries[n]. Only that current effect may be absent before progress commits. */
  next: number;
}
const digest = (s: unknown): s is string => typeof s === 'string' && /^[a-f0-9]{64}$/u.test(s);
export const parseLegacyCleanup = (value: unknown): LegacyCleanupRecord => {
  const v = value as LegacyCleanupRecord | undefined;
  if (
    !v ||
    Object.keys(v).sort().join(',') !== 'databaseDigest,entries,intentId,next,v' ||
    v.v !== 1 ||
    typeof v.intentId !== 'string' ||
    !/^[a-f0-9]{32}$/u.test(v.intentId) ||
    (v.databaseDigest !== null && !digest(v.databaseDigest)) ||
    !Array.isArray(v.entries) ||
    v.entries.length > 4096 ||
    !Number.isSafeInteger(v.next) ||
    v.next < 0 ||
    v.next > v.entries.length + 1
  )
    stopStartup('repair-required', 'invalid-source-cleanup');
  const keys = new Set<string>();
  for (const e of v.entries) {
    if (
      !e ||
      Object.keys(e).sort().join(',') !== 'digest,key' ||
      !digest(e.digest) ||
      typeof e.key !== 'string' ||
      !(
        /^(done\.actor|done\.device|done\.sync|done\.sync\.last)$/u.test(e.key) ||
        /^done\.pending-update\.done\.[A-Za-z0-9_-]+\.(0|[1-9][0-9]*)$/u.test(e.key)
      ) ||
      e.key.length > 4096 ||
      keys.has(e.key)
    )
      stopStartup('repair-required', 'invalid-source-cleanup-entry');
    keys.add(e.key);
  }
  return {
    v: 1,
    intentId: v.intentId,
    databaseDigest: v.databaseDigest,
    entries: v.entries.map((e) => ({ ...e })),
    next: v.next,
  };
};
export const cleanupPayload = (r: LegacyCleanupRecord): string =>
  JSON.stringify([
    r.v,
    r.intentId,
    r.databaseDigest,
    r.entries.map((e) => [e.key, e.digest]),
    r.next,
  ]);
export const cleanupComplete = (r: LegacyCleanupRecord | undefined): boolean =>
  !!r && r.next === r.entries.length + 1;

/** Keyed comparisons avoid adding a per-value dictionary oracle to durable cleanup metadata. */
export const cleanupFingerprinter = async (
  task: SessionTask,
  claim: LocalClaim,
  code: string,
  intentId: string,
) => {
  let root: Bytes | undefined, factor: Bytes | undefined, key: CryptoKey | undefined;
  const subtle = guardedSubtle(() => task.step(() => {}));
  try {
    factor = utf8(normalizeDeviceCode(code));
    root = await task.wait(() =>
      openFactor(
        { principalId: claim.initial.principal_id, workspaceId: claim.initial.workspace_id },
        factor!,
        claim.initial.seals[0],
        subtle,
      ),
    );
    key = await task.wait(() =>
      hkdf(
        root!,
        new Uint8Array(),
        fields('done/legacy-cleanup-fingerprint/v1', hex(claim.initial.mac), intentId),
        { name: 'HMAC', hash: 'SHA-256', length: 256 },
        ['sign'],
        subtle,
      ),
    );
  } finally {
    root?.fill(0);
    factor?.fill(0);
  }
  return {
    async digest(kind: 'database' | 'local', value: unknown) {
      const bytes = fields('done/legacy-cleanup-entry/v1', kind, JSON.stringify(value));
      try {
        return hex(new Uint8Array(await task.wait(() => subtle.sign('HMAC', key!, bytes))));
      } finally {
        bytes.fill(0);
      }
    },
    dispose() {
      key = undefined;
    },
  };
};
