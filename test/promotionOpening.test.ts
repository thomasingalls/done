// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createPrivateKey, sign } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  authorizePromotionOpening,
  consumePromotionOpening,
} from '../src/account/promotionOpening';
import type { AuthorityPin } from '../account-protocol/authority';
import type { BindingProof } from '../account-protocol/slot';
import type { LocalPasskey } from '../src/crdt/accountAccess';
import type { SessionTask } from '../src/crdt/writeSession';
import { utf8 } from '../src/crdt/custodyCrypto';

const vector = JSON.parse(readFileSync('test/vectors/account-credential.json', 'utf8')) as {
  keys: { authorization: { public_key: string }; passkey: { seed: string } };
  binding_vectors: {
    inputs: {
      v: number;
      account_id: string;
      principal_id: string;
      rp_id: string;
      epoch: number;
      cred_id: string;
      public_key: string;
    };
    expected: { signature: string };
  }[];
};
const first = vector.binding_vectors[0]!,
  b = first.inputs;
const pin: AuthorityPin = {
  v: 1,
  serviceId: '11'.repeat(16),
  origin: 'https://app.done.invalid',
  rpId: b.rp_id,
  authRoot: vector.keys.authorization.public_key,
};
const proof: BindingProof = {
  v: 1,
  kind: 'promotion-slot-binding',
  requestDigest: '22'.repeat(32),
  epochHead: '33'.repeat(32),
  stored: {
    binding: {
      v: b.v,
      accountId: b.account_id,
      principalId: b.principal_id,
      rpId: b.rp_id,
      epoch: b.epoch,
      credId: b.cred_id,
      publicKey: b.public_key,
    },
    bindingSignature: first.expected.signature,
  },
};
const privateKey = createPrivateKey({
  key: Buffer.from('302e020100300506032b657004220420' + vector.keys.passkey.seed, 'hex'),
  format: 'der',
  type: 'pkcs8',
});
const assert: LocalPasskey = async (request) => {
  const authenticatorData = new Uint8Array(37);
  authenticatorData.set(new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(request.rpId))));
  authenticatorData[32] = 0x05;
  const clientDataJSON = utf8(
    JSON.stringify({
      type: 'webauthn.get',
      challenge: Buffer.from(request.challenge).toString('base64url'),
      origin: pin.origin,
      crossOrigin: false,
    }),
  );
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', clientDataJSON));
  return {
    credentialId: request.credentialId,
    authenticatorData,
    clientDataJSON,
    signature: new Uint8Array(sign(null, Buffer.concat([authenticatorData, digest]), privateKey)),
    userHandle: null,
  };
};
const controller = () => new AbortController();
const task = (signal: AbortSignal): SessionTask => ({
  signal,
  step: (fn) => {
    signal.throwIfAborted();
    return fn();
  },
  wait: async (fn) => {
    signal.throwIfAborted();
    const result = await fn();
    signal.throwIfAborted();
    return result;
  },
});
const authorize = (signal: AbortSignal, assertion = assert) =>
  authorizePromotionOpening(task(signal), {
    slotId: 'local',
    pin,
    proof,
    signal,
    root: new Uint8Array(32),
    rootId: '44'.repeat(16),
    assert: assertion,
  });
beforeEach(() => {
  vi.stubGlobal('location', { origin: pin.origin });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

it('requires a fresh verified assertion, then permits the exact initial destination only once', async () => {
  const life = controller(),
    calls = vi.fn(assert),
    opening = await authorize(life.signal, calls);
  expect(calls).toHaveBeenCalledTimes(1);
  expect(() => consumePromotionOpening(opening, 'local', pin, proof)).not.toThrow();
  expect(() => consumePromotionOpening(opening, 'local', pin, proof)).toThrow();
});
it('rejects fabricated or serialized opening objects', async () => {
  expect(() =>
    consumePromotionOpening({ kind: 'fresh-promotion-opening' }, 'local', pin, proof),
  ).toThrow();
  const opening = await authorize(controller().signal);
  expect(() => consumePromotionOpening(structuredClone(opening), 'local', pin, proof)).toThrow();
  expect(() => consumePromotionOpening(opening, 'local', pin, proof)).not.toThrow();
});
it.each(['slot', 'pin', 'request', 'epoch', 'binding'] as const)(
  'rejects reuse against a different %s',
  async (changed) => {
    const opening = await authorize(controller().signal),
      p = structuredClone(proof),
      a = structuredClone(pin);
    if (changed === 'request') p.requestDigest = '55'.repeat(32);
    if (changed === 'epoch') p.epochHead = '55'.repeat(32);
    if (changed === 'binding') p.stored.binding.principalId = 'another-principal';
    if (changed === 'pin') a.serviceId = '55'.repeat(16);
    expect(() =>
      consumePromotionOpening(opening, changed === 'slot' ? 'another-slot' : 'local', a, p),
    ).toThrow();
    expect(() => consumePromotionOpening(opening, 'local', pin, proof)).toThrow();
  },
);
it('expires with its setup lifetime and rejects a refused assertion', async () => {
  const life = controller(),
    opening = await authorize(life.signal);
  life.abort();
  expect(() => consumePromotionOpening(opening, 'local', pin, proof)).toThrow();
  await expect(
    authorize(controller().signal, async (request) => ({
      ...(await assert(request)),
      signature: new Uint8Array(64),
    })),
  ).rejects.toThrow('Account passkey refused');
});
