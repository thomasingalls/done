import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { createHash, createPublicKey, verify } from 'node:crypto';
import * as Y from 'yjs';
import { lp, openCandidate } from '../account-genesis/oracle.mjs';
import { manifestBytes, semanticBytes } from '../account-admission/core-fixtures.mjs';
import {
  native,
  prepare,
  genesis,
  seed,
  admit,
  snapshot,
  args,
  census,
  cold,
  watch,
  observations,
  report,
  resultJSON,
} from './fixtures.mjs';
const hash = (b) => createHash('sha256').update(b).digest('hex');
function independent(receipt, item, request) {
  const signed = (pub, signature, bytes) =>
    assert.equal(
      verify(
        null,
        bytes,
        createPublicKey({
          key: Buffer.from('302a300506032b6570032100' + pub, 'hex'),
          format: 'der',
          type: 'spki',
        }),
        Buffer.from(signature, 'hex'),
      ),
      true,
    );
  const { signature, ...body } = receipt;
  signed(
    item.draft.authRoot,
    signature,
    lp('done/promotion-receipt/v2', hash(JSON.stringify(body))),
  );
  signed(
    request.certification.members[0].sPub,
    receipt.completion.manifest.signature,
    manifestBytes(receipt.completion.manifest),
  );
  signed(
    request.certification.members[0].sPub,
    receipt.completion.admission.signature,
    semanticBytes(receipt.completion.admission),
  );
  const doc = new Y.Doc({ gc: false });
  try {
    Y.applyUpdate(doc, openCandidate(request.candidate, item.draft, item.recoveryCode));
    return {
      sv: Buffer.from(Y.encodeStateVector(doc)).toString('hex'),
      ds: Buffer.from(Y.encodeSnapshot(Y.createSnapshot(Y.snapshot(doc).ds, new Map()))).toString(
        'hex',
      ),
    };
  } finally {
    doc.destroy();
  }
}
async function scenario(f, id, field, ops, reverse, detailed) {
  await f.setup(f.page);
  const item = await f.ready(id);
  await seed(f.page, item, ops, reverse);
  await prepare(f.page, item);
  await genesis(f.page, item);
  await f.page.evaluate(() => {
    admissionTransport.challenge = async () => {
      throw Error('capture-offered');
    };
  });
  await assert.rejects(admit(f.page, item), /capture-offered/);
  const original = (await snapshot(f.page, item)).marker;
  const parts = {
    sv: original.admission.completion.manifest.sv,
    ds: original.admission.completion.manifest.ds,
  };
  const wrong = { ...parts, [field]: field === 'sv' ? '00' : '0000' };
  assert.notEqual(wrong[field], parts[field]);
  await f.page.evaluate(
    ({ item, wrong }) => Harness.forgeCompletion(item.slotId, item.code, wrong),
    { item: args(item), wrong },
  );
  const forged = (await snapshot(f.page, item)).marker;
  await f.setup(f.page);
  // Genuine HTTP service issuance, including an activation assertion for the lying completion.
  const receipt = await f.page.evaluate(
    async ({ item, a }) => {
      const input = {
        retryKey: item.retryKey,
        requestDigest: a.offer.epoch.requestDigest,
        completion: a.completion,
      };
      const challenge = await admissionTransport.challenge(input);
      const response = await assertActivation(await Harness.activationOptions(challenge.context));
      return admissionTransport.finish({
        ...input,
        activation: { nonce: challenge.context.nonce, response },
      });
    },
    { item: args(item), a: forged.admission },
  );
  assert.equal(receipt.kind, 'promotion-receipt');
  assert.deepEqual(independent(receipt, item, forged.admission.request), parts);
  assert.equal(receipt.completion.manifest[field], wrong[field]);
  await f.page.evaluate(({ receipt, request }) => Harness.verifyReceipt(receipt, request, pin), {
    receipt,
    request: forged.admission.request,
  });
  const untouched = await census(f),
    source = await census(f, true);
  await watch(f);
  await assert.rejects(admit(f.page, item), /Semantic coverage/); // begin's lost-reply path
  assert.equal(await census(f), untouched);
  assert.equal((await observations(f)).puts.length, 0);
  if (detailed) {
    // Restore the original offered carrier to isolate the final answer verifier, reached via challenge's receipt reply.
    await f.page.evaluate(
      ({ item, original, receipt }) => {
        admissionTransport.begin = async () => receipt.offer;
        admissionTransport.challenge = async () => receipt;
        return Harness.put([item.slotId, 'application-upgrade'], original);
      },
      { item: args(item), original, receipt },
    );
    const before = await census(f);
    await assert.rejects(admit(f.page, item), /Semantic coverage/);
    assert.equal(await census(f), before);
  }
  await f.page.evaluate(
    ({ item, receipt }) => Harness.retainReceipt(item.slotId, item.code, receipt),
    { item: args(item), receipt },
  );
  const retained = await census(f);
  await cold(f);
  await watch(f);
  await assert.rejects(admit(f.page, item), /Semantic coverage/);
  assert.equal(await census(f), retained);
  assert.equal((await observations(f)).puts.length, 0);
  await cold(f, 'receiptParts');
  assert.deepEqual(await admit(f.page, item), receipt); // effective omission: keeps signatures but trusts claimed coverage
  assert.equal(await census(f), retained);
  assert.equal(await census(f, true), source);
  await cold(f);
  await assert.rejects(admit(f.page, item), /Semantic coverage/);
  assert.equal(await census(f), retained);
  return {
    field,
    wrong,
    actual: parts,
    serviceIssued: true,
    validSignatures: true,
    sourceUnchanged: true,
    refused: detailed
      ? ['lost-begin', 'challenge-receipt', 'cold-retained']
      : ['lost-begin', 'cold-retained'],
    omissionReturnedReceipt: true,
  };
}
for (const field of ['sv', 'ds'])
  test(
    `real service-issued ${field} lie refuses at all receipt paths; retained-part omission returns it`,
    { timeout: 60000 },
    async (t) => {
      const f = await native(t);
      report(
        'receipt-' + field,
        await scenario(
          f,
          field,
          field,
          [{ at: 1, remove: 1, insert: 'journal', disk: false }],
          false,
          true,
        ),
      );
    },
  );
