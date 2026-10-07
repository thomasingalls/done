/** Journal-inclusive private genesis proposal. No service admission or Account index writes. */
import { parseAuthorityPin } from '../../account-protocol/authority';
import {
  accountIdentifier,
  verifyPendingProof,
  pendingBytes,
} from '../../account-protocol/preparation';
import { parseDraft, draftDigest, digest, lp, unhex } from '../../account-protocol/recovery';
import {
  GENESIS_LIMIT,
  parseGenesis,
  genesisMessage,
  generationInfo,
  checkpointAAD,
  type GenesisCandidate,
} from '../../account-protocol/genesis';
import { sealGeneration, openGeneration } from '../account/generationWrap';
import { withRecoveryKeys } from '../account/recovery';
import type { PreparePromotionOptions } from './promotionOwner';
import { inspectPromotionUnderPermit } from './promotionPreparation';
import { withPromotionSlot, type SessionTask } from './writeSession';
import {
  readPromotion,
  withPromotionRoot,
  writePromotion,
  signPromotion,
  promotionPayload,
  type PromotionRecord,
} from './promotionRecord';
import type { LocalClaim } from './localGenesisRecord';
import type { CustodyRecord } from './custodyRecord';
import { claimScope } from './localGenesisRecord';
import { withRecoveryUnderPermit } from './custody';
import {
  openCredential,
  openEnvelope,
  hkdf,
  fields,
  hex,
  random,
  type Bytes,
} from './custodyCrypto';
import { cardAuthor } from './days';
import { replayRecovery } from './admissionDocument';
import { Y, genesisCoverage, genesisCoverageParts, sameDocState, type YDoc } from './yjs';

export interface PrepareGenesisOptions extends PreparePromotionOptions {
  recoveryCode: string;
}

