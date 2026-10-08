import { createCipheriv, hkdfSync } from 'node:crypto';
import { membershipRotationFixture } from './rotation-fixtures.mjs';
import { signed, hash } from './fixtures.mjs';
import { lp, bindingFields } from '../account-first-authority/oracle.mjs';
import { head, response } from '../account-decisions/oracle.mjs';
import { verifyMembershipRotation, membershipState } from '../../account-protocol/membership.ts';
import { client } from './replacement-checkpoint-client.mjs';
const hex = (v) => Buffer.from(v).toString('hex'),
  zero = '00'.repeat(32);
const u32 = (n) => {
  const v = Buffer.alloc(4);
  v.writeUInt32BE(n);
  return v;
};
const json = (v) => new Uint8Array(Buffer.from(JSON.stringify(v)));
const seal = (key, nonce, aad, plain) => {
  const c = createCipheriv('aes-256-gcm', Buffer.from(key), Buffer.from(nonce, 'hex'));
  c.setAAD(aad);
  return Buffer.concat([c.update(plain), c.final(), c.getAuthTag()]);
};
export async function sourceFixture({
  wrongCut = false,
  pending = false,
  pendingTarget = false,
} = {}) {
  const root = new client.Y.Doc({ gc: false });
  root.clientID = 1000;
  root.getMap('meta').set('schemaVersion', 4);
  root
    .getMap('meta')
    .set('actor:' + '11'.repeat(16), { kind: 'human', name: 'Writer', color: 'blue' });
  root.getText('master').insert(0, 'baseline\n');
  const key1 = new Uint8Array(32).fill(41),
    key2 = new Uint8Array(32).fill(42);
  const salt = '66'.repeat(16),
    nonce = '67'.repeat(12),
    workspace = '22'.repeat(16);
  const parts = client.genesisCoverageParts(root);
  const genesis = {
    checkpoint: {
      v: 1,
      salt,
      nonce,
      ct: hex(
        seal(
          hkdfSync(
            'sha256',
            key1,
            Buffer.from(salt, 'hex'),
            lp('done/checkpoint/v1', workspace),
            32,
          ),
          nonce,
          lp('done/cp/v1', '1', workspace, '1', '1'),
          client.Y.encodeStateAsUpdate(root),
        ),
      ),
    },
    snapshot: hex(client.genesisCoverage(root)),
    sv: hex(parts.sv),
    ds: hex(parts.ds),
  };
  const x = await membershipRotationFixture(pendingTarget, false, { genesis });
  const a = { base: x.f.f.base, successor: x.f.f.successor, certification: x.f.certification };
  const fixed = x.f.f,
    binding = {
      v: 1,
      kind: 'promotion-slot-binding',
      requestDigest: fixed.receipt.offer.epoch.requestDigest,
      epochHead: fixed.receipt.offer.head,
      stored: {
        binding: fixed.binding,
        bindingSignature: signed(fixed.keys.authority, lp(...bindingFields(fixed.binding))),
      },
    };
  const checkpoint = await client.createContentCheckpoint(root, key1, a, binding, async (b) =>
    signed(x.f.keys.existing, b),
  );
  const survivor = new client.Y.Doc({ gc: false }),
    removed = new client.Y.Doc({ gc: false });
  survivor.clientID = 1001;
  removed.clientID = 1002;
  for (const d of [survivor, removed]) client.Y.applyUpdate(d, client.Y.encodeStateAsUpdate(root));
  const before = client.Y.encodeStateVector(root);
  survivor.getText('master').insert(survivor.getText('master').length, 'survivor accepted\n');
  // This variant deliberately omits an external dependency from every accepted stream.
  if (pending) {
    const remote = new client.Y.Doc({ gc: false });
    remote.clientID = 1003;
    remote.getText('master').insert(0, 'missing dependency');
    const sv = client.Y.encodeStateVector(remote);
    remote.getText('master').insert(remote.getText('master').length, ' dependent edit');
    client.Y.applyUpdate(survivor, client.Y.encodeStateAsUpdate(remote, sv));
    remote.destroy();
  }
  removed.getText('master').delete(0, 4);
  removed.getText('master').insert(removed.getText('master').length, 'removed accepted\n');
  const entry = (publisher, signing, update, nonceByte, options = {}) => {
    const epoch = options.epoch ?? x.p.epoch,
      generation = options.generation ?? 1,
      position = options.position ?? 1,
      previous = options.previous ?? zero;
    const header = ['2', workspace, publisher, String(epoch), String(generation), String(position)],
      n = Buffer.alloc(12, nonceByte),
      body = Buffer.concat([
        lp('done/env-body/v1', x.p.principalId, 'human'),
        u32(1),
        u32(update.length),
        update,
      ]),
      net = hkdfSync(
        'sha256',
        generation === 1 ? key1 : key2,
        Buffer.alloc(0),
        lp('done/envelope/v2', workspace, publisher, String(generation)),
        32,
      ),
      ct = seal(net, hex(n), lp('done/env/v2', ...header), body),
      digest = hash(ct),
      signature = signed(signing, lp('done/env-sig/v2', ...header, hex(n), digest)),
      envelope = Buffer.concat([
        lp('done/envelope-wire/v2', ...header),
        n,
        Buffer.from(digest, 'hex'),
        u32(ct.length),
        ct,
        Buffer.from(signature, 'hex'),
      ]),
      subject = { workspace, credential: publisher, position, epoch, digest },
      accepted = head(subject, previous, epoch, fixed.keys.acceptance),
      proof = response({ kind: 'accepted', head: accepted, leaf: { epoch, digest } });
    return { publisher, position, envelope, proof, link: accepted.link };
  };
  const entries = [
    entry(
      x.f.context.existing.id,
      x.f.keys.existing,
      client.Y.encodeStateAsUpdate(survivor, before),
      1,
    ),
    entry(x.f.context.candidate.id, x.f.keys.new, client.Y.encodeStateAsUpdate(removed, before), 2),
  ];
  const cutoff = entries
    .map((e) => ({
      credentialId: e.publisher,
      position: 1,
      link: wrongCut && e.publisher === x.target ? 'fa'.repeat(32) : e.link,
    }))
    .sort((a, b) => a.credentialId.localeCompare(b.credentialId));
  if (pendingTarget) cutoff.push({ credentialId: x.target, position: 0, link: zero });
  const rotation = x.rotate(
    x.request({ preparation: x.prep({ cutoff }), payload: { ...x.payload, cutoff } }),
  );
  const rotated = await verifyMembershipRotation(rotation, x.parent),
    admission = x.f.admit(membershipState(rotated), pendingTarget ? 'aa'.repeat(16) : undefined);
  const proofs = { ...x.proofs, continuations: [...x.proofs.continuations, rotation, admission] };
  const { history } = await client.verifyMembershipChain(proofs, a.base);
  const parent = client.historyMembership(history),
    candidate = admission.epoch.preparation.context.candidate.credentialId;
  const input = {
    authority: a,
    checkpoint,
    history,
    producer: x.f.context.existing.id,
    candidate,
    keys: new Map([
      [1, key1],
      [2, key2],
    ]),
    lifetime: { assertCurrent() {}, now: () => 1000 },
  };
  const packet = (
    entry,
    through = 1,
    selected = history,
    reader = input.producer,
    signing = x.f.keys.existing,
  ) => {
    const r = [
        'done/private-read/v2',
        2,
        x.p.pin.serviceId,
        x.p.pin.origin,
        workspace,
        reader,
        entry.publisher,
        x.p.lineageId,
        selected.current.head,
        selected.current.tip,
        entry.position - 1,
        1,
        '45'.repeat(32),
        30000,
      ],
      request = json([...r, signed(signing, json(r))]),
      p = [
        'done/private-read-page/v2',
        2,
        hash(request),
        through,
        entry.position,
        [[hex(entry.envelope), hex(entry.proof)]],
      ];
    return { request, page: json([...p, signed(fixed.keys.acceptance, json(p))]) };
  };
  return {
    x,
    rotated,
    admission,
    proofs,
    entry,
    parent,
    root,
    survivor,
    removed,
    input,
    key2,
    entries,
    packet,
    sign: async (b) => signed(x.f.keys.existing, b),
    cleanup() {
      for (const d of [root, survivor, removed]) d.destroy();
      key1.fill(0);
      key2.fill(0);
    },
  };
}
