/**
 * The device-local slot verifier, against its published vectors (TRD §13.9,
 * §15 row 12; §11.2 test 16).
 *
 * `test/vectors/account-credential.json` is the specification's executable half:
 * two service-signed bindings, two assertions, two demonstrations and
 * twenty-four named negatives, all produced by
 * `scripts/generate-account-credential-vectors.mjs` and re-asserted by
 * `pnpm vectors:check`. This file is the other half — the *client* verifier in
 * `src/`, held to the same bytes.
 *
 * **The positives are replayed, and the negatives are rebuilt.** The vector file
 * publishes the negatives by name and rationale rather than as bytes, because
 * the generator constructs and refutes them in one pass. Rebuilding them here
 * against `src/` is the point: a negative that fails inside the generator says
 * the construction is sound, and a negative that fails inside `verifySlotUnlock`
 * says the code shipping to the device implements it. The signing seeds are
 * RFC 8032 §7.1's and are published in the vector file, so every negative that
 * needs a fresh honest signature can have one.
 *
 * **Order is asserted, not assumed.** §13.9 checks the binding first because
 * everything after it trusts a public key that came out of §6.5's structured
 * clone. An attempt that is wrong in two ways at once has to name the earlier
 * failure, or the ordering is a comment rather than a property.
 */

import { readFileSync } from 'node:fs';
import { createPrivateKey, sign as nodeSign } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  mintUnlockNonce,
  slotBindingMessage,
  slotUnlockChallenge,
  verifySlotUnlock,
  type SlotAssertion,
  type SlotBinding,
  type SlotRefusal,
  type SlotUnlockAttempt,
} from '../src/account/slotUnlock';

/* -------------------------------------------------------------------------- */
/* The published bytes                                                         */

interface Vectors {
  keys: {
    authorization: { seed: string; public_key: string };
    passkey: { seed: string; public_key: string };
    attacker: { seed: string; public_key: string };
  };
  binding_vectors: {
    name: string;
    inputs: {
      v: number;
      account_id: string;
      principal_id: string;
      rp_id: string;
      epoch: number;
      cred_id: string;
      public_key: string;
    };
    derived: { message: string };
    expected: { signature: string; verifies_under: string };
  }[];
  assertion_vectors: {
    name: string;
    inputs: { v: number; principal_id: string; cred_id: string; nonce: string; origin: string };
    derived: {
      challenge: string;
      challenge_b64url: string;
      authenticator_data: string;
      client_data_json: string;
    };
    expected: { signature?: string; verifies: boolean };
  }[];
  demonstrations: { name: string; authenticator_data?: string; sign_count?: number }[];
}

const vectors = JSON.parse(readFileSync('test/vectors/account-credential.json', 'utf8')) as Vectors;

const [edBinding, esBinding] = vectors.binding_vectors;
const [edAssertion] = vectors.assertion_vectors;
const AUTHORIZATION = vectors.keys.authorization;
const PASSKEY = vectors.keys.passkey;
const ATTACKER = vectors.keys.attacker;

/* -------------------------------------------------------------------------- */
/* Primitives — this file's own, so the module under test is never its own oracle */

type Bytes = Uint8Array;

const utf8 = (s: string): Bytes => new TextEncoder().encode(s);

const unhex = (s: string): Bytes =>
  Uint8Array.from((s.match(/../gu) ?? []).map((byte) => Number.parseInt(byte, 16)));

const hex = (bytes: Uint8Array): string =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');

const concat = (...parts: Uint8Array[]): Bytes => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};

const sha256 = async (bytes: Bytes): Promise<Bytes> =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource));

