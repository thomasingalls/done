// @vitest-environment node
/** Browser effect wiring; actual virtual credentials/service verification are separate evidence. */
import { afterEach, expect, it, vi } from 'vitest';
import { createPageSetupBrowser } from '../src/account/setupBrowser';
afterEach(() => vi.unstubAllGlobals());
function fixture() {
  const get = vi.fn(),
    create = vi.fn(),
    parseGet = vi.fn((v) => v),
    parseCreate = vi.fn((v) => structuredClone(v));
  vi.stubGlobal('navigator', { credentials: { get, create } });
  vi.stubGlobal('PublicKeyCredential', {
    parseRequestOptionsFromJSON: parseGet,
    parseCreationOptionsFromJSON: parseCreate,
  });
  const stop = new AbortController(),
    current = vi.fn(() => stop.signal.throwIfAborted());
  return {
    get,
    create,
    parseGet,
    parseCreate,
    stop,
    current,
    browser: createPageSetupBrowser(stop.signal, current),
  };
}
const assertion = () => ({
  id: 'fixture',
  rawId: new ArrayBuffer(1),
  type: 'public-key',
  response: {
    authenticatorData: new ArrayBuffer(1),
    clientDataJSON: new ArrayBuffer(1),
    signature: new ArrayBuffer(1),
    userHandle: null,
  },
  getClientExtensionResults: () => ({}),
});
it('slot assertion retains original scope combination, challenge copy, UV and binary encoding', async () => {
  const f = fixture(),
    scope = new AbortController(),
    challenge = new Uint8Array([1, 2]);
  f.get.mockResolvedValue(assertion());
  const result = await f.browser.assertSlot({
    rpId: 'fixture.test',
    credentialId: 'AQ',
    challenge,
    signal: scope.signal,
  });
  const request = f.get.mock.calls[0]![0];
  expect(request.publicKey.challenge).toEqual(challenge);
  expect(request.publicKey.challenge).not.toBe(challenge);
  expect(request.publicKey.userVerification).toBe('required');
  scope.abort();
  expect(request.signal.aborted).toBe(true);
  expect(result).toMatchObject({ credentialId: 'fixture', signature: new Uint8Array(1) });
});
it('JSON assertion keeps original parser and refuses a late provider response before encoding', async () => {
  const f = fixture();
  let finish!: (v: unknown) => void;
  f.get.mockReturnValue(new Promise((r) => (finish = r)));
  const pending = f.browser.authenticate({ challenge: 'fixture' }, f.stop.signal);
  f.stop.abort();
  finish(assertion());
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(f.parseGet).toHaveBeenCalledExactlyOnceWith({ challenge: 'fixture' });
});
it('registration complements the name but never replaces the service user handle', async () => {
  const f = fixture();
  f.create.mockResolvedValue(null);
  const source = {
    rp: { id: 'fixture.test' },
    user: { id: 'service-issued', name: 'service-label', displayName: 'service-label' },
  };
  await expect(f.browser.register(source, 'Pat', f.stop.signal)).rejects.toThrow('cancelled');
  const request = f.create.mock.calls[0]![0];
  expect(request.publicKey.user).toEqual({
    id: 'service-issued',
    name: 'service-issued',
    displayName: 'Pat · service-issued',
  });
  expect(source.user.name).toBe('service-label');
  expect(request.signal).toBe(f.stop.signal);
});
