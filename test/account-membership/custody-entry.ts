/** Disposable native probe; this module is never included in the application build. */
import { withMembershipVault } from '../../src/account/membershipVault';
import { withPromotionSlot, withJoinedSlot } from '../../src/crdt/writeSession';
import { readPromotion, withPromotionRoot } from '../../src/crdt/promotionRecord';
import { readJoinedAccount } from '../../src/crdt/joinedAccount';
import { claimScope } from '../../src/crdt/localGenesisRecord';
import { createApprovalVault } from '../../src/account/approvalVault';
import { beginLocalGenesis } from '../../src/crdt/localGenesis';
import { digest } from '../../account-protocol/recovery';
import { openDeviceRemovalVault } from '../../src/account/deviceRemovalVault';
import { NetworkLogin } from '../../src/account/networkLogin';
import { ScopedTransport } from '../../src/account/scopedTransport';
import { openEnvelope } from '../../src/crdt/custodyCrypto';
import { deriveJournalKey } from '../../src/crdt/journalCodec';
import { parseJournalEra } from '../../src/crdt/journalEra';
import { createJournalOwner } from '../../src/crdt/journalStore';
import { deriveStoreName } from '../../src/crdt/storeName';
import { makeSourceCapsule } from '../../src/crdt/sourceCapture';
import { verifyMembershipChain } from '../../account-protocol/membershipLocator';
import { openActiveRotation, eraseRotationKeys } from '../../src/crdt/rotationKeys';
import { historyGeneration, historyPublisher } from '../../account-protocol/admissionHistory';
import { Y } from '../../src/crdt/yjs';
const signal = () => new AbortController().signal;
const check = (value: unknown, message: string) => {
  if (!value) throw Error(message);
};
const bytes = () => new TextEncoder().encode('membership custody native probe');
type Kind = 'promotion' | 'joined';
export async function accountSlot() {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open('done.slots');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  try {
    return await new Promise<string>((resolve, reject) => {
      const r = db.transaction('slots').objectStore('slots').getAll();
      r.onsuccess = () => {
        const rows = r.result.filter((r) => r.account);
        if (rows.length !== 1) reject(Error('Expected one disposable account slot'));
        else resolve(rows[0].id);
      };
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}
async function snapshot(kind: Kind, slot: string, code: string) {
  const own = kind === 'promotion' ? withPromotionSlot : withJoinedSlot;
  return own(
    slot,
    code,
    async (task) => {
      const state =
        kind === 'promotion'
          ? await readPromotion(task, slot, code)
          : await readJoinedAccount(task, slot, code);
      return withPromotionRoot(task, state.claim, state.record, code, async (root, subtle) => {
        const credentials =
          kind === 'promotion'
            ? (state as Awaited<ReturnType<typeof readPromotion>>).marker!.credentials!
            : state.record.credentials!;
        const vault = await createApprovalVault({
          slotId: slot,
          scope: claimScope(state.claim),
          root,
          subtle,
          credentials,
          record: () => state.record,
          commit: async () => {
            throw Error('Read-only probe');
          },
        });
        const raw = (await vault.load()) as {
          kind?: string;
          previous?: unknown;
          current?: unknown;
        };
        return {
          counter: state.record.seal_reserved,
          previous: await digest(
            new TextEncoder().encode(
              JSON.stringify(raw?.kind === 'membership-progress' ? raw.previous : raw),
            ),
          ),
          current: raw?.kind === 'membership-progress' ? raw.current : null,
        };
      });
    },
    signal(),
  );
}
export async function exercise(kind: Kind, slot: string, code: string) {
  const before = await snapshot(kind, slot, code);
  let ownId = '';
  await withMembershipVault(kind, slot, code, signal(), async (owner) => {
    ownId = owner.participant.id;
    check((await owner.load()) === null, 'Unexpected new continuation');
    await owner.save({ v: 2, stage: 'saved' });
    let visits = 0,
      refused = false;
    try {
      await owner.save({ v: 2, stage: 'must-not-persist' }, () => {
        if (++visits === 2) throw Error('Interrupted after reservation');
      });
    } catch {
      refused = true;
    }
    check(refused && visits === 2, 'Missing interrupted native write');
    check(((await owner.load()) as { stage: string }).stage === 'saved', 'Lost old progress');
    const signature = await owner.sign(bytes());
    check(signature.length === 128, 'Signing key missing');
  });
  const after = await snapshot(kind, slot, code);
  check(before.previous === after.previous, 'Original ceremony changed');
  check(after.counter === before.counter + 2, 'Reservation did not commit exactly once');
  await withMembershipVault(kind, slot, code, signal(), async (owner) => {
    check(owner.participant.id === ownId, 'Device identity changed');
    check(((await owner.load()) as { stage: string }).stage === 'saved', 'Progress did not reopen');
  });
  return { originalPreserved: true, reopened: true };
}
export async function pending() {
  const slot = 'pending-custody-probe',
    enrollment = beginLocalGenesis(slot),
    code = enrollment.displayCode!;
  await enrollment.confirm(code);
  const participant = await withMembershipVault(
    'promotion',
    slot,
    code,
    signal(),
    async (owner) => {
      check(owner.source.kind === 'pending', 'Pending source misclassified');
      return owner.participant;
    },
  );
  return { slot, code, participant };
}
export async function wrap(kind: Kind, slot: string, code: string, recipient: string) {
  return withMembershipVault(kind, slot, code, signal(), async (owner) => {
    check(owner.source.kind !== 'pending', 'Missing account source');
    const source = owner.source;
    const workspace =
      source.kind === 'original'
        ? source.base.request.candidate.workspaceId
        : source.kind === 'joined'
          ? source.authority.base.request.candidate.workspaceId
          : '';
    return owner.wrapContent(recipient, bytes(), workspace);
  });
}
export async function install(
  slot: string,
  code: string,
  wrap: { enc: string; ct: string },
  label: string,
) {
  const hash = await digest(new TextEncoder().encode(label));
  const seal = await withMembershipVault('promotion', slot, code, signal(), async (owner) => {
    const seal = await owner.sealIncoming(wrap, bytes(), hash);
    await owner.save({ label, seal });
    return seal;
  });
  return withMembershipVault('promotion', slot, code, signal(), async (owner) => {
    await owner.checkInstalled(seal, hash);
    let rejected = false;
    try {
      await owner.checkInstalled(seal, '00'.repeat(32));
    } catch {
      rejected = true;
    }
    check(rejected, 'Installed key lost its delivery binding');
    return owner.withInstalledKey(seal, hash, (key) => digest(key));
  });
}

export async function removal(
  kind: Kind,
  slot: string,
  code: string,
  target: string,
  loseReply = false,
) {
  return withMembershipVault(kind, slot, code, signal(), async (owner) => {
    const native = await openDeviceRemovalVault(owner, target, signal());
    const before = native.snapshot();
    const login = new NetworkLogin(native.base.pin, slot),
      grants = new ScopedTransport(native.base.pin, signal());
    try {
      const access = grants.bind({
        login,
        sign: owner.sign,
        scope: {
          kind: 'workspace',
          workspaceId: native.base.request.candidate.workspaceId,
          credentialId: owner.participant.id,
        },
      });
      const result = await owner.withLogin(
        login,
        {
          accountId: native.base.receipt.offer.epoch.accountId,
          credentialId: native.base.receipt.activation.context.credentialId,
        },
        () =>
          native.advance({
            ...access,
            fetch: async (path, init) => {
              const response = await access.fetch(path, init);
              if (loseReply && path.endsWith('/commit') && response.status === 200) {
                await response.body?.cancel();
                throw Error('Lost committed reply');
              }
              return response;
            },
          }),
      );
      const after = native.snapshot();
      const previous = await owner.load();
      let keyHash: string | null = null;
      if (after.key)
        keyHash = await owner.rotation.withInstalledKey(after.key, after.successor!.head, digest);
      return {
        result,
        before,
        after,
        keyHash,
        previousHash: await digest(new TextEncoder().encode(JSON.stringify(previous))),
      };
    } finally {
      grants.close();
      login.close();
    }
  });
}
export async function participant(kind: Kind, slot: string, code: string) {
  return withMembershipVault(kind, slot, code, signal(), async (owner) => owner.participant.id);
}

export async function interruptedRotationSave(kind: Kind, slot: string, code: string) {
  return withMembershipVault(kind, slot, code, signal(), async (owner) => {
    const before = await owner.rotation.load();
    let visits = 0;
    let failed = false;
    try {
      await owner.rotation.save(before, () => {
        if (++visits === 2) throw Error('Interrupted after durable nonce reservation');
      });
    } catch {
      failed = true;
    }
    check(failed && visits === 2, 'Missing interrupted rotation save');
    check(
      JSON.stringify(await owner.rotation.load()) === JSON.stringify(before),
      'Interrupted save changed progress',
    );
    return true;
  });
}

export async function activateRemoval(kind: Kind, slot: string, code: string, interrupt = false) {
  return withMembershipVault(kind, slot, code, signal(), async (owner) => {
    const put = IDBObjectStore.prototype.put;
    const previousHead = owner.rotation.activeRotation;
    let interrupted = false;
    if (interrupt)
      IDBObjectStore.prototype.put = function (value, ...args) {
        const r = put.call(this, value, ...args);
        if (value?.active_rotation && value.active_rotation !== previousHead) {
          interrupted = true;
          this.transaction.abort();
        }
        return r;
      };
    try {
      const result = await owner.activateRemoval();
      if (interrupt) throw Error('Missing interrupted activation');
      return result;
    } catch (cause) {
      if (interrupted) return { generation: 0, head: 'interrupted' };
      throw cause;
    } finally {
      IDBObjectStore.prototype.put = put;
    }
  });
}

export async function journalOnly(kind: Kind, slot: string, code: string) {
  const source = await withMembershipVault(kind, slot, code, signal(), async (owner) => ({
    source: owner.source,
    id: owner.participant.id,
  }));
  if (source.source.kind === 'pending' || !source.source.proofs) throw Error('Missing source');
  const base =
    source.source.kind === 'original' ? source.source.base : source.source.authority.base;
  const history = historyPublisher(
    (await verifyMembershipChain(source.source.proofs, base)).history,
    source.id,
  );
  const proofs = source.source.proofs;
  const doc = new Y.Doc();
  doc.getText('rotation-journal-probe').insert(0, 'Journal-only writing must survive rotation');
  const update = new Uint8Array(Y.encodeStateAsUpdate(doc));
  doc.destroy();
  const capsule = makeSourceCapsule(
    {
      workspace: history.current.workspace,
      credential: source.id,
      principal: history.principal,
      epoch: history.current.tip,
      generation: historyGeneration(history),
      history,
    },
    [{ kind: 'human', actor: history.principal, bytes: update }],
  );
  const own = kind === 'promotion' ? withPromotionSlot : withJoinedSlot;
  return own(
    slot,
    code,
    async (task) => {
      const state =
        kind === 'promotion'
          ? await readPromotion(task, slot, code)
          : await readJoinedAccount(task, slot, code);
      const scope = claimScope(state.claim);
      return withPromotionRoot(task, state.claim, state.record, code, async (root, subtle) => {
        const local = await openEnvelope(scope, root, state.record.envelope!, subtle);
        const active = await openActiveRotation(scope, root, state.record, subtle, proofs);
        const key = await deriveJournalKey(active?.key ?? local, scope.workspaceId, subtle);
        // Test-only injection of a crash-left journal entry into this disposable store. The
        // production owner authenticates this pointer before exposing its journal callback.
        const dbName = await deriveStoreName(scope.principalId, scope.workspaceId);
        const db = await new Promise<IDBDatabase>((yes, no) => {
          const r = indexedDB.open(dbName);
          r.onsuccess = () => yes(r.result);
          r.onerror = () => no(r.error);
        });
        const counter = await new Promise<any>((yes, no) => {
          const tx = db.transaction('meta'),
            r = tx.objectStore('meta').get('counter');
          tx.oncomplete = () => yes(r.result);
          tx.onabort = () => no(tx.error);
        }).finally(() => db.close());
        const binding =
          counter.v === 4
            ? {
                identity: {
                  ...scope,
                  storeId: state.record.store_id,
                  rootId: state.record.root_id,
                },
                intent: counter.intent,
                era: parseJournalEra(counter.baseline.journalEra),
              }
            : undefined;
        const journal = createJournalOwner(
          { ...scope, storeId: state.record.store_id, rootId: state.record.root_id },
          dbName,
          active?.generation ?? 1,
          key,
          new Map(),
          () => binding,
        );
        try {
          const receipt = journal.append(capsule);
          if (receipt.status !== 'journalled') throw Error('Probe journal refused');
          return receipt.key;
        } finally {
          journal.dispose();
          key.fill(0);
          local.fill(0);
          eraseRotationKeys(active);
          capsule.fill(0);
          update.fill(0);
        }
      });
    },
    signal(),
  );
}

export async function replacementWriting(kind: Kind, slot: string, code: string) {
  return withMembershipVault(kind, slot, code, signal(), async (owner) => {
    const p =
      (await owner.load()) as import('../../src/account/membershipConnection').MembershipConnection;
    const c = p.comparison!;
    check(!!c.replacement && !!c.content, 'Missing retained replacement');
    const end = p.latest!.continuations.findIndex((proof) => proof.head === c.parent);
    const { history } = await verifyMembershipChain(
      { ...p.latest!, continuations: p.latest!.continuations.slice(0, end + 1) },
      p.base!,
    );
    const { historyMembership } = await import('../../account-protocol/admissionHistory');
    const { replacementCheckpointHash } =
      await import('../../account-protocol/replacementCheckpoint');
    const { membershipDeliveryHash } = await import('../../account-protocol/membershipDelivery');
    const { openReplacementCheckpoint } = await import('../../src/crdt/replacementCheckpoint');
    const { exportEntries } = await import('../../src/crdt/export');
    const hash = await replacementCheckpointHash(c.replacement!);
    if (p.role === 'existing') return { hash, generation: c.replacement!.manifest.generation };
    return owner.withInstalledKey(
      c.content!.key!,
      await membershipDeliveryHash(c.content!.delivery),
      async (key) => {
        const doc = await openReplacementCheckpoint(c.replacement, key, historyMembership(history));
        try {
          return {
            hash,
            generation: c.replacement!.manifest.generation,
            writing: JSON.stringify(exportEntries(doc, doc.getText('master').toString())),
            journal: doc.getText('rotation-journal-probe').toString(),
          };
        } finally {
          doc.destroy();
        }
      },
    );
  });
}
export async function pendingSlot() {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open('done.slots');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  try {
    return await new Promise<string>((resolve, reject) => {
      const r = db.transaction('slots').objectStore('slots').getAll();
      r.onsuccess = () => {
        if (r.result.length !== 1) reject(Error('Expected one disposable pending slot'));
        else resolve(r.result[0].id);
      };
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}

/** History uses an independent authenticated field and the same durable nonce reservation. */
export async function historyProgress(kind: Kind, slot: string, code: string) {
  const { same } = await import('../../account-protocol/admission');
  const { withHistoryCustody } = await import('../../src/crdt/historyCustody');
  const { withAccountProgressCustody } = await import('../../src/crdt/accountProgressCustody');
  const { membershipState } = await import('../../account-protocol/membership');
  const own = kind === 'promotion' ? withPromotionSlot : withJoinedSlot;
  const before = await snapshot(kind, slot, code);
  const saved = await own(
    slot,
    code,
    (task) =>
      withHistoryCustody(task, kind, slot, code, async (owner) => {
        check((await owner.load()) === null, 'Unexpected retained history attempt');
        const p = membershipState(owner.authority);
        const progress = {
          v: 1 as const,
          kind: 'history-maintenance-progress' as const,
          workspaceId: p.workspaceId,
          lineageId: p.lineageId,
          credentialId: owner.credentialId,
          catalog: null,
          attempt: null,
          discard: null,
        };
        await owner.replace(null, progress);
        let refused = false;
        try {
          await owner.replace(null, progress);
        } catch {
          refused = true;
        }
        check(refused, 'Stale history compare-and-replace succeeded');
        refused = false;
        try {
          await owner.replace(progress, { ...progress, credentialId: 'ff'.repeat(16) });
        } catch {
          refused = true;
        }
        check(refused, 'History progress accepted another owner');
        return (await owner.load())!;
      }),
    signal(),
  );
  const after = await snapshot(kind, slot, code);
  check(
    before.previous === after.previous &&
      JSON.stringify(before.current) === JSON.stringify(after.current),
    'Enrollment progress changed',
  );
  check(after.counter === before.counter + 1, 'History reservation changed');
  await own(
    slot,
    code,
    (task) =>
      withAccountProgressCustody(task, kind, slot, code, 'history', async (owner) => {
        let keyAccess = false;
        try {
          await owner.vault.reserveSeals(1);
        } catch {
          keyAccess = true;
        }
        check(keyAccess, 'History progress acquired content-key storage authority');
        const ct = owner.state.record.history!.ct;
        check(
          !new TextDecoder().decode(ct).includes('history-maintenance-progress'),
          'Progress leaked plaintext',
        );
        let visits = 0,
          refused = false;
        try {
          await owner.vault.save({ ...saved, discard: 'aa'.repeat(32) }, () => {
            if (++visits === 2) throw Error('Interrupted after history nonce reservation');
          });
        } catch {
          refused = true;
        }
        check(refused && visits === 2, 'Missing interrupted history save');
        check(same(await owner.vault.load(), saved), 'Interrupted history write replaced progress');
      }),
    signal(),
  );
  await own(
    slot,
    code,
    (task) =>
      withHistoryCustody(task, kind, slot, code, async (owner) => {
        check(same(await owner.load(), saved), 'History did not reopen');
        await owner.replace(saved, { ...saved, discard: 'bb'.repeat(32) });
      }),
    signal(),
  );
  const final = await snapshot(kind, slot, code);
  check(final.counter === before.counter + 3, 'Interrupted history reservation was reused');
  check(
    final.previous === before.previous &&
      JSON.stringify(final.current) === JSON.stringify(before.current),
    'History overwrote enrollment',
  );
  return { isolated: true, reopened: true, interrupted: true, staleRefused: true };
}
