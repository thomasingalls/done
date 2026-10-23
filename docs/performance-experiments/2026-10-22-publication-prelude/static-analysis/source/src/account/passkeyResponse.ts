/** WebAuthn wire encoding only. The service still verifies the original signed bytes and policy.
 * Extension credentials can lack the native class brand and its toJSON() implementation. */
const encode = (value: ArrayBuffer | ArrayBufferView): string => {
  if (
    !value ||
    (Object.prototype.toString.call(value) !== '[object ArrayBuffer]' && !ArrayBuffer.isView(value))
  )
    throw Error('Passkey response did not contain binary data');
  const bytes = ArrayBuffer.isView(value)
    ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    : new Uint8Array(value);
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
};

function extensionJSON(value: unknown, depth = 0): unknown {
  if (depth > 8) throw Error('Passkey extension output is too deeply nested');
  if (
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value) ||
    Object.prototype.toString.call(value) === '[object ArrayBuffer]'
  )
    return encode(value as ArrayBuffer);
  if (value === null || ['string', 'boolean', 'number', 'undefined'].includes(typeof value))
    return value;
  if (Array.isArray(value)) return value.map((item) => extensionJSON(item, depth + 1));
  if (typeof value !== 'object') throw Error('Unsupported passkey extension output');
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, extensionJSON(item, depth + 1)]),
  );
}

function common(credential: PublicKeyCredential) {
  if (credential.type !== 'public-key') throw Error('Unexpected passkey response type');
  return {
    id: credential.id,
    rawId: encode(credential.rawId),
    type: credential.type,
    ...(credential.authenticatorAttachment
      ? { authenticatorAttachment: credential.authenticatorAttachment }
      : {}),
    clientExtensionResults: extensionJSON(
      credential.getClientExtensionResults(),
    ) as AuthenticationExtensionsClientOutputsJSON,
  };
}

/** Supplemental public-key fields are unnecessary: registration verifies the attestation itself. */
export function registrationResponse(credential: PublicKeyCredential) {
  const response = credential.response as AuthenticatorAttestationResponse;
  return {
    ...common(credential),
    response: {
      clientDataJSON: encode(response.clientDataJSON),
      attestationObject: encode(response.attestationObject),
      ...(typeof response.getTransports === 'function'
        ? { transports: response.getTransports() }
        : {}),
    },
  };
}

export function authenticationResponse(
  credential: PublicKeyCredential,
): AuthenticationResponseJSON {
  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    ...common(credential),
    response: {
      clientDataJSON: encode(response.clientDataJSON),
      authenticatorData: encode(response.authenticatorData),
      signature: encode(response.signature),
      ...(response.userHandle !== null && response.userHandle !== undefined
        ? { userHandle: encode(response.userHandle) }
        : {}),
    },
  };
}
