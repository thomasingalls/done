// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { createWindowPasskey, createWorkerPasskey } from '../src/crdt/workerPasskeyBridge';
import { createWorkerChannel } from '../src/crdt/workerChannel';
import type { LocalPasskeyRequest } from '../src/crdt/accountAccess';
import type { SlotAssertion } from '../src/account/slotUnlock';
const gate = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};
const tick = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};
const request = (scope?: AbortSignal): LocalPasskeyRequest => ({
  rpId: 'fixture.invalid',
  credentialId: 'aGVsbG8',
  challenge: new Uint8Array(32).fill(7),
  ...(scope ? { signal: scope } : {}),
});
const assertion = (): SlotAssertion => ({
  credentialId: 'aGVsbG8',
  authenticatorData: new Uint8Array([1]),
  clientDataJSON: new Uint8Array([2]),
  signature: new Uint8Array([3]),
  userHandle: null,
});
const disposers: (() => void)[] = [];
afterEach(() => {
  for (const stop of disposers.splice(0)) stop();
  vi.restoreAllMocks();
});
it('uses the original challenge, scoped signal and assertion without minting proof in the Window', async () => {
  const root = new AbortController(),
    req = request(),
    value = assertion();
  let presented: LocalPasskeyRequest | undefined;
  const broker = createWindowPasskey(
      async (p) => {
        presented = p;
        return value;
      },
      root.signal,
      () => {},
    ),
    rpc = vi.fn(async (method: string, input: unknown) =>
      method === 'passkey' ? broker.prompt(input) : broker.cancel(input),
    ),
    proof = createWorkerPasskey(
      { request: rpc as any, closed: false },
      root.signal,
      () => {},
      vi.fn(),
    );
  const result = await proof(req);
  expect(presented!.rpId).toBe(req.rpId);
  expect(presented!.credentialId).toBe(req.credentialId);
  expect(presented!.signal).not.toBe(root.signal);
  expect(result.signature).toEqual(Uint8Array.of(3));
  expect(value.signature).toEqual(Uint8Array.of(0));
  expect(req.challenge).toEqual(new Uint8Array(32).fill(7));
  expect(presented!.challenge.every((v) => v === 0)).toBe(true);
  expect(rpc).toHaveBeenCalledOnce();
  broker.close();
});
it('cancels just the online proof and never returns a provider result that arrives late', async () => {
  const root = new AbortController(),
    scope = new AbortController(),
    held = gate(),
    value = assertion();
  let prompt: LocalPasskeyRequest | undefined;
  const broker = createWindowPasskey(
      async (p) => {
        prompt = p;
        await held.promise;
        return value;
      },
      root.signal,
      () => {},
    ),
    failed = vi.fn(),
    rpc = vi.fn(async (method: string, input: unknown) =>
      method === 'passkey' ? broker.prompt(input) : broker.cancel(input),
    ),
    proof = createWorkerPasskey(
      { request: rpc as any, closed: false },
      root.signal,
      () => {},
      failed,
    );
  const pending = proof(request(scope.signal));
  void pending.catch(() => {});
  await tick();
  scope.abort();
  expect(prompt!.signal!.aborted).toBe(true);
  expect(root.signal.aborted).toBe(false);
  await expect(proof(request())).rejects.toThrow();
  held.resolve();
  await expect(pending).rejects.toThrow();
  expect(value.signature[0]).toBe(0);
  expect(failed).not.toHaveBeenCalled();
  const next = await proof(request());
  expect(next.credentialId).toBe('aGVsbG8');
  broker.close();
});
it('captures inputs before waiting, rather than re-reading a replaced request object', async () => {
  const root = new AbortController(),
    held = gate(),
    seen: number[] = [];
  const broker = createWindowPasskey(
      async (p) => {
        seen.push(p.challenge[0]!);
        await held.promise;
        seen.push(p.challenge[0]!);
        return assertion();
      },
      root.signal,
      () => {},
    ),
    proof = createWorkerPasskey(
      {
        request: (async (method: string, v: unknown) =>
          method === 'passkey' ? broker.prompt(v) : broker.cancel(v)) as any,
        closed: false,
      },
      root.signal,
      () => {},
      vi.fn(),
    );
  const req = request(),
    pending = proof(req);
  req.challenge.fill(8);
  req.rpId = 'replaced.invalid';
  held.resolve();
  await pending;
  expect(seen).toEqual([7, 7]);
  broker.close();
});
it('refuses replay/future IDs and does not let an old cancel abort a later prompt', async () => {
  const root = new AbortController(),
    held = gate();
  let seen: LocalPasskeyRequest | undefined;
  const broker = createWindowPasskey(
    async (p) => {
      seen = p;
      if (p.challenge[0] === 8) await held.promise;
      return assertion();
    },
    root.signal,
    () => {},
  );
  await broker.prompt({ id: 1, ...request() });
  await expect(broker.prompt({ id: 1, ...request() })).rejects.toThrow();
  expect(() => broker.cancel({ id: 3 })).toThrow();
  const next = broker.prompt({ id: 2, ...request(), challenge: new Uint8Array([8]) });
  broker.cancel({ id: 1 });
  expect(seen!.signal!.aborted).toBe(false);
  held.resolve();
  await next;
  broker.cancel({ id: 2 });
  broker.close();
});
it('withdraws Window prompts on root close, retaining provider settlement and erasing late bytes', async () => {
  const root = new AbortController(),
    held = gate(),
    value = assertion();
  let seen: LocalPasskeyRequest | undefined;
  const broker = createWindowPasskey(
      async (p) => {
        seen = p;
        await held.promise;
        return value;
      },
      root.signal,
      () => {},
    ),
    pending = broker.prompt({ id: 1, ...request() });
  root.abort();
  expect(seen!.signal!.aborted).toBe(true);
  held.resolve();
  await expect(pending).rejects.toThrow();
  expect(value.signature[0]).toBe(0);
  await expect(broker.prompt({ id: 2, ...request() })).rejects.toThrow();
  broker.close();
});
it('fails the owner if cancellation cannot be delivered instead of keeping an unowned prompt', async () => {
  const root = new AbortController(),
    scope = new AbortController(),
    held = gate(),
    failed = vi.fn(),
    proof = createWorkerPasskey(
      {
        request: (async (method: string) => {
          if (method === 'passkeyCancel') throw Error('credits exhausted');
          await held.promise;
          return assertion();
        }) as any,
        closed: false,
      },
      root.signal,
      () => {},
      failed,
    );
  const pending = proof(request(scope.signal));
  void pending.catch(() => {});
  scope.abort();
  await tick();
  expect(failed).toHaveBeenCalledOnce();
  held.resolve();
  await expect(pending).rejects.toThrow();
});
it('rejects already canceled requests without sending any prompt or consuming a sequence', async () => {
  const root = new AbortController(),
    scope = new AbortController(),
    rpc = vi.fn(async (_method: string, _input: unknown) => assertion()),
    proof = createWorkerPasskey(
      { request: rpc as any, closed: false },
      root.signal,
      () => {},
      vi.fn(),
    );
  scope.abort();
  await expect(proof(request(scope.signal))).rejects.toThrow();
  expect(rpc).not.toHaveBeenCalled();
  await proof(request());
  expect(rpc.mock.calls[0]![1]).toMatchObject({ id: 1 });
});
it('refuses accessor, extra-field and oversized prompt messages before calling the provider', async () => {
  const root = new AbortController(),
    provider = vi.fn(async () => assertion()),
    broker = createWindowPasskey(provider, root.signal, () => {});
  let reads = 0;
  for (const v of [
    { id: 1, ...request(), token: 'not-a-proof' },
    { id: 1, ...request(), challenge: new Uint8Array(new ArrayBuffer(8192), 0, 1) },
    {
      id: 1,
      ...request(),
      get credentialId() {
        reads++;
        return 'a';
      },
    },
  ])
    await expect(broker.prompt(v)).rejects.toThrow();
  expect(reads).toBe(0);
  expect(provider).not.toHaveBeenCalled();
  broker.close();
});
it('allows the next exact prompt after a provider refusal without canceling the editor', async () => {
  const root = new AbortController();
  let calls = 0;
  const broker = createWindowPasskey(
    async () => {
      if (!calls++) throw Error('provider refusal');
      return assertion();
    },
    root.signal,
    () => {},
  );
  await expect(broker.prompt({ id: 1, ...request() })).rejects.toThrow('provider refusal');
  await expect(broker.prompt({ id: 2, ...request() })).resolves.toMatchObject({
    credentialId: 'aGVsbG8',
  });
  expect(root.signal.aborted).toBe(false);
  broker.close();
});
it('delivers scoped cancellation over real bidirectional ports while the original prompt RPC awaits', async () => {
  const root = new AbortController(),
    scope = new AbortController(),
    held = gate(),
    ports = new MessageChannel(),
    owner = '13'.repeat(16);
  let seen: LocalPasskeyRequest | undefined;
  const broker = createWindowPasskey(
      async (p) => {
        seen = p;
        await held.promise;
        return assertion();
      },
      root.signal,
      () => {},
    ),
    window = createWorkerChannel(
      ports.port1,
      owner,
      { passkey: broker.prompt, passkeyCancel: broker.cancel },
      () => {},
    ),
    worker = createWorkerChannel(ports.port2, owner, {}, () => {});
  disposers.push(
    () => window.close(),
    () => worker.close(),
    broker.close,
  );
  const proof = createWorkerPasskey(worker, root.signal, () => {}, vi.fn()),
    pending = proof(request(scope.signal));
  void pending.catch(() => {});
  await vi.waitFor(() => expect(seen).toBeDefined());
  scope.abort();
  await vi.waitFor(() => expect(seen!.signal!.aborted).toBe(true));
  expect(worker.pending).toBeGreaterThanOrEqual(1);
  held.resolve();
  await expect(pending).rejects.toThrow();
  await expect(proof(request())).resolves.toMatchObject({ credentialId: 'aGVsbG8' });
  expect(root.signal.aborted).toBe(false);
});
