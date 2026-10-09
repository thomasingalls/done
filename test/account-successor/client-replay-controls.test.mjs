import test from 'node:test';
import assert from 'node:assert/strict';
import { sign, verify } from 'node:crypto';
import { adapters, clientFixture, json, hex } from './client-fixtures.mjs';
import { hash, lp } from './oracle.mjs';
const built = await adapters(),
  production = built.lib;
test.after(() => built.clear());
const live = { assertCurrent() {}, now: () => 1000 };
for (const control of ['issuance-boundary', 'publisher-binding'])
  test(`removing ${control} lets the real receiver return forbidden plaintext`, async (t) => {
    const changed = await adapters(control);
    t.after(() => changed.clear());
    const mutant = changed.lib,
      f = await clientFixture(production),
      history = await mutant.verifyAdmissionHistory(f.f.successor, f.f.base, f.f.held);
    let context, packet;
    if (control === 'issuance-boundary') {
      context = {
        ...f.context,
        prefix: { position: 1, link: f.entries[0].link, observedThrough: 1 },
      };
      packet = f.packet(2, 2, f.proof(2, 1));
    } else {
      context = {
        ...f.context,
        publisher: { ...f.context.publisher, publicKey: f.f.context.candidate.sPub },
      };
      packet = f.packet(1, 2);
      const envelope = f.entries[0].envelope.slice(),
        subject = f.entries[0].subject,
        fields = ['2', subject.workspace, subject.credential, '1', '1', '1'],
        signatureMessage = lp('done/env-sig/v2', ...fields, '01'.repeat(12), subject.digest),
        signature = sign(null, signatureMessage, f.f.nextKey);
      assert(verify(null, signatureMessage, f.f.nextKey, signature));
      envelope.set(signature, envelope.length - 64);
      const page = JSON.parse(Buffer.from(packet.page));
      page.pop();
      page[5][0][0] = hex(envelope);
      packet.page = json([...page, sign(null, json(page), f.f.keys.acceptance).toString('hex')]);
      assert.equal(page[2], hash(packet.request));
    }
    await assert.rejects(production.verifyInboundPage(context, packet.request, packet.page, live));
    const forbidden = await mutant.verifyInboundPage(
      { ...context, history },
      packet.request,
      packet.page,
      live,
    );
    assert.equal(forbidden.kind, 'received');
    assert.deepEqual(forbidden.updates, [
      f.entries[control === 'issuance-boundary' ? 1 : 0].update,
    ]);
    assert.equal(forbidden.actor.id, f.route1.principal);
    for (const update of forbidden.updates) update.fill(0);
    forbidden.record.fill(0);
  });
