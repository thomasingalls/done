import {
  newCard,
  registerCard,
  ensureDay,
  collectionOf,
  cardsIn,
  cardAuthor,
  cardId,
  cardBody,
} from '../../src/crdt/days';
import { openTree } from '../../src/crdt/doc';
import { registerWorkspaceActor } from '../../src/crdt/actors';
export * from '../account-promotion/browser';
export { preparePromotionGenesis } from '../../src/crdt/promotionGenesis';
import { Y } from '../../src/crdt/yjs';
import { openJournalSession } from '../../src/crdt/custody';
import type { CustodyScope } from '../../src/crdt/custodyRecord';
import { withPromotionSlot } from '../../src/crdt/writeSession';
import {
  readPromotion,
  withPromotionRoot,
  signPromotion,
  writePromotion,
} from '../../src/crdt/promotionRecord';
import { claimScope } from '../../src/crdt/localGenesisRecord';
import {
  openEnvelope,
  openCredential,
  hkdf,
  fields,
  hex,
  random,
} from '../../src/crdt/custodyCrypto';
import { unhex } from '../../account-protocol/recovery';
import { genesisMessage, checkpointAAD, generationInfo } from '../../account-protocol/genesis';
import { sealGeneration } from '../../src/account/generationWrap';

export async function seed(
  scope: CustodyScope,
  code: string,
  ops: { insert: string; at: number; remove: number; disk: boolean }[],
  reverse = false,
  invalid = '',
) {
  const session = await openJournalSession(
    { ...scope, resolvePrincipal: () => scope.principalId },
    code,
  );
  const doc = new Y.Doc({ gc: false }),
    updates: { bytes: Uint8Array<ArrayBuffer>; disk: boolean }[] = [];
  try {
    const actor = registerWorkspaceActor(doc, {
      id: scope.principalId,
      actor: { kind: 'human', name: 'Private author', color: '#123456' },
      device: { id: 'test-device', name: 'fixture' },
    });
    const tree = openTree(doc, actor.origin);
    if (invalid === 'actor')
      tree.meta.set('actor:agent', { kind: 'agent', name: 'Other', color: '#123456' });
    const date = '2026-09-10',
      day = ensureDay(doc, actor.origin, date);
    for (const [id, author, text] of [
      [
        'retained-card-id',
        invalid === 'card' ? 'other' : 'system',
        'Imported card stays identical',
      ],
      ['human-card-id', scope.principalId, 'Human card stays identical'],
    ]) {
      registerCard(
        doc,
        id!,
        newCard(text!, author!, { id: id!, origin: 'master', createdAt: '2026-09-10T00:00:00Z' }),
        { date, section: 'next' },
      );
      collectionOf(day, 'next')!.push([id!]);
    }
    const master = doc.getText('master');
    master.insert(0, 'base');
    const initial = new Uint8Array(Y.encodeStateAsUpdate(doc));
    await session.appendBatch([{ kind: 'update', bytes: initial }]);
    doc.on('update', (update: Uint8Array) =>
      updates.push({ bytes: new Uint8Array(update), disk: false }),
    );
    for (const op of ops) {
      doc.transact(() => {
        const at = op.at % (master.length + 1);
        const count = Math.min(op.remove, master.length - at);
        if (count) master.delete(at, count);
        master.insert(at, op.insert);
        if (op.remove % 2) {
          const order = collectionOf(day, 'next')!;
          const ids = order.toArray();
          order.delete(0, ids.length);
          order.push(ids.reverse());
        }
      });
      if (updates.length) updates[updates.length - 1]!.disk = op.disk;
    }
    if (reverse) updates.reverse();
    for (const u of updates) {
      if (u.disk) await session.appendBatch([{ kind: 'update', bytes: u.bytes }]);
      else {
        const outcome = session.appendLocal(u.bytes);
        if (outcome.status !== 'journalled') throw Error(JSON.stringify(outcome));
      }
    }
    return { initial: [...initial], state: state(doc), update: [...Y.encodeStateAsUpdate(doc)] };
  } finally {
    doc.destroy();
    await session.close();
  }
}
function state(doc: Y.Doc) {
  // Force concrete root types before JSON; replay initially creates generic shared roots.
  doc.getMap('meta');
  doc.getText('master');
  doc.getMap('days');
  doc.getMap('cards');
  doc.getMap('cardLocations');
  return {
    json: doc.toJSON(),
    cards: cardsIn(doc, '2026-09-10', 'next').map((card) => ({
      id: cardId(card),
      author: cardAuthor(card),
      text: cardBody(card),
    })),
    coverage: [...Y.encodeSnapshot(Y.snapshot(doc))],
    pending: !!(doc.store.pendingStructs || doc.store.pendingDs),
  };
}
export function decode(update: number[]) {
  const doc = new Y.Doc({ gc: false });
  try {
    Y.applyUpdate(doc, new Uint8Array(update));
    return state(doc);
  } finally {
    doc.destroy();
  }
}
/** Test forgeries carry valid root MAC and signing credential: exercise semantics beyond authentication. */
export async function poison(slotId: string, code: string, kind: string, initial: number[]) {
  await withPromotionSlot(slotId, code, async (task) => {
    const { claim, record, marker } = await readPromotion(task, slotId, code);
    await withPromotionRoot(task, claim, record, code, async (root, subtle) => {
      const candidate = structuredClone(marker!.genesis!),
        scope = claimScope(claim);
      const key = await openEnvelope(scope, root, record.envelope!, subtle);
      try {
        if (kind === 'snapshot') {
          const salt = hex(random(16)),
            nonce = hex(random(12));
          const cpKey = await hkdf(
            key,
            unhex(salt, 16),
            fields('done/checkpoint/v1', scope.workspaceId),
            { name: 'AES-GCM', length: 256 },
            ['encrypt'],
            subtle,
          );
          candidate.checkpoint = {
            v: 1,
            salt,
            nonce,
            ct: hex(
              new Uint8Array(
                await subtle.encrypt(
                  {
                    name: 'AES-GCM',
                    iv: unhex(nonce, 12),
                    additionalData: checkpointAAD(candidate),
                  },
                  cpKey,
                  new Uint8Array(initial),
                ),
              ),
            ),
          };
        } else if (kind === 'wrap') {
          candidate.wraps[1] = {
            ...candidate.wraps[1]!,
            ...(await sealGeneration(
              unhex(candidate.wraps[1]!.publicKey, 32),
              generationInfo(candidate),
              new Uint8Array(32),
              subtle,
            )),
          };
        } else if (kind === 'coverage') candidate.coverage.snapshot = '0000';
        else if (kind === 'recipient') candidate.wraps[1]!.id = 'A'.repeat(43);
        else if (kind === 'actor')
          candidate.actors = candidate.actors.filter((a) => a.kind === 'human');
        const signer = await openCredential(scope, root, marker!.credentials![1], subtle);
        candidate.signature = hex(
          new Uint8Array(
            await subtle.sign('Ed25519', signer, await genesisMessage(candidate, subtle)),
          ),
        );
        const next = await signPromotion(root, { ...marker!, genesis: candidate }, subtle);
        await writePromotion(task, claim, record, record, marker, next);
      } finally {
        key.fill(0);
      }
    });
  });
}