const b64url = (bytes: Bytes): string =>
  btoa(String.fromCodePoint(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');

/** The PKCS#8 framing for a raw Ed25519 seed, as the generators use. */
const ED25519_PKCS8_PREFIX = '302e020100300506032b657004220420';

const edSign = async (seedHex: string, message: Bytes): Promise<Bytes> => {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    unhex(ED25519_PKCS8_PREFIX + seedHex) as BufferSource,
    { name: 'Ed25519' },
    false,
    ['sign'],
  );
  return new Uint8Array(
    await crypto.subtle.sign({ name: 'Ed25519' }, key, message as BufferSource),
  );
};

/* -------------------------------------------------------------------------- */
/* The honest attempt every negative is a mutation of                          */

const bindingOf = (vector: Vectors['binding_vectors'][number]): SlotBinding => ({
  v: vector.inputs.v,
  accountId: vector.inputs.account_id,
  principalId: vector.inputs.principal_id,
  rpId: vector.inputs.rp_id,
  epoch: vector.inputs.epoch,
  credId: vector.inputs.cred_id,
  publicKey: vector.inputs.public_key,
});

/** `authenticatorData = rpIdHash(32) || flags(1) || signCount(4, big-endian)`. */
const authenticatorData = async ({
  rpId,
  flags = 0x05,
  signCount = 0,
}: {
  rpId: string;
  flags?: number;
  signCount?: number;
}): Promise<Bytes> =>
  concat(
    await sha256(utf8(rpId)),
    new Uint8Array([flags]),
    new Uint8Array([
      (signCount >>> 24) & 0xff,
      (signCount >>> 16) & 0xff,
      (signCount >>> 8) & 0xff,
      signCount & 0xff,
    ]),
  );

/**
 * The user agent's serialization. Rebuilt here — which the *verifier* must never
 * do, and a test constructing an attempt must, since there is no browser.
 */
const clientDataJSON = ({
  type = 'webauthn.get',
  challenge,
  origin,
  crossOrigin = false as boolean | null,
  topOrigin = null as string | null,
}: {
  type?: string;
  challenge: string;
  origin: string;
  crossOrigin?: boolean | null;
  topOrigin?: string | null;
}): Bytes =>
  utf8(
    JSON.stringify({
      type,
      challenge,
      origin,
      ...(crossOrigin === null ? {} : { crossOrigin }),
      ...(topOrigin === null ? {} : { topOrigin }),
    }),
  );

const ORIGIN = 'https://app.done.invalid';

/** Sign an assertion with the account passkey, over exactly what WebAuthn signs. */
const assertionSignedBy = async (
  seedHex: string,
  credentialId: string,
  authData: Bytes,
  clientData: Bytes,
): Promise<SlotAssertion> => ({
  credentialId,
  authenticatorData: authData,
  clientDataJSON: clientData,
  signature: await edSign(seedHex, concat(authData, await sha256(clientData))),
});

let honest: SlotUnlockAttempt;

beforeAll(async () => {
  const binding = bindingOf(edBinding!);
  const nonce = edAssertion!.inputs.nonce;
  honest = {
    binding,
    bindingSignature: unhex(edBinding!.expected.signature),
    authorizationKey: unhex(AUTHORIZATION.public_key),
    nonce,
    origin: ORIGIN,
    assertion: await assertionSignedBy(
      PASSKEY.seed,
      binding.credId,
      await authenticatorData({ rpId: binding.rpId }),
      clientDataJSON({ challenge: edAssertion!.derived.challenge_b64url, origin: ORIGIN }),
    ),
  };
});

/** Run one mutation of the honest attempt and name the refusal it must produce. */
const attempt = async (patch: Partial<SlotUnlockAttempt>) =>
  verifySlotUnlock({ ...honest, ...patch });

const refusedWith = async (patch: Partial<SlotUnlockAttempt>, refusal: SlotRefusal) => {
  const result = await attempt(patch);
  expect(result).toEqual({ opened: false, refusal });
};

/* -------------------------------------------------------------------------- */

describe('the two constructions reproduce the published bytes', () => {
  it('the slot binding message is the one the service signed', () => {
    for (const vector of vectors.binding_vectors) {
      expect(hex(slotBindingMessage(bindingOf(vector)))).toBe(vector.derived.message);
    }
  });

  it('the unlock challenge is the one that reached client data', async () => {
    for (const vector of vectors.assertion_vectors) {
      const challenge = await slotUnlockChallenge({
        v: vector.inputs.v,
        principalId: vector.inputs.principal_id,
        credId: vector.inputs.cred_id,
        nonce: vector.inputs.nonce,
      });
      expect(hex(challenge)).toBe(vector.derived.challenge);
      expect(b64url(challenge)).toBe(vector.derived.challenge_b64url);
    }
  });

  it('mints a fresh 32-byte nonce per attempt', () => {
    const first = mintUnlockNonce();
    expect(first).toMatch(/^[0-9a-f]{64}$/u);
    expect(mintUnlockNonce()).not.toBe(first);
  });
});

describe('an honest attempt opens the slot', () => {
  it('opens under an Ed25519 credential, the preferred encoding', async () => {
    expect(await attempt({})).toEqual({ opened: true, signCount: 0 });
  });

  it('opens under an ES256 credential, the accepted one', async () => {
    // The published ES256 assertion has no signature — ECDSA's is randomized, so
    // pinning one would pin the generator's RNG rather than the construction —
    // and the vector file publishes no private half. A keypair minted here
    // exercises what this verifier owes: that the second compiled-in encoding
    // imports and verifies in WebCrypto with no polyfill.
    const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ])) as CryptoKeyPair;
    const spki = hex(new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey)));
    expect(spki.startsWith('3059301306072a8648ce3d020106082a8648ce3d030107034200')).toBe(true);

    const binding: SlotBinding = { ...bindingOf(esBinding!), publicKey: spki };
    const nonce = mintUnlockNonce();
    const challenge = await slotUnlockChallenge({
      principalId: binding.principalId,
      credId: binding.credId,
      nonce,
    });
    const authData = await authenticatorData({ rpId: binding.rpId });
    const clientData = clientDataJSON({ challenge: b64url(challenge), origin: ORIGIN });
    // An independent Node/OpenSSL signer emits WebAuthn's DER, unlike subtle.sign's raw r || s.
    const privateKey = createPrivateKey({
      key: Buffer.from(await crypto.subtle.exportKey('pkcs8', pair.privateKey)),
      format: 'der',
      type: 'pkcs8',
    });
    const signature = new Uint8Array(
      nodeSign('sha256', concat(authData, await sha256(clientData)), privateKey),
    );

    expect(
      await verifySlotUnlock({
        binding,
        bindingSignature: await edSign(AUTHORIZATION.seed, slotBindingMessage(binding)),
        authorizationKey: unhex(AUTHORIZATION.public_key),
        nonce,
        origin: ORIGIN,
        assertion: {
          credentialId: binding.credId,
          authenticatorData: authData,
          clientDataJSON: clientData,
          signature,
        },
      }),
    ).toEqual({ opened: true, signCount: 0 });
  });

  it('reads the signature counter and does not enforce it', async () => {
    // The published demonstration: an assertion reporting signCount 3 where the
    // last reported 0 opens, deliberately. A synced passkey cannot maintain a
    // counter and reports zero forever, so a verifier enforcing monotonicity
    // refuses the ordinary case while detecting nothing.
    const demo = vectors.demonstrations.find((d) => d.name === 'sign-count-is-read-and-ignored');
    expect(demo?.authenticator_data).toBeDefined();
    const authData = unhex(demo!.authenticator_data!);
    const result = await attempt({
      assertion: await assertionSignedBy(
        PASSKEY.seed,
        honest.binding.credId,
        authData,
        honest.assertion.clientDataJSON,
      ),
    });
    expect(result).toEqual({ opened: true, signCount: demo!.sign_count });
  });

  it('opens on a binding whose epoch this device has never seen revoked', async () => {
    // The second demonstration, and a bound rather than a defect: what a stale
    // binding opens is already-local state, and §13.5's lineage closes it the
    // moment the device is online.
    expect(honest.binding.epoch).toBe(7);
    expect(await attempt({})).toEqual({ opened: true, signCount: 0 });
  });
});

