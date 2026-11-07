// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { createNativeLostRecoveryController } from '../src/crdt/workerLostDeviceRecovery';
import {
  recoveryPresentation,
  captureRecoveryCommand,
} from '../src/account/recoveryWorkerProtocol';
import type { NativeCeremonyUiContext } from '../src/crdt/workerCeremonyUi';
const mocks = vi.hoisted(() => ({
  begin: vi.fn(),
  resume: vi.fn(),
  finish: vi.fn(),
  open: vi.fn(),
  inspect: vi.fn(),
}));
vi.mock('../src/account/lostDeviceRecovery', () => ({
  beginLostDeviceRecovery: mocks.begin,
  resumeLostDeviceRecovery: mocks.resume,
  finishLostDeviceRecovery: mocks.finish,
  openRecoveredWorkspaceWithExecution: mocks.open,
}));
vi.mock('../src/crdt/localGenesis', () => ({ inspectLocalStartup: mocks.inspect }));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.inspect.mockResolvedValue({ kind: 'fresh' });
  mocks.finish.mockResolvedValue(undefined);
});
function fixture() {
  const stop = new AbortController(),
    fresh = { kind: 'fresh-recovery-opening' },
    early = {
      accountId: 'account',
      prepare: vi.fn(async () => 'new-device-code'),
      confirm: vi.fn(async () => ({ opening: fresh })),
      close: vi.fn(),
    },
    workspace = { close: vi.fn(async () => {}) },
    login = { close: vi.fn() };
  mocks.begin.mockResolvedValue(early);
  mocks.open.mockResolvedValue({
    editor: { workspace },
    login,
    actorId: 'actor',
    accountId: 'account',
  });
  const context = {
    slotId: 'enrollment-' + '12'.repeat(16),
    config: {},
    signal: stop.signal,
    browser: { authenticate: vi.fn(), assertSlot: vi.fn() },
    execution: {},
    saveRecoveryRoute: vi.fn(),
    publish: vi.fn(),
  } as unknown as NativeCeremonyUiContext;
  const owner = createNativeLostRecoveryController(context);
  const run = async (command: string, value?: string) => {
    await owner.command({ command, ...(value === undefined ? {} : { value }) }).run();
    return owner.snapshot()['state'] as ReturnType<typeof recoveryPresentation>;
  };
  return { stop, fresh, early, workspace, login, context, owner, run };
}
async function review(f: ReturnType<typeof fixture>) {
  await f.run('inspect');
  await f.run('begin');
  await f.run('prepare', 'fictional-recovery-code');
  await f.run('savedCode');
  await f.run('confirm', 'new-device-code');
}
it('retains original browser and hint effects and never commits before the explicit review action', async () => {
  const f = fixture();
  await review(f);
  expect(mocks.finish).not.toHaveBeenCalled();
  expect(mocks.open).not.toHaveBeenCalled();
  expect(f.owner.snapshot()).toEqual({
    state: { step: 'review', accountId: 'account', generated: '', error: '' },
  });
  const opts = mocks.begin.mock.calls[0]![1];
  expect(opts.signal).toBe(f.context.signal);
  expect(opts.assert).toBe(f.context.browser.authenticate);
  expect(opts.rememberRoute).toBe(f.context.saveRecoveryRoute);
});
it('passes the exact same-realm fresh opening and retained confirmed factor only to native execution', async () => {
  const f = fixture();
  await review(f);
  const value = await f.run('recover');
  expect(mocks.finish).toHaveBeenCalledExactlyOnceWith(
    f.context.config,
    f.context.slotId,
    'new-device-code',
    f.context.signal,
  );
  const args = mocks.open.mock.calls[0]!;
  expect(args[0]).toBe(f.context.execution);
  expect(args[1](f.context.signal)).toBe(f.context.browser.assertSlot);
  expect(args[6]).toBe(f.fresh);
  expect(value).toEqual({
    step: 'editing',
    accountId: 'account',
    generated: '',
    error: '',
    editor: { actorId: 'actor', accountId: 'account' },
  });
  expect(JSON.stringify(value)).not.toContain('new-device-code');
});
it('keeps the generated code and confirmation step after a wrong confirmation, without authorizing recovery', async () => {
  const f = fixture();
  await f.run('inspect');
  await f.run('begin');
  await f.run('prepare', 'fictional-recovery-code');
  await f.run('savedCode');
  f.early.confirm.mockRejectedValueOnce(Error('Enter the saved code.'));
  const wrong = await f.run('confirm', 'wrong');
  expect(wrong).toEqual({
    step: 'confirm-code',
    accountId: 'account',
    generated: 'new-device-code',
    error: 'Enter the saved code.',
  });
  expect(mocks.finish).not.toHaveBeenCalled();
  expect((await f.run('confirm', 'new-device-code')).step).toBe('review');
});
it('refuses out-of-order commit/open commands and unknown/accessor data', async () => {
  const f = fixture();
  expect((await f.run('recover')).error).toMatch('current recovery step');
  expect((await f.run('openWriting')).error).toMatch('current recovery step');
  expect(mocks.finish).not.toHaveBeenCalled();
  expect(mocks.open).not.toHaveBeenCalled();
  const read = vi.fn();
  expect(() =>
    captureRecoveryCommand({
      command: 'begin',
      get value() {
        return read();
      },
    }),
  ).toThrow();
  expect(read).not.toHaveBeenCalled();
});
it('does not reuse a fresh approval on authenticated resume of an installed account', async () => {
  const f = fixture();
  mocks.inspect.mockResolvedValue({ kind: 'ready' });
  mocks.resume.mockResolvedValue({ stage: 'installed' });
  await f.run('inspect');
  await f.run('unlock', 'retained-device-code');
  await f.run('openWriting');
  expect(mocks.open.mock.calls[0]![6]).toBeUndefined();
  expect(mocks.finish).not.toHaveBeenCalled();
});
it('joins a late acquired preparation and erases visible codes on close', async () => {
  const f = fixture();
  await f.run('inspect');
  let release!: (v: typeof f.early) => void;
  mocks.begin.mockReturnValue(new Promise((resolve) => (release = resolve)));
  const pending = f.run('begin');
  const refused = expect(pending).rejects.toThrow('closed');
  let done = false;
  const closing = f.owner.close().then(() => (done = true));
  await Promise.resolve();
  expect(done).toBe(false);
  release(f.early);
  await refused;
  await closing;
  expect(f.early.close).toHaveBeenCalled();
  expect(f.owner.snapshot()).toEqual({
    state: { step: 'unlock', accountId: '', generated: '', error: '' },
  });
});
it('rejects editor/native objects, cross-account identities and codes outside the save/confirm screens', () => {
  for (const value of [
    { step: 'review', accountId: 'account', generated: 'secret', error: '' },
    {
      step: 'editing',
      accountId: 'account',
      generated: '',
      error: '',
      editor: { actorId: 'actor', accountId: 'other' },
    },
    {
      step: 'editing',
      accountId: 'account',
      generated: '',
      error: '',
      editor: { actorId: 'actor', accountId: 'account', workspace: {} },
    },
  ])
    expect(() => recoveryPresentation(value)).toThrow();
});
