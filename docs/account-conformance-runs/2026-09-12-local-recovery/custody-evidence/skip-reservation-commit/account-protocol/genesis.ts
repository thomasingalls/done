/** Private proposal format. This is neither a certified epoch nor row 7's admitted manifest. */
import { closed, accountIdentifier } from './preparation.ts';
import { unhex, hex, lp } from './recovery.ts';

export const GENESIS_LIMIT = 16 * 1024 * 1024;
export interface GenesisCandidate {
  v: 1;
  kind: 'promotion-genesis-candidate';
  preparation: string;
  accountId: string;
  principalId: string;
  workspaceId: string;
  lineageId: string;
  authRoot: string;
  generation: 1;
  proposedEpoch: 1;
  signer: string;
  actors: { id: string; kind: 'human' | 'system'; credential: string }[];
  coverage: { derivation: 'yjs-13.6.31-snapshot-v1'; snapshot: string; heads: [] };
  checkpoint: { v: 1; salt: string; nonce: string; ct: string };
  wraps: {
    recipient: 'device' | 'recovery';
    id: string;
    publicKey: string;
    enc: string;
    ct: string;
  }[];
  signature: string;
}
const fixed = (v: unknown, n: number) => {
  unhex(v, n);
  return v as string;
};
const bounded = (v: unknown, min: number, max: number) => {
  if (
    typeof v !== 'string' ||
    v.length < 2 * min ||
    v.length > 2 * max ||
    v.length % 2 ||
    !/^[0-9a-f]+$/.test(v)
  )
    throw Error('Invalid genesis bytes');
  return v;
};
export function parseGenesis(input: unknown): GenesisCandidate {
  const c = closed(input, [
    'v',
    'kind',
    'preparation',
    'accountId',
    'principalId',
    'workspaceId',
    'lineageId',
    'authRoot',
    'generation',
    'proposedEpoch',
    'signer',
    'actors',
    'coverage',
    'checkpoint',
    'wraps',
    'signature',
  ]);
  if (
    c['v'] !== 1 ||
    c['kind'] !== 'promotion-genesis-candidate' ||
    c['generation'] !== 1 ||
    c['proposedEpoch'] !== 1
  )
    throw Error('Unsupported genesis');
  const principalId = fixed(c['principalId'], 16),
    signer = fixed(c['signer'], 16);
  if (!Array.isArray(c['actors']) || c['actors'].length < 1 || c['actors'].length > 2)
    throw Error('Invalid genesis actors');
  const actors = Array.from(c['actors']).map((value: unknown) => {
    const a = closed(value, ['id', 'kind', 'credential']);
    if (
      !(
        (a['id'] === principalId && a['kind'] === 'human') ||
        (a['id'] === 'system' && a['kind'] === 'system')
      ) ||
      a['credential'] !== signer
    )
      throw Error('Invalid genesis actor binding');
    return { id: a['id'] as string, kind: a['kind'] as 'human' | 'system', credential: signer };
  });
  if (actors.some((a, i) => i > 0 && actors[i - 1]!.id >= a.id))
    throw Error('Unordered genesis actors');
  const coverage = closed(c['coverage'], ['derivation', 'snapshot', 'heads']);
  if (
    coverage['derivation'] !== 'yjs-13.6.31-snapshot-v1' ||
    !Array.isArray(coverage['heads']) ||
    coverage['heads'].length !== 0
  )
    throw Error('Genesis has no accepted heads');
  const cp = closed(c['checkpoint'], ['v', 'salt', 'nonce', 'ct']);
  if (cp['v'] !== 1) throw Error('Unsupported checkpoint');
  if (!Array.isArray(c['wraps']) || c['wraps'].length !== 2)
    throw Error('Genesis needs exact recipients');
  const wraps = Array.from(c['wraps']).map((value: unknown, i: number) => {
    const w = closed(value, ['recipient', 'id', 'publicKey', 'enc', 'ct']);
    const recipient = i === 0 ? ('device' as const) : ('recovery' as const);
    if (w['recipient'] !== recipient) throw Error('Genesis recipient order changed');
    return {
      recipient,
      id: i === 0 ? fixed(w['id'], 16) : accountIdentifier(w['id']),
      publicKey: fixed(w['publicKey'], 32),
      enc: fixed(w['enc'], 32),
      ct: fixed(w['ct'], 48),
    };
  });
  return {
    v: 1,
    kind: 'promotion-genesis-candidate',
    preparation: fixed(c['preparation'], 32),
    accountId: accountIdentifier(c['accountId']),
    principalId,
    workspaceId: fixed(c['workspaceId'], 16),
    lineageId: fixed(c['lineageId'], 32),
    authRoot: fixed(c['authRoot'], 32),
    generation: 1,
    proposedEpoch: 1,
    signer,
    actors,
    coverage: {
      derivation: 'yjs-13.6.31-snapshot-v1',
      snapshot: bounded(coverage['snapshot'], 2, GENESIS_LIMIT),
      heads: [],
    },
    checkpoint: {
      v: 1,
      salt: fixed(cp['salt'], 16),
      nonce: fixed(cp['nonce'], 12),
      ct: bounded(cp['ct'], 18, GENESIS_LIMIT + 16),
    },
    wraps,
    signature: fixed(c['signature'], 64),
  };
}
/** Closed parser fixes property order. Hash the body so no LP field can exceed its u16 bound. */
export async function genesisMessage(input: GenesisCandidate, subtle = crypto.subtle) {
  const { signature: _signature, ...body } = parseGenesis(input);
  const digest = hex(
    new Uint8Array(await subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(body)))),
  );
  return lp('done/promotion-genesis-candidate/v1', digest);
}
export const generationInfo = (
  c: Pick<GenesisCandidate, 'workspaceId' | 'lineageId' | 'authRoot' | 'generation'>,
) => lp('done/gen-wrap/v1', c.workspaceId, c.lineageId, c.authRoot, String(c.generation));
export const checkpointAAD = (
  c: Pick<GenesisCandidate, 'workspaceId' | 'generation' | 'proposedEpoch'>,
) => lp('done/cp/v1', '1', c.workspaceId, String(c.generation), String(c.proposedEpoch));