describe('the anchor', () => {
  it('refuses a binding the service did not sign, however consistent the record is', async () => {
    // The whole attack, executed competently: substitute your own public key into
    // the slot index, assert with your own authenticator, and re-sign the binding
    // so the profile is internally consistent. It fails on the one thing a
    // profile holder cannot produce.
    const binding: SlotBinding = {
      ...honest.binding,
      publicKey: `302a300506032b6570032100${ATTACKER.public_key}`,
    };
    await refusedWith(
      {
        binding,
        bindingSignature: await edSign(ATTACKER.seed, slotBindingMessage(binding)),
        assertion: await assertionSignedBy(
          ATTACKER.seed,
          binding.credId,
          honest.assertion.authenticatorData,
          honest.assertion.clientDataJSON,
        ),
      },
      'binding-not-signed-by-the-service',
    );
  });

  it('refuses a binding whose bytes were edited after signing', async () => {
    await refusedWith(
      { binding: { ...honest.binding, epoch: honest.binding.epoch + 1 } },
      'binding-not-signed-by-the-service',
    );
  });

  it('is checked before anything else that could fail', async () => {
    // Wrong in two ways at once. If the later failure is named, the ordering
    // §13.9 states is a comment rather than a property.
    await refusedWith(
      {
        binding: { ...honest.binding, accountId: 'acc_someone_else' },
        assertion: { ...honest.assertion, credentialId: 'cred_not_the_bound_one' },
      },
      'binding-not-signed-by-the-service',
    );
  });

  it('refuses a service-signed key outside the two accepted encodings', async () => {
    // Valid DER, right length, key agreement rather than verification: an X25519
    // SubjectPublicKeyInfo the service really did sign. The accepted encodings
    // are a compiled-in set of two, and anything outside it is refused rather
    // than guessed at.
    const binding: SlotBinding = {
      ...honest.binding,
      publicKey: `302a300506032b656e032100${PASSKEY.public_key}`,
    };
    await refusedWith(
      { binding, bindingSignature: await edSign(AUTHORIZATION.seed, slotBindingMessage(binding)) },
      'unknown-key-encoding',
    );
  });

  it('decides the encoding before the key is used for anything', async () => {
    // Position, not just presence. The stored encoding is checked right after
    // the anchor, so an unrecognized one is named even when the attempt is also
    // wrong further down. Without that, a prefix set that over-matched would be
    // invisible: the import would fail later and answer `unknown-key-encoding`
    // anyway, from a step that had already trusted the key.
    const binding: SlotBinding = {
      ...honest.binding,
      publicKey: `302a300506032b656e032100${PASSKEY.public_key}`,
    };
    await refusedWith(
      {
        binding,
        bindingSignature: await edSign(AUTHORIZATION.seed, slotBindingMessage(binding)),
        assertion: { ...honest.assertion, credentialId: 'cred_the_attacker_enrolled' },
      },
      'unknown-key-encoding',
    );
  });

  it('refuses an accepted prefix whose key no importer will take', async () => {
    // The other half of "refused rather than guessed at": the framing is one of
    // the two, and the bytes after it are not a key — a P-256 point off the
    // curve. A verifier reporting this as a bad signature would tell the person
    // to try again at something no retry can fix.
    const binding: SlotBinding = {
      ...honest.binding,
      publicKey: `3059301306072a8648ce3d020106082a8648ce3d03010703420004${'aa'.repeat(64)}`,
    };
    await refusedWith(
      { binding, bindingSignature: await edSign(AUTHORIZATION.seed, slotBindingMessage(binding)) },
      'unknown-key-encoding',
    );
  });
});

