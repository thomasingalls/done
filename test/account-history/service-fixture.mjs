import { sign, randomBytes } from 'node:crypto';
import { ready } from '../account-successor/service-fixtures.mjs';
import { authorityFixture } from '../account-authority/fixtures.mjs';
import { client as c } from './client.mjs';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  historyExchangeMessage,
  verifyHistoryCheckpointPage,
} from '../../account-protocol/historyExchange.ts';
const zero = '00'.repeat(32);
export async function setup(t, hook = () => {}) {
  const authority = authorityFixture(t);
  const options = {
    authority,
    sessions: { pin: authority.pin, operatorKey: authority.key },
    membershipContinuation: true,
    now: () => 1000,
    hook,
  };
  const x = await ready(t, options);
  const base = { pin: authority.pin, request: x.request, receipt: x.receipt };
  let membership = await c.verifyEarlyMembership(base),
    p = c.membershipState(membership);
  const doc = new c.Y.Doc({ gc: false });
  doc.getMap('meta').set('schemaVersion', 4);
  doc
    .getMap('meta')
    .set('actor:' + p.principalId, { kind: 'human', name: 'Writer', color: 'blue' });
  doc.getText('master').insert(0, 'first accepted text');
  const key = new Uint8Array(32).fill(71);
  t.after(() => {
    doc.destroy();
    key.fill(0);
  });
  const signer = async (bytes) => sign(null, bytes, x.s.privateKey).toString('hex');
  const makeRequest = async (action, payload, changes = {}) => {
    const r = {
      v: 1,
      kind: 'history-checkpoint-request',
      workspaceId: p.workspaceId,
      lineageId: p.lineageId,
      epoch: p.epoch,
      head: p.head,
      credentialId: x.credential,
      nonce: randomBytes(32).toString('hex'),
      expiresAt: 61000,
      action,
      payload,
      signature: zero.repeat(2),
      ...changes,
    };
    r.signature = await signer(await historyExchangeMessage(r));
    return r;
  };
  const exchange = async (r, authorize) =>
    authority.owner.exchangeHistoryCheckpoint(x.f.core, r, authorize);
  const check = async (r, result) => {
    assert.equal(result.ok, true, JSON.stringify(result));
    return verifyHistoryCheckpointPage(result.page, r, authority.pin);
  };
  const upload = async (position, tag) => {
    const w = x.make(position, tag, { updates: [new Uint8Array(c.Y.encodeStateAsUpdate(doc))] });
    const result = await x.call(w);
    assert.equal(result.kind, 'decision');
    const proof = JSON.parse(Buffer.from(result.bytes).toString());
    assert.equal(proof[2], 'accepted');
    return { credentialId: x.credential, position, link: proof[6] };
  };
  return {
    ...x,
    base,
    doc,
    key,
    signer,
    options,
    makeRequest,
    exchange,
    check,
    upload,
    get membership() {
      return membership;
    },
    get p() {
      return p;
    },
    async advance() {
      const prep = await x.prepare();
      const successor = await x.admit(prep.input);
      membership = await c.verifyEarlyMembership(base, successor);
      p = c.membershipState(membership);
      return successor;
    },
    create: (previous = null, heads = p.heads) =>
      c.createHistoryCheckpoint(doc, doc, key, membership, x.credential, heads, previous, signer),
    admit: (cp) => c.admitHistoryCheckpoint(cp, key, membership, x.credential, doc, signer),
    /** A snapshot of this writing plus `chars` more characters; the fixture's document is unchanged. */
    async sized(chars, previous = null, heads = p.heads) {
      const copy = new c.Y.Doc({ gc: false });
      // One writer identity, so sizes differ only by the characters added.
      copy.clientID = 1_000_000_000;
      try {
        c.Y.applyUpdate(copy, c.Y.encodeStateAsUpdate(doc));
        copy.getText('sized').insert(0, 'x'.repeat(chars));
        const cp = await c.createHistoryCheckpoint(
          copy,
          copy,
          key,
          membership,
          x.credential,
          heads,
          previous,
          signer,
        );
        const admission = await c.admitHistoryCheckpoint(
          cp,
          key,
          membership,
          x.credential,
          copy,
          signer,
        );
        return { cp, admission, hash: await c.historyCheckpointHash(cp) };
      } finally {
        copy.destroy();
      }
    },
    /**
     * Stores history rows as a build without the phase 544 install bound could have left them,
     * under a catalog this service's own issuer signs. Only emulates that earlier state.
     */
    async legacy(records, catalog) {
      const core = x.f.core,
        original = core.exchangeHistoryCheckpoint;
      let issuer;
      core.exchangeHistoryCheckpoint = function (input, captured) {
        issuer ??= captured;
        return original.call(this, input, captured);
      };
      try {
        await exchange(await makeRequest('read', 'catalog'));
      } finally {
        delete core.exchangeHistoryCheckpoint;
      }
      const signed = await issuer.catalog({
        v: 1,
        kind: 'history-checkpoint-catalog',
        workspaceId: p.workspaceId,
        lineageId: p.lineageId,
        sequence: 0,
        latest: zero,
        previous: zero,
        pending: zero,
        ...catalog,
        signature: zero.repeat(2),
      });
      const db = new DatabaseSync(x.f.path);
      try {
        for (const r of records)
          db.prepare('INSERT INTO history_checkpoint_records VALUES (?,?,?,?,?)').run(
            p.workspaceId,
            r.hash,
            r.cp.manifest.sequence,
            JSON.stringify(r.cp),
            r.admitted ? JSON.stringify(r.admission) : null,
          );
        db.prepare(
          'INSERT INTO history_checkpoint_catalog VALUES (?,?) ON CONFLICT(workspace_id) DO UPDATE SET value=excluded.value',
        ).run(p.workspaceId, JSON.stringify(signed));
      } finally {
        db.close();
      }
    },
  };
}
/** Characters past which `f.sized` exceeds the install bound: two probes fix the affine size. */
export async function largestInstallable(f) {
  const a = await f.sized(1_000_000),
    b = await f.sized(1_000_001);
  const slope = c.historyInstallBytes(b.cp) - c.historyInstallBytes(a.cp);
  assert.equal(slope, 3);
  return Math.floor(
    (c.HISTORY_INSTALL_LIMIT - (c.historyInstallBytes(a.cp) - slope * 1_000_000)) / slope,
  );
}
