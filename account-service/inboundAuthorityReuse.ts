/** One sequential read group's verified header evidence. No request, grant or signing authority. */
import { serialize } from 'node:v8';
import type { AuthorityPin } from '../account-protocol/authority.ts';
import type { DeliveryAuthority, DeliveryIssuer, WorkspaceAuthoritySnapshot } from './delivery.ts';

export const INBOUND_AUTHORITY_CONTEXT_BYTES = 2 * 1024 * 1024;
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
): Promise<DeliveryAuthority> {
  if (!owner) return verify(snapshot, issuer);
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
  const current = () => {
    const next = context();
    try {
      if (!state.live || !next || !next.equals(captured!))
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
      if (!state.live) throw Error('Read authority owner changed');
      return authority;
    }
    const previous = state.entry;
    if (previous?.context.equals(captured) && previous.verify === verify) {
      for (const check of previous.checks)
        issuer.check(structuredClone(check.seal), check.id, check.publicKey);
      current();
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
      state.entry = { context: captured, authority: copyAuthority(authority), checks, verify };
      retained = true;
    }
    return authority;
  } catch (cause) {
    clear(state);
    throw cause;
  } finally {
    state.checking = false;
    if (!retained) captured?.fill(0);
  }
}