describe('the assertion', () => {
  it('refuses a credential the binding does not name', async () => {
    await refusedWith(
      { assertion: { ...honest.assertion, credentialId: 'cred_the_attacker_enrolled' } },
      'assertion-from-an-unbound-credential',
    );
  });

  it('refuses an assertion signed by another key', async () => {
    await refusedWith(
      {
        assertion: await assertionSignedBy(
          ATTACKER.seed,
          honest.binding.credId,
          honest.assertion.authenticatorData,
          honest.assertion.clientDataJSON,
        ),
      },
      'assertion-signature-invalid',
    );
  });

  it('refuses a flipped signature bit', async () => {
    const signature = Uint8Array.from(honest.assertion.signature);
    signature.set([(signature.at(0) ?? 0) ^ 0x01], 0);
    await refusedWith(
      { assertion: { ...honest.assertion, signature } },
      'assertion-signature-invalid',
    );
  });
});

describe('client data, parsed rather than rebuilt', () => {
  const withClientData = async (
    build: (challengeB64: string) => Bytes,
  ): Promise<Partial<SlotUnlockAttempt>> => {
    const clientData = build(edAssertion!.derived.challenge_b64url);
    return {
      assertion: await assertionSignedBy(
        PASSKEY.seed,
        honest.binding.credId,
        honest.assertion.authenticatorData,
        clientData,
      ),
    };
  };

  it('refuses bytes that are not JSON', async () => {
    await refusedWith(await withClientData(() => utf8('{not json')), 'client-data-unreadable');
  });

  it('refuses a registration ceremony presented as an assertion', async () => {
    await refusedWith(
      await withClientData((challenge) =>
        clientDataJSON({ type: 'webauthn.create', challenge, origin: ORIGIN }),
      ),
      'client-data-is-not-an-assertion',
    );
  });

  it('refuses an assertion collected at another origin', async () => {
    await refusedWith(
      await withClientData((challenge) =>
        clientDataJSON({ challenge, origin: 'https://app.done.example' }),
      ),
      'client-data-origin-mismatch',
    );
  });

  it('refuses a ceremony performed in a frame', async () => {
    // A complete, correctly signed assertion: this origin, this RP ID, this
    // challenge, `crossOrigin: true`. The origin check does not cover it — in a
    // cross-origin frame the caller *is* the legitimate app origin while the
    // top-level one differs.
    await refusedWith(
      await withClientData((challenge) =>
        clientDataJSON({ challenge, origin: ORIGIN, crossOrigin: true }),
      ),
      'embedded-ceremony',
    );
  });

  it('refuses client data that claims an embedding origin while denying the frame', async () => {
    // The client contradicting itself: `topOrigin` is emitted only when
    // `crossOrigin` is true, so a verifier reading only the boolean accepts an
    // embedding recorded in the bytes it just hashed.
    await refusedWith(
      await withClientData((challenge) =>
        clientDataJSON({
          challenge,
          origin: ORIGIN,
          crossOrigin: false,
          topOrigin: 'https://embedder.example',
        }),
      ),
      'embedded-ceremony',
    );
  });

  it('accepts an omitted crossOrigin, because absent is not false', async () => {
    const result = await attempt(
      await withClientData((challenge) =>
        clientDataJSON({ challenge, origin: ORIGIN, crossOrigin: null }),
      ),
    );
    expect(result).toEqual({ opened: true, signCount: 0 });
  });
});