test(
  '12 generated journal/disk histories rederive receipt coverage on cold reopen and detect the omission',
  { timeout: 240000 },
  async () => {
    const histories = [];
    let index = 0;
    const arb = fc.record({
      field: fc.constantFrom('sv', 'ds'),
      reverse: fc.boolean(),
      ops: fc.array(
        fc.record({
          at: fc.nat(20),
          remove: fc.integer({ min: 1, max: 3 }),
          insert: fc.string({ minLength: 1, maxLength: 12 }),
          disk: fc.boolean(),
        }),
        { minLength: 1, maxLength: 5 },
      ),
    });
    const result = await fc.check(
      fc.asyncProperty(arb, async (h) => {
        console.log('receipt history ' + (index + 1) + ': ' + JSON.stringify(h));
        const cleanups = [];
        try {
          const f = await native({ after: (cb) => cleanups.push(cb) });
          const value = await scenario(
            f,
            'generated-' + index++,
            h.field,
            [{ at: 0, remove: 1, insert: 'j', disk: false }, ...h.ops],
            h.reverse,
            false,
          );
          histories.push({ ...h, ...value });
          report('receipt-progress', { histories });
        } finally {
          for (const cleanup of cleanups.reverse()) await cleanup();
        }
      }),
      { seed: 1121026, numRuns: 12 },
    );
    report('receipt-generated', { ...resultJSON(result), histories });
    assert.equal(result.failed, false, String(result.errorInstance));
  },
);
