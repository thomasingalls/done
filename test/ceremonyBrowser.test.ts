import { createWorkerPasskey } from '../src/crdt/workerPasskeyBridge';
// @vitest-environment node
/** Browser-effect routing only. Actual native verification is tested separately. */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createWindowCeremonyBrowser,
  createWorkerCeremonyBrowser,
} from '../src/crdt/ceremonyBrowser';
import { createWorkerChannel } from '../src/crdt/workerChannel';
import type { AuthorityPin } from '../account-protocol/authority';
const pin: AuthorityPin = {
  v: 1,
  serviceId: 'ab'.repeat(16),
  authRoot: 'cd'.repeat(32),
  origin: 'https://fixture.example',
  rpId: 'fixture.example',
};
const disposers: (() => void)[] = [];
afterEach(() => {
  for (const close of disposers.splice(0)) close();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  vi.stubGlobal('window', {});
  vi.stubGlobal('location', { origin: pin.origin });
  vi.stubGlobal('PublicKeyCredential', {
    parseRequestOptionsFromJSON: vi.fn((v) => structuredClone(v)),
    parseCreationOptionsFromJSON: vi.fn((v) => structuredClone(v)),
  });
  vi.stubGlobal('navigator', { credentials: { get: vi.fn(), create: vi.fn() } });
});
const credential = () => ({
  id: 'YQ',
  rawId: Uint8Array.of(97).buffer,
  type: 'public-key',
  getClientExtensionResults: () => ({}),
  response: {
    clientDataJSON: Uint8Array.of(1).buffer,
    authenticatorData: Uint8Array.of(2).buffer,
    signature: Uint8Array.of(3).buffer,
    userHandle: null,
    attestationObject: Uint8Array.of(4).buffer,
  },
});
const request = () => ({
  rpId: pin.rpId,
  challenge: 'cHVibGlj',
  allowCredentials: [{ type: 'public-key', id: 'YQ' }],
  userVerification: 'required',
});
const creation = () => ({
  rp: { id: pin.rpId, name: 'Fixture' },
  user: { id: 'aGFuZGxl', name: 'service account', displayName: 'service account' },
  challenge: 'cHVibGlj',
  pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
});
function bridge() {
  const stop = new AbortController(),
    ports = new MessageChannel(),
    window = createWindowCeremonyBrowser(pin, stop.signal, () => {}),
    client = createWorkerChannel(
      ports.port1,
      'ab'.repeat(16),
      { credential: (v) => window.prompt(v), credentialCancel: (v) => window.cancel(v) },
      () => {},
    ),
    worker = createWorkerChannel(ports.port2, 'ab'.repeat(16), {}, () => {}),
    failed = vi.fn(),
    browser = createWorkerCeremonyBrowser(worker, stop.signal, () => {}, failed);
  disposers.push(() => {
    stop.abort();
    client.close();
    worker.close();
    window.close();
  });
  return { stop, window, browser, failed };
}
it('JSON authentication keeps original options and uses the existing binary-to-wire response codec', async () => {
  const b = bridge(),
    input = request();
  vi.mocked(navigator.credentials.get).mockResolvedValue(credential() as never);
  const reply = await b.browser.authenticate(input, new AbortController().signal);
  expect(PublicKeyCredential.parseRequestOptionsFromJSON).toHaveBeenCalledWith(input);
  expect(vi.mocked(navigator.credentials.get).mock.calls[0]![0]!.publicKey).toEqual(input);
  expect(reply).toMatchObject({
    id: 'YQ',
    rawId: 'YQ',
    type: 'public-key',
    response: { clientDataJSON: 'AQ', authenticatorData: 'Ag', signature: 'Aw' },
  });
  expect(input.challenge).toBe('cHVibGlj');
});
it('creation complements the service-issued handle and name policy without replacing its user handle', async () => {
  const b = bridge(),
    input = creation();
  vi.mocked(navigator.credentials.create).mockResolvedValue(credential() as never);
  const reply = await b.browser.register(input, 'Sam', new AbortController().signal);
  const options = vi.mocked(navigator.credentials.create).mock.calls[0]![0]!.publicKey!;
  expect(options.user).toEqual({ id: 'aGFuZGxl', name: 'aGFuZGxl', displayName: 'Sam · aGFuZGxl' });
  expect(input.user).toEqual({
    id: 'aGFuZGxl',
    name: 'service account',
    displayName: 'service account',
  });
  expect(reply.response.attestationObject).toBe('BA');
});
it('one ordering spans JSON and binary slot assertions', async () => {
  const b = bridge();
  vi.mocked(navigator.credentials.get).mockResolvedValue(credential() as never);
  await b.browser.authenticate(request(), new AbortController().signal);
  const result = await b.browser.assertSlot({
    rpId: pin.rpId,
    credentialId: 'YQ',
    challenge: new Uint8Array(32).fill(7),
  });
  expect(result.signature).toEqual(Uint8Array.of(3));
  await b.browser.authenticate(request(), new AbortController().signal);
  expect(navigator.credentials.get).toHaveBeenCalledTimes(3);
});
it('caller mutation after submission cannot change a pending provider request', async () => {
  const b = bridge(),
    input = request();
  vi.mocked(navigator.credentials.get).mockResolvedValue(credential() as never);
  const pending = b.browser.authenticate(input, new AbortController().signal);
  input.challenge = 'mutated';
  await pending;
  expect(vi.mocked(navigator.credentials.get).mock.calls[0]![0]!.publicKey!.challenge).toBe(
    'cHVibGlj',
  );
});
it('overlap refuses until the real provider settles, and late cancellation returns no credential', async () => {
  const b = bridge(),
    scope = new AbortController();
  let release!: (v: any) => void;
  vi.mocked(navigator.credentials.get).mockReturnValue(new Promise((r) => (release = r)) as never);
  const pending = b.browser.authenticate(request(), scope.signal);
  const rejected = expect(pending).rejects.toThrow();
  await vi.waitFor(() => expect(navigator.credentials.get).toHaveBeenCalledOnce());
  scope.abort();
  await expect(
    b.browser.register(creation(), undefined, new AbortController().signal),
  ).rejects.toThrow();
  release(credential());
  await rejected;
  vi.mocked(navigator.credentials.get).mockResolvedValue(credential() as never);
  await b.browser.authenticate(request(), new AbortController().signal);
  expect(navigator.credentials.create).not.toHaveBeenCalled();
});
it('a foreign RP is refused before browser side effects', async () => {
  const b = bridge();
  await expect(
    b.browser.authenticate({ ...request(), rpId: 'other.example' }, new AbortController().signal),
  ).rejects.toThrow();
  await expect(
    b.browser.register(
      { ...creation(), rp: { id: 'other.example', name: 'Other' } },
      undefined,
      new AbortController().signal,
    ),
  ).rejects.toThrow();
  expect(navigator.credentials.get).not.toHaveBeenCalled();
  expect(navigator.credentials.create).not.toHaveBeenCalled();
});
it('request accessors and unbounded buffers refuse before provider execution', async () => {
  const b = bridge(),
    read = vi.fn();
  const input = {
    ...request(),
    get challenge() {
      read();
      return 'evil';
    },
  };
  await expect(b.browser.authenticate(input, new AbortController().signal)).rejects.toThrow();
  await expect(
    b.browser.authenticate(
      { challenge: new Uint8Array(1024 * 1024 + 1) },
      new AbortController().signal,
    ),
  ).rejects.toThrow();
  expect(read).not.toHaveBeenCalled();
  expect(navigator.credentials.get).not.toHaveBeenCalled();
});
it('foreign origin and forged method fields refuse', async () => {
  const stop = new AbortController();
  vi.stubGlobal('location', { origin: 'https://other.example' });
  expect(() => createWindowCeremonyBrowser(pin, stop.signal, () => {})).toThrow();
  vi.stubGlobal('location', { origin: pin.origin });
  const b = bridge();
  await expect(
    b.window.prompt({
      id: 1,
      kind: 'get',
      options: request(),
      requestedName: null,
      arbitraryMethod: 'other',
    }),
  ).rejects.toThrow();
  expect(navigator.credentials.get).not.toHaveBeenCalled();
});
it('an old cancellation cannot abort a newer provider', async () => {
  const b = bridge();
  vi.mocked(navigator.credentials.get).mockResolvedValue(credential() as never);
  await b.browser.authenticate(request(), new AbortController().signal);
  let release!: (v: any) => void;
  vi.mocked(navigator.credentials.get).mockReturnValue(new Promise((r) => (release = r)) as never);
  const pending = b.browser.authenticate(request(), new AbortController().signal);
  await vi.waitFor(() => expect(navigator.credentials.get).toHaveBeenCalledTimes(2));
  b.window.cancel({ id: 1 });
  const signal = vi.mocked(navigator.credentials.get).mock.calls[1]![0]!.signal!;
  expect(signal.aborted).toBe(false);
  release(credential());
  await pending;
});

it('inactive slot calls reject asynchronously before touching a supplied request signal', async () => {
  const read = vi.fn(),
    live = () => {
      throw Error('inactive native scope');
    },
    signal = new AbortController().signal,
    channel = { request: vi.fn(), closed: false },
    request = {
      get signal() {
        read();
        throw Error('getter should not run');
      },
    };
  const old = createWorkerPasskey(channel, signal, live, vi.fn()),
    browser = createWorkerCeremonyBrowser(channel, signal, live, vi.fn());
  let first!: Promise<unknown>, second!: Promise<unknown>;
  expect(() => {
    first = old(request as never);
  }).not.toThrow();
  expect(() => {
    second = browser.assertSlot(request as never);
  }).not.toThrow();
  await expect(first).rejects.toThrow('inactive native scope');
  await expect(second).rejects.toThrow('inactive native scope');
  expect(read).not.toHaveBeenCalled();
  expect(channel.request).not.toHaveBeenCalled();
});