describe('the challenge binds this operation', () => {
  it('refuses a challenge minted for a different attempt', async () => {
    await refusedWith({ nonce: mintUnlockNonce() }, 'challenge-is-not-the-one-minted');
  });

  it('refuses an assertion whose challenge was minted under another label', async () => {
    // The label *is* the purpose. An account sign-in challenge, correctly signed
    // by the right credential at the right origin, is not a slot unlock — which
    // is what stops one being presented to the service as the other.
    const elsewhere = await sha256(
      concat(
        ...[
          'done/signin/v1',
          '1',
          honest.binding.principalId,
          honest.binding.credId,
          honest.nonce,
        ].map((field) => {
          const bytes = utf8(field);
          return concat(new Uint8Array([bytes.length >> 8, bytes.length & 0xff]), bytes);
        }),
      ),
    );
    const clientData = clientDataJSON({ challenge: b64url(elsewhere), origin: ORIGIN });
    await refusedWith(
      {
        assertion: await assertionSignedBy(
          PASSKEY.seed,
          honest.binding.credId,
          honest.assertion.authenticatorData,
          clientData,
        ),
      },
      'challenge-is-not-the-one-minted',
    );
  });
});

describe('authenticator data', () => {
  const withAuthData = async (over: {
    rpId?: string;
    flags?: number;
  }): Promise<Partial<SlotUnlockAttempt>> => {
    const authData = await authenticatorData({ rpId: honest.binding.rpId, ...over });
    return {
      assertion: await assertionSignedBy(
        PASSKEY.seed,
        honest.binding.credId,
        authData,
        honest.assertion.clientDataJSON,
      ),
    };
  };

  it('refuses an assertion collected for another relying party', async () => {
    await refusedWith(await withAuthData({ rpId: 'app.done.example' }), 'rp-id-mismatch');
  });

  it('refuses user presence without user verification', async () => {
    // A UP-only assertion is a click, and a click is what the person at a shared
    // keyboard already has.
    await refusedWith(await withAuthData({ flags: 0x01 }), 'user-verification-not-asserted');
  });

  it('refuses an assertion claiming verification without presence', async () => {
    await refusedWith(await withAuthData({ flags: 0x04 }), 'user-presence-not-asserted');
  });

  it('refuses authenticator data too short to hold its own fields', async () => {
    const short = honest.assertion.authenticatorData.subarray(0, 20);
    await refusedWith(
      {
        assertion: await assertionSignedBy(
          PASSKEY.seed,
          honest.binding.credId,
          short,
          honest.assertion.clientDataJSON,
        ),
      },
      'authenticator-data-truncated',
    );
  });
});