export function actors(doc: YDoc, principal: string, signer: string): GenesisCandidate['actors'] {
  const meta = doc.getMap('meta');
  if (meta.get('schemaVersion') !== 4 || meta.has('actors'))
    throw Error('Genesis needs current actor schema');
  const result: GenesisCandidate['actors'] = [];
  for (const [key, value] of meta.entries()) {
    if (!key.startsWith('actor:')) continue;
    const id = key.slice(6),
      actor = value as { kind?: unknown; name?: unknown; color?: unknown } | null;
    if (
      !actor ||
      typeof actor.name !== 'string' ||
      typeof actor.color !== 'string' ||
      !(
        (id === principal && actor.kind === 'human') ||
        (id === 'system' && actor.kind === 'system')
      )
    )
      throw Error('Genesis cannot attest this actor');
    result.push({ id, kind: actor.kind as 'human' | 'system', credential: signer });
  }
  if (!result.length) throw Error('Genesis has no actor');
  for (const card of doc.getMap('cards').values()) {
    if (!(card instanceof Y.Map) || !result.some((a) => a.id === cardAuthor(card)))
      throw Error('Genesis card has unbound attribution');
  }
  return result.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
const checkpointKey = (key: Bytes, salt: string, workspace: string, subtle: SubtleCrypto) =>
  hkdf(
    key,
    unhex(salt, 16),
    fields('done/checkpoint/v1', workspace),
    { name: 'AES-GCM', length: 256 },
    ['encrypt', 'decrypt'],
    subtle,
  );
const preparedBytes = (marker: PromotionRecord) => {
  const { genesis: _genesis, ...rest } = marker;
  return promotionPayload({ ...rest, v: 1, stage: 'prepared' });
};

export const ownGenesisOptions = (input: PrepareGenesisOptions): PrepareGenesisOptions => {
  return {
    ...input,
    pin: parseAuthorityPin(input.pin),
    draft: parseDraft(input.draft),
    accountId: accountIdentifier(input.accountId),
    retryKey: accountIdentifier(input.retryKey),
    transport: { ...input.transport },
  };
};
interface VerifiedGenesis {
  task: SessionTask;
  claim: LocalClaim;
  record: CustodyRecord;
  marker: PromotionRecord;
  candidate: GenesisCandidate;
  root: Bytes;
  signer: CryptoKey;
  bootstrapSigner: CryptoKey;
  subtle: SubtleCrypto;
  parts: { sv: string; ds: string };
}
/** Internal lifetime only. Admission replaces pending observations with its exact offer/receipt protocol. */
export async function withVerifiedGenesis<T>(
  task: SessionTask,
  options: PrepareGenesisOptions,
  work: (verified: VerifiedGenesis) => Promise<T>,
  observe?: (marker: PromotionRecord) => Promise<void>,
): Promise<T> {
  const inspected = await inspectPromotionUnderPermit(task, options, options.code);
  const { claim, record, marker } = await readPromotion(task, options.slotId, options.code);
  if (!marker || marker.stage === 'reserved') throw Error('Genesis needs prepared promotion');
  const expectedDraft = await task.wait(() => draftDigest(options.draft));
  if (
    marker.account.accountId !== options.accountId ||
    marker.retryHash !==
      (await task.wait(() => digest(lp('done/promotion-attempt/v1', options.retryKey)))) ||
    JSON.stringify(marker.pin) !== JSON.stringify(options.pin) ||
    marker.account.confirmation!.draftDigest !== expectedDraft
  )
    throw Error('Genesis owner changed');
  for (const k of ['principalId', 'workspaceId', 'lineageId', 'authRoot'] as const)
    if (options.draft[k] !== inspected.context[k]) throw Error('Genesis recovery context changed');
  if (marker.v >= 3 && !observe) throw Error('Use the admission owner');
  if (observe && marker.v === 1) throw Error('Admission needs retained genesis');
  const current = async () => {
    if (observe) return observe(marker);
    const nonce = hex(random(32));
    const proof = await task.wait(() =>
      options.transport.inspect({
        retryKey: options.retryKey,
        accountId: options.accountId,
        nonce,
      }),
    );
    const state = await task.wait(() => verifyPendingProof(options.pin, nonce, proof));
    if (pendingBytes(state) !== pendingBytes(marker.account))
      throw Error('Genesis eligibility changed');
  };
  await current();
  const scope = claimScope(claim);
  return withPromotionRoot(task, claim, record, options.code, async (root, subtle) => {
    const device = await openCredential(scope, root, marker.credentials![0], subtle);
    const signer = await openCredential(scope, root, marker.credentials![1], subtle);
    const key = await openEnvelope(scope, root, record.envelope!, subtle);
    try {
      return await withRecoveryKeys(
        options.draft,
        options.recoveryCode,
        subtle,
        async (recovery, bootstrapSigner) =>
          withRecoveryUnderPermit(
            task,
            { ...scope, resolvePrincipal: () => scope.principalId },
            options.code,
            async (recovered) => {
              const doc = new Y.Doc({ gc: false });
              let snapshot: Bytes | undefined;
              try {
                task.step(() => replayRecovery(doc, recovered));
                const coverage: GenesisCandidate['coverage'] = {
                  derivation: 'yjs-13.6.31-snapshot-v1',
                  snapshot: hex(genesisCoverage(doc)),
                  heads: [],
                };
                const bindings = actors(doc, scope.principalId, marker.credentialIds[1]);
                const base = {
                  v: 1 as const,
                  kind: 'promotion-genesis-candidate' as const,
                  preparation: hex(
                    new Uint8Array(await subtle.digest('SHA-256', preparedBytes(marker))),
                  ),
                  accountId: options.accountId,
                  ...inspected.context,
                  generation: 1 as const,
                  proposedEpoch: 1 as const,
                  signer: marker.credentialIds[1],
                  actors: bindings,
                  coverage,
                };
                const recipients = [
                  {
                    recipient: 'device' as const,
                    id: marker.credentialIds[0],
                    publicKey: hex(marker.credentials![0].publicKey),
                  },
                  {
                    recipient: 'recovery' as const,
                    id: marker.account.confirmation!.recoveryId,
                    publicKey: options.draft.rPub,
                  },
                ];
                let candidate: GenesisCandidate;
                if (marker.v >= 2) candidate = parseGenesis(marker.genesis);
                else {
                  snapshot = new Uint8Array(Y.encodeStateAsUpdate(doc));
                  if (snapshot.length > GENESIS_LIMIT)
                    throw Error('Genesis checkpoint exceeds private preparation bound');
                  const salt = hex(random(16)),
                    nonce = hex(random(12));
                  const checkpoint = {
                    v: 1 as const,
                    salt,
                    nonce,
                    ct: hex(
                      new Uint8Array(
                        await subtle.encrypt(
                          {
                            name: 'AES-GCM',
                            iv: unhex(nonce, 12),
                            additionalData: checkpointAAD(base),
                            tagLength: 128,
                          },
                          await checkpointKey(key, salt, scope.workspaceId, subtle),
                          snapshot,
                        ),
                      ),
                    ),
                  };
                  const wraps: GenesisCandidate['wraps'] = [];
                  for (const recipient of recipients)
                    wraps.push({
                      ...recipient,
                      ...(await sealGeneration(
                        unhex(recipient.publicKey, 32),
                        generationInfo(base),
                        key,
                        subtle,
                      )),
                    });
                  candidate = parseGenesis({
                    ...base,
                    checkpoint,
                    wraps,
                    signature: '00'.repeat(64),
                  });
                  candidate.signature = hex(
                    new Uint8Array(
                      await subtle.sign('Ed25519', signer, await genesisMessage(candidate, subtle)),
                    ),
                  );
                }
                // Re-derive the entire unsigned context. No digest/signature alone proves replay coverage.
                for (const field of Object.keys(base) as (keyof typeof base)[])
                  if (JSON.stringify(candidate[field]) !== JSON.stringify(base[field]))
                    throw Error('Genesis source or coverage changed');
                const verify = await subtle.importKey(
                  'raw',
                  marker.credentials![1].publicKey,
                  'Ed25519',
                  false,
                  ['verify'],
                );
                if (
                  !(await subtle.verify(
                    'Ed25519',
                    verify,
                    unhex(candidate.signature, 64),
                    await genesisMessage(candidate, subtle),
                  ))
                )
                  throw Error('Genesis signature invalid');
                for (const [i, expected] of recipients.entries()) {
                  const wrap = candidate.wraps[i]!;
                  for (const k of ['recipient', 'id', 'publicKey'] as const)
                    if (wrap[k] !== expected[k]) throw Error('Genesis recipient changed');
                  const opened = await openGeneration(
                    wrap,
                    i === 0 ? device : recovery,
                    unhex(expected.publicKey, 32),
                    generationInfo(base),
                    subtle,
                  );
                  try {
                    if (hex(opened) !== hex(key))
                      throw Error('Genesis wrap contains wrong generation');
                  } finally {
                    opened.fill(0);
                  }
                }
                const plaintext = new Uint8Array(
                  await subtle.decrypt(
                    {
                      name: 'AES-GCM',
                      iv: unhex(candidate.checkpoint.nonce, 12),
                      additionalData: checkpointAAD(base),
                      tagLength: 128,
                    },
                    await checkpointKey(key, candidate.checkpoint.salt, scope.workspaceId, subtle),
                    unhex(candidate.checkpoint.ct, candidate.checkpoint.ct.length / 2),
                  ),
                );
                const replay = new Y.Doc({ gc: false });
                try {
                  Y.applyUpdate(replay, plaintext);
                  if (
                    hex(genesisCoverage(replay)) !== coverage.snapshot ||
                    !sameDocState(doc, replay)
                  )
                    throw Error('Genesis checkpoint does not cover source');
                } finally {
                  plaintext.fill(0);
                  replay.destroy();
                }
                await current();
                let winning = marker;
                if (marker.v === 1) {
                  const next = await signPromotion(
                    root,
                    { ...marker, v: 2, stage: 'genesis-prepared', genesis: candidate },
                    subtle,
                  );
                  await writePromotion(task, claim, record, record, marker, next);
                  winning = next;
                }
                const parts = genesisCoverageParts(doc);
                return work({
                  task,
                  claim,
                  record,
                  marker: winning,
                  candidate: parseGenesis(candidate),
                  root,
                  signer,
                  bootstrapSigner,
                  subtle,
                  parts: { sv: hex(parts.sv), ds: hex(parts.ds) },
                });
              } finally {
                snapshot?.fill(0);
                doc.destroy();
              }
            },
          ),
      );
    } finally {
      key.fill(0);
    }
  });
}
export async function preparePromotionGenesis(
  input: PrepareGenesisOptions,
): Promise<GenesisCandidate> {
  const options = ownGenesisOptions(input);
  return withPromotionSlot(
    options.slotId,
    options.code,
    (task) => withVerifiedGenesis(task, options, async (v) => v.candidate),
    options.signal,
  );
}
