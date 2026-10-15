// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { authenticationResponse, registrationResponse } from '../src/account/passkeyResponse';

const bytes = (values: number[]) => Uint8Array.from(values).buffer;
const id = Buffer.from([0, 251, 255]).toString('base64url');
const nativeJSON = vi.fn(() => {
  throw new TypeError('Native brand mismatch');
});
function credential(response: object, extra: object = {}) {
  return {
    id,
    rawId: bytes([0, 251, 255]),
    type: 'public-key',
    authenticatorAttachment: null,
    response,
    getClientExtensionResults: () => ({}),
    toJSON: nativeJSON,
    ...extra,
  } as unknown as PublicKeyCredential;
}

it('encodes original registration bytes without calling an extension credential’s native JSON method', () => {
  nativeJSON.mockClear();
  const result = registrationResponse(
    credential({
      clientDataJSON: bytes([123, 125]),
      attestationObject: bytes([0, 251, 255]),
      getTransports: () => ['internal', 'hybrid'],
    }),
  );
  expect(result).toEqual({
    id,
    rawId: id,
    type: 'public-key',
    clientExtensionResults: {},
    response: {
      clientDataJSON: 'e30',
      attestationObject: 'APv_',
      transports: ['internal', 'hybrid'],
    },
  });
  expect(nativeJSON).not.toHaveBeenCalled();
});

it('serializes an assertion with no JSON method and retains an empty supplied user handle', () => {
  const result = authenticationResponse(
    credential(
      {
        clientDataJSON: bytes([123, 125]),
        authenticatorData: bytes([0, 251, 255]),
        signature: bytes([1, 2, 3]),
        userHandle: bytes([]),
      },
      { toJSON: undefined, authenticatorAttachment: 'cross-platform' },
    ),
  );
  expect(result).toEqual({
    id,
    rawId: id,
    type: 'public-key',
    authenticatorAttachment: 'cross-platform',
    clientExtensionResults: {},
    response: {
      clientDataJSON: 'e30',
      authenticatorData: 'APv_',
      signature: 'AQID',
      userHandle: '',
    },
  });
});

it('omits a null user handle and optional registration methods without inventing key data', () => {
  expect(
    authenticationResponse(
      credential({
        clientDataJSON: bytes([1]),
        authenticatorData: bytes([2]),
        signature: bytes([3]),
        userHandle: null,
      }),
    ).response,
  ).not.toHaveProperty('userHandle');
  const registered = registrationResponse(
    credential({ clientDataJSON: bytes([1]), attestationObject: bytes([2]) }),
  );
  expect(Object.keys(registered.response).sort()).toEqual(['attestationObject', 'clientDataJSON']);
});

it('encodes only the supplied view slice and nested extension buffers', () => {
  const source = Uint8Array.from([9, 0, 251, 255, 9]);
  const result = authenticationResponse(
    credential(
      {
        clientDataJSON: bytes([1]),
        authenticatorData: bytes([2]),
        signature: source.subarray(1, 4),
        userHandle: null,
      },
      {
        getClientExtensionResults: () => ({
          credProps: { rk: true },
          prf: { enabled: true, results: { first: bytes([0, 251, 255]) } },
        }),
      },
    ),
  );
  expect(result.response.signature).toBe('APv_');
  expect(result.clientExtensionResults).toEqual({
    credProps: { rk: true },
    prf: { enabled: true, results: { first: 'APv_' } },
  });
  expect([...source]).toEqual([9, 0, 251, 255, 9]);
});

it('refuses a non-public-key response and missing signed binary fields', () => {
  expect(() => registrationResponse(credential({}, { type: 'password' }))).toThrow(
    'Unexpected passkey',
  );
  expect(() =>
    authenticationResponse(
      credential({
        clientDataJSON: bytes([1]),
        authenticatorData: bytes([2]),
        signature: undefined,
      }),
    ),
  ).toThrow('binary data');
});

it('refuses cyclic extension results rather than silently dropping them', () => {
  const cycle: { next?: unknown } = {};
  cycle.next = cycle;
  expect(() =>
    registrationResponse(
      credential(
        { clientDataJSON: bytes([1]), attestationObject: bytes([2]) },
        {
          getClientExtensionResults: () => cycle,
        },
      ),
    ),
  ).toThrow('too deeply nested');
});
