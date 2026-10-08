import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'vite';
import { resolve } from 'node:path';
import { deliveryFixture } from './delivery-fixtures.mjs';
import { signed, message, hash } from './fixtures.mjs';

const built = await build({
  configFile: false,
  logLevel: 'error',
  build: {
    write: false,
    minify: false,
    lib: { entry: resolve('test/account-membership/comparison-entry.ts'), formats: ['es'] },
  },
});
const client = await import(
  'data:text/javascript;base64,' +
    Buffer.from(
      (Array.isArray(built) ? built[0] : built).output.find((v) => v.type === 'chunk').code,
    ).toString('base64')
);
async function fixture() {
  const x = await deliveryFixture('new'),
    base = x.f.f.base,
    initial = {
      successor: x.f.f.successor,
      certification: x.f.certification,
      continuations: [],
    },
    latest = { ...initial, continuations: [x.admission, x.certification] };
  const owner = (kind, proofs = initial) => ({
    source:
      kind === 'original'
        ? { kind, base, proofs }
        : { kind, authority: { base, ...initial }, proofs },
    participant: kind === 'original' ? x.f.context.existing : x.f.context.candidate,
    sign: async (bytes) => signed(x.f.keys[kind === 'original' ? 'existing' : 'new'], bytes),
  });
  const reply = (request, proofs = latest) => {
    const body = {
      v: 2,
      kind: 'membership-bootstrap',
      requestHash: hash(JSON.stringify(request)),
      base,
      proofs,
    };
    return {
      ...body,
      signature: signed(x.keys.authority, message('done/membership-bootstrap/v2', body)),
    };
  };
  return { x, base, initial, latest, owner, reply };
}
test('original and joined owners retain an invitation while authenticating newer membership', async () => {
  const f = await fixture();
  for (const kind of ['original', 'joined']) {
    const owner = f.owner(kind),
      { invitation } = await client.prepareMembershipInvitation(owner),
      current = f.owner(kind, f.latest);
    assert.equal(invitation.epoch, 3);
    assert.deepEqual(
      (await client.prepareMembershipInvitation(current, invitation)).invitation,
      invitation,
    );
    const url = new URL(client.membershipInvitationUrl('https://example.test:8443', invitation));
    assert.equal(url.pathname, '/private/account-enrollment.html');
    assert.equal(url.searchParams.get('workspace'), invitation.workspaceId);
    assert.deepEqual(JSON.parse(atob(url.searchParams.get('invitation'))), invitation);
    let lastNonce;
    const request = async (path, body) => {
      assert.equal(path, '/__account-setup/membership/bootstrap');
      assert.notEqual(body.nonce, lastNonce);
      lastNonce = body.nonce;
      return f.reply(body);
    };
    for (const custody of [undefined, current]) {
      const result = await client.bootstrapMembershipInvitation(
        f.base.pin,
        invitation,
        request,
        custody,
      );
      assert.equal(result.history.current.tip, 5);
    }
  }
});
test('invitation bootstrap refuses stale, wrong-owner, wrong-key and replayed signed responses', async () => {
  const f = await fixture(),
    owner = f.owner('joined'),
    { invitation } = await client.prepareMembershipInvitation(owner),
    current = f.owner('joined', f.latest);
  await assert.rejects(
    client.bootstrapMembershipInvitation(
      f.base.pin,
      invitation,
      async (_, body) => f.reply(body, f.initial),
      current,
    ),
  );
  await assert.rejects(client.prepareMembershipInvitation(f.owner('original'), invitation));
  await assert.rejects(
    client.prepareMembershipInvitation({
      ...owner,
      participant: { ...owner.participant, wPub: 'f1'.repeat(32) },
    }),
  );
  await assert.rejects(
    client.prepareMembershipInvitation({ ...owner, source: { kind: 'pending' } }),
  );
  await assert.rejects(
    client.bootstrapMembershipInvitation(
      f.base.pin,
      invitation,
      async (_, body) => f.reply({ ...body, nonce: 'f2'.repeat(32) }),
      current,
    ),
  );
});
