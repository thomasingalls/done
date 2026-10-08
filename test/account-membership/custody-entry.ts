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
