import test from 'node:test';
import assert from 'node:assert/strict';
import { verify } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { prepared } from '../account-admission/core-fixtures.mjs';
import { genesisMessage } from '../../account-protocol/genesis.ts';
import {
  originMessage,
  epochMessage,
  offerMessage,
  receiptMessage,
  requestDigest,
  activationTarget,
} from '../../account-protocol/admission.ts';
import { activationMessage, activationNonce } from '../../account-protocol/activation.ts';
import { parseDraft, recoveryStateDigest, draftDigest } from '../../account-protocol/recovery.ts';
import {
  schema,
  hash,
  lp,
  ordered,
  message,
  reverseProperties,
  edPublic,
  derivePublic,
  openRecovery,
} from './oracle.mjs';

test('prep probes: six declared message encodings, first-head distinction and old/current recovery payloads', async (t) => {
  const x = await prepared(t),
    offer = await x.begin(),
    completion = await x.completion(offer);
  const input = {
    retryKey: x.account.retryKey,
    requestDigest: offer.epoch.requestDigest,
    completion,
  };
  const challenge = await x.authority.owner.challengePromotion(x.f.core, input);
  assert.equal(challenge.kind, 'promotion-activation-challenge');
  const receipt = await x.finish(offer, completion);
  assert.equal(receipt.kind, 'promotion-receipt');
  const cases = [
    [
      'candidate',
      x.request.candidate,
      genesisMessage,
      x.request.candidate.signature,
      x.request.certification.members[0].sPub,
    ],
    [
      'request',
      x.request,
      originMessage,
      x.request.originSignature,
      x.recovery.draft.bootstrapSigner,
    ],
    ['epoch', offer.epoch, epochMessage, receipt.epochSignature, x.authority.pin.authRoot],
    ['offer', offer, offerMessage, offer.signature, x.authority.pin.authRoot],
    ['receipt', receipt, receiptMessage, receipt.signature, x.authority.pin.authRoot],
    [
      'activationContext',
      challenge.context,
      activationMessage,
      challenge.signature,
      x.authority.pin.authRoot,
    ],
  ];
  const messages = [];
  for (const [type, value, runtime, signature, pub] of cases) {
    const expected = message(type, value);
    assert.deepEqual(Buffer.from(await runtime(value)), expected, type);
    assert.deepEqual(
      Buffer.from(await runtime(reverseProperties(value))),
      expected,
      type + ' recursive property reordering',
    );
    assert.equal(
      verify(null, expected, edPublic(pub), Buffer.from(signature, 'hex')),
      true,
      type + ' independent signature',
    );
    messages.push({
      object: type,
      label: schema.messages.find((m) => m.object === type).label,
      messageHex: expected.toString('hex'),
      signatureVerified: true,
      propertyReorderingStable: true,
    });
  }
  assert.equal(offer.head, hash(message('epoch', offer.epoch)));
  assert.notEqual(offer.head, hash(JSON.stringify(ordered('epoch', offer.epoch))));
  assert.equal(await requestDigest(x.request), hash(JSON.stringify(ordered('request', x.request))));
  assert.equal(
    (await activationTarget(x.request, offer, completion)).completionDigest,
    hash(JSON.stringify(ordered('completion', completion))),
  );
  assert.equal(
    await activationNonce(challenge.context),
    Buffer.from(
      hash(
        lp(
          'done/promotion-activation/v1',
          hash(JSON.stringify(ordered('activationContext', challenge.context))),
        ),
      ),
      'hex',
    ).toString('base64url'),
  );
  const changed = structuredClone(receipt);
  changed.offer.signature = '00'.repeat(64);
  assert.notDeepEqual(
    message('receipt', changed),
    message('receipt', receipt),
    'nested signature is retained',
  );
  assert.equal(
    verify(
      null,
      message('receipt', changed),
      edPublic(x.authority.pin.authRoot),
      Buffer.from(receipt.signature, 'hex'),
    ),
    false,
  );

  const empty = hash(lp('done/headvec/v1'));
  const zeroPosition = hash(
    lp('done/headvec/v1', x.request.candidate.signer, '0', '00'.repeat(32)),
  );
  assert.notEqual(empty, zeroPosition);
  assert.deepEqual(x.request.candidate.coverage.heads, []);
  assert.deepEqual(offer.epoch.heads, []);
  assert.equal(completion.manifest.headVectorDigest, empty);
  assert.equal(completion.admission.headBaselineDigest, empty);

  const published = JSON.parse(
    readFileSync(new URL('../vectors/recovery-code.json', import.meta.url)),
  );
  const old = published.seal_vectors[0],
    i = old.inputs;
  const previous = openRecovery(i.code, i.principal_id, i.r_pub, { ...i, ct: old.expected.ct });
  assert.equal(previous.length, 32);
  assert.equal(previous.toString('hex'), i.r_priv);
  const draft = x.recovery.draft;
  const current = openRecovery(
    x.recovery.code.replaceAll('-', ''),
    draft.principalId,
    draft.rPub,
    draft.envelope,
  );
  try {
    assert.equal(Buffer.from(draft.envelope.ct, 'hex').length, 112);
    assert.equal(current.length, 96);
    assert.equal(derivePublic(current.subarray(0, 32), 'x25519'), draft.rPub);
    const root = hash(lp('done/pkg-root/v1', draft.workspaceId, draft.lineageId, draft.authRoot));
    assert.equal(current.subarray(32, 64).toString('hex'), root);
    assert.equal(draft.rootCommitment, root);
    assert.equal(derivePublic(current.subarray(64, 96), 'ed25519'), draft.bootstrapSigner);
    const envelopeHash = hash(
      lp(
        'done/recovery-envelope/v1',
        '1',
        draft.envelope.salt,
        draft.envelope.nonce,
        draft.envelope.ct,
      ),
    );
    const stateHash = hash(
      lp('done/recovery-state/v1', '0', draft.rPub, envelopeHash, root, draft.bootstrapSigner),
    );
    assert.equal(await recoveryStateDigest(draft), stateHash);
    assert.equal(
      await draftDigest(draft),
      hash(
        lp(
          'done/account-recovery-draft/v1',
          '1',
          draft.principalId,
          draft.workspaceId,
          draft.lineageId,
          draft.authRoot,
          stateHash,
        ),
      ),
    );
    assert.throws(
      () => parseDraft({ ...draft, envelope: { ...draft.envelope, ct: old.expected.ct } }),
      /canonical hex/,
    );
  } finally {
    current.fill(0);
    previous.fill(0);
  }
  const result = {
    status: 'passed',
    scope:
      'Synthetic prep probes, not fixed interoperable vectors or complete field omission coverage',
    messages,
    genesisHeads: {
      emptyDigest: empty,
      explicitZeroPositionDigest: zeroPosition,
      selected: 'empty only for first genesis',
    },
    recovery: {
      historical: { ciphertextBytes: 48, payloadBytes: 32 },
      current: {
        ciphertextBytes: 112,
        payloadBytes: 96,
        segments: [
          'X25519 scalar [0,32)',
          'root commitment [32,64)',
          'Ed25519 bootstrap seed [64,96)',
        ],
      },
      publicKeysAndDigestsMatched: true,
      historicalPayloadRejectedByCurrentParser: true,
    },
  };
  if (process.env.ACCOUNT_REPORT_DIR) {
    mkdirSync(process.env.ACCOUNT_REPORT_DIR, { recursive: true });
    writeFileSync(
      join(process.env.ACCOUNT_REPORT_DIR, 'contract-probes.json'),
      JSON.stringify(result, null, 2) + '\n',
    );
  }
  t.diagnostic(
    JSON.stringify({
      messages: messages.length,
      genesisHeads: result.genesisHeads,
      recovery: result.recovery,
    }),
  );
});
