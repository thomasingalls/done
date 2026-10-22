/** Verified header evidence for read groups and bounded core reuse. No request or grant authority. */
import { serialize } from 'node:v8';
import { createHash } from 'node:crypto';
import type { AuthorityPin } from '../account-protocol/authority.ts';
import type { DeliveryAuthority, DeliveryIssuer, WorkspaceAuthoritySnapshot } from './delivery.ts';

export const INBOUND_AUTHORITY_CONTEXT_BYTES = 2 * 1024 * 1024;
export const INBOUND_AUTHORITY_CACHE_ENTRIES = 128;
export const INBOUND_AUTHORITY_CACHE_BYTES = 16 * 1024 * 1024;
interface Check {
  seal: unknown;
  id: string;
  publicKey: string;
}
type VerifyAuthority = (
  snapshot: WorkspaceAuthoritySnapshot,
  issuer: Pick<DeliveryIssuer, 'pin' | 'check'>,
) => Promise<DeliveryAuthority>;
interface Entry {
  context: Buffer;
  authority: DeliveryAuthority;
  checks: Check[];
  verify: VerifyAuthority;
}
interface State {
  live: boolean;
  checking: boolean;
  entry?: Entry;
}
interface CacheState {
  live: boolean;
  revision: number;
  bytes: number;
  entries: Map<string, { entry: Entry; charge: number }>;
}
/** Core-private verified evidence; requests, grants and transaction authority are never retained. */
export interface InboundAuthorityCache {
  clear(): void;
  close(): void;
}
const caches = new WeakMap<InboundAuthorityCache, CacheState>();
const remove = (cache: CacheState, key: string) => {
  const old = cache.entries.get(key);
  if (!old) return;
  old.entry.context.fill(0);
  cache.bytes -= old.charge;
  cache.entries.delete(key);
};
export function createInboundAuthorityCache(): InboundAuthorityCache {
  const state: CacheState = { live: true, revision: 0, bytes: 0, entries: new Map() };
  const owner = Object.freeze({
    clear() {
      state.revision++;
      for (const key of state.entries.keys()) remove(state, key);
    },
    close() {
      state.live = false;
      this.clear();
    },
  });
  caches.set(owner, state);
  return owner;
}
// Accounting bounds retained contexts and visible projections, not JavaScript heap overhead.
function charge(value: unknown, seen = new Set<object>()): number {
  if (typeof value === 'string') return 16 + value.length * 2;
  if (!value || typeof value !== 'object') return 16;
  if (seen.has(value)) return 0;
  seen.add(value);
  if (value instanceof Uint8Array) return 64 + value.byteLength;
  if (value instanceof Map) return 64 + [...value].reduce((n, pair) => n + charge(pair, seen), 0);
  if (value instanceof Set) return 64 + [...value].reduce((n, v) => n + charge(v, seen), 0);
  return 64 + Object.entries(value).reduce((n, [k, v]) => n + charge(k, seen) + charge(v, seen), 0);
}
export interface InboundAuthorityReuse {
  close(): void;
}
const owners = new WeakMap<InboundAuthorityReuse, State>();
const clear = (state: State) => {
  state.entry?.context.fill(0);
  delete state.entry;
};
export function createInboundAuthorityReuse(): InboundAuthorityReuse {
  const state: State = { live: true, checking: false };
  const owner = Object.freeze({
    close() {
      state.live = false;
      clear(state);
    },
  });
  owners.set(owner, state);
  return owner;
}
function copyAuthority(authority: DeliveryAuthority): DeliveryAuthority {
  // These immutable protocol values have private WeakMap/WeakSet identities.
  // Cloning their shape destroys the proof. Every mutable projection is detached.
  const { history, rotationParents, ...plain } = authority;
  return {
    ...structuredClone(plain),
    ...(history ? { history } : {}),
    ...(rotationParents ? { rotationParents: new Map(rotationParents) } : {}),
  };
}
export async function reuseInboundAuthority(
  owner: InboundAuthorityReuse | undefined,
  snapshot: WorkspaceAuthoritySnapshot,
  issuer: Pick<DeliveryIssuer, 'pin' | 'check'>,
  verify: VerifyAuthority,
  cacheOwner?: InboundAuthorityCache,
): Promise<DeliveryAuthority> {
  if (!owner && !cacheOwner) return verify(snapshot, issuer);
  const cache = cacheOwner && caches.get(cacheOwner);
  if (cacheOwner && !cache?.live) throw Error('Inactive read authority cache');
  const temporary = !owner ? createInboundAuthorityReuse() : undefined;
  owner ??= temporary!;
  const state = owners.get(owner);
  if (!state?.live || state.checking) throw Error('Inactive or overlapping read authority owner');
  state.checking = true;
  // Only decision rows are outside WorkspaceAuthoritySnapshot verification. Keep every
  // other native field, including witnesses, publisher and future header fields.
  const context = () => {
    try {
      // Process-local bytes only. JSON would collapse Maps, undefined and numeric distinctions.
      return serialize([issuer.pin, { ...snapshot, rows: undefined }]);
    } catch {
      return undefined;
    }
  };
  let captured: Buffer | undefined;
  let retained = false;
  let key: string | undefined;
  const revision = cache?.revision;
  const current = () => {
    const next = context();
    try {
      if (
        !state.live ||
        (cache && (!cache.live || cache.revision !== revision)) ||
        !next ||
        !next.equals(captured!)
      )
        throw Error('Read authority owner or input changed');
    } finally {
      next?.fill(0);
    }
  };
  try {
    captured = context();
    if (!captured) {
      clear(state);
      const authority = await verify(snapshot, issuer);
      if (!state.live || (cache && !cache.live)) throw Error('Read authority owner changed');
      return authority;
    }
    key = createHash('sha256').update(captured).digest('hex');
    const cached = cache?.entries.get(key);
    const previous = cache ? cached?.entry : state.entry;
    if (previous?.context.equals(captured) && previous.verify === verify) {
      for (const check of previous.checks)
        issuer.check(structuredClone(check.seal), check.id, check.publicKey);
      current();
      if (cached && cache?.entries.get(key) === cached) {
        cache.entries.delete(key);
        cache.entries.set(key, cached);
      }
      return copyAuthority(previous.authority);
    }
    clear(state);
    const checks: Check[] = [];
    const authority = await verify(snapshot, {
      pin: structuredClone(issuer.pin) as AuthorityPin,
      check: (seal, id, publicKey) => {
        issuer.check(seal, id, publicKey);
        checks.push({ seal: structuredClone(seal), id, publicKey });
      },
    });
    current();
    if (captured.byteLength <= INBOUND_AUTHORITY_CONTEXT_BYTES) {
      const entry = { context: captured, authority: copyAuthority(authority), checks, verify };
      if (cache) {
        const size = charge(entry);
        if (cache.revision === revision && size <= INBOUND_AUTHORITY_CACHE_BYTES) {
          remove(cache, key);
          while (
            cache.entries.size >= INBOUND_AUTHORITY_CACHE_ENTRIES ||
            cache.bytes + size > INBOUND_AUTHORITY_CACHE_BYTES
          )
            remove(cache, cache.entries.keys().next().value!);
          cache.entries.set(key, { entry, charge: size });
          cache.bytes += size;
          retained = true;
        }
      } else {
        state.entry = entry;
        retained = true;
      }
    }
    return authority;
  } catch (cause) {
    clear(state);
    if (cache && key) remove(cache, key);
    throw cause;
  } finally {
    state.checking = false;
    if (!retained) captured?.fill(0);
    temporary?.close();
  }
}
