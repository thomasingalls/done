// @vitest-environment node
/** Credential error/lifetime transport only; no fake response is treated as native authority. */
import { expect, it, vi } from 'vitest';
import {
  createWindowCredentialPrompt,
  createWorkerCredentialPrompt,
} from '../src/crdt/ownedCredentialPrompt';
import { WorkerChannelError } from '../src/crdt/workerChannel';
const deferred = () => {
  let reject!: (e: unknown) => void;
  const promise = new Promise<never>((_, r) => (reject = r));
  return { promise, reject };
};
it('only live provider cancellation is a fixed transport code and the next request can proceed', async () => {
  const root = new AbortController(),
    p = createWindowCredentialPrompt(root.signal, () => {});
  await expect(
    p.run(1, async () => {
      throw new DOMException('private provider text', 'NotAllowedError');
    }),
  ).rejects.toMatchObject({ code: 'credential-cancelled' });
  await expect(
    p.run(2, async () => {
      throw new DOMException('private provider text', 'AbortError');
    }),
  ).rejects.toMatchObject({ code: 'credential-cancelled' });
  await expect(p.run(3, async () => ({ ok: true }))).resolves.toEqual({ ok: true });
  p.close();
});
it('a live coded cancellation restores the native DOMException and erases request bytes', async () => {
  const root = new AbortController(),
    bytes = Uint8Array.of(1, 2),
    failed = vi.fn(),
    request = vi.fn(async () => {
      throw new WorkerChannelError('credential-cancelled');
    });
  const p = createWorkerCredentialPrompt(
    { closed: false, request },
    root.signal,
    () => {},
    failed,
    'credentialCancel',
  );
  let cause: unknown;
  try {
    await p(
      'credential',
      undefined,
      (id) => ({ id, bytes }),
      (v) => v.bytes.fill(0),
    );
  } catch (e) {
    cause = e;
  }
  expect(cause).toBeInstanceOf(DOMException);
  expect((cause as DOMException).name).toBe('NotAllowedError');
  expect((cause as Error).message).toBe('Passkey request cancelled');
  expect([...bytes]).toEqual([0, 0]);
  expect(failed).not.toHaveBeenCalled();
});
it('root shutdown does not relabel a later provider rejection as a live retry', async () => {
  const root = new AbortController(),
    p = createWindowCredentialPrompt(root.signal, () => {}),
    cause = new DOMException('provider', 'NotAllowedError'),
    dispose = vi.fn();
  await expect(
    p.run(
      1,
      async () => {
        root.abort();
        throw cause;
      },
      dispose,
    ),
  ).rejects.toBe(cause);
  expect(dispose).toHaveBeenCalledOnce();
});
it('an explicit prompt cancellation cannot relabel a late provider rejection', async () => {
  const root = new AbortController(),
    p = createWindowCredentialPrompt(root.signal, () => {}),
    gate = deferred(),
    cause = new DOMException('provider', 'NotAllowedError'),
    dispose = vi.fn();
  const run = p.run(1, () => gate.promise, dispose),
    refused = expect(run).rejects.toBe(cause);
  p.cancel({ id: 1 });
  gate.reject(cause);
  await refused;
  expect(dispose).toHaveBeenCalledOnce();
  p.close();
});
it('a native aborted scope wins over a late coded reply', async () => {
  const root = new AbortController(),
    scope = new AbortController(),
    gate = deferred();
  const request = vi.fn((method: string) =>
    method === 'credential' ? gate.promise : Promise.resolve(),
  );
  const p = createWorkerCredentialPrompt(
    { closed: false, request } as never,
    root.signal,
    () => root.signal.throwIfAborted(),
    vi.fn(),
    'credentialCancel',
  );
  const run = p(
      'credential',
      scope.signal,
      (id) => ({ id }),
      () => {},
    ),
    refused = expect(run).rejects.toMatchObject({ name: 'AbortError' });
  scope.abort();
  gate.reject(new WorkerChannelError('credential-cancelled'));
  await refused;
});
it('malformed and generic failures stay refusals instead of cancellation or a credential result', async () => {
  const root = new AbortController(),
    p = createWindowCredentialPrompt(root.signal, () => {}),
    cause = Error('malformed fixture');
  await expect(
    p.run(1, async () => {
      throw cause;
    }),
  ).rejects.toBe(cause);
  const generic = new WorkerChannelError('operation-refused'),
    w = createWorkerCredentialPrompt(
      {
        closed: false,
        request: vi.fn(async () => {
          throw generic;
        }),
      },
      root.signal,
      () => {},
      vi.fn(),
      'credentialCancel',
    );
  await expect(
    w(
      'credential',
      undefined,
      (id) => ({ id }),
      () => {},
    ),
  ).rejects.toBe(generic);
  p.close();
});
