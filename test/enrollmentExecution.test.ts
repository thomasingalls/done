// @vitest-environment node
/** Execution/provider wiring only; original native/service verification has separate actual evidence. */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { createDeviceEnrollmentCoordinator } from '../src/account/deviceEnrollment';
import { createMembershipEnrollmentCoordinator } from '../src/account/membershipEnrollment';
import {
  createPageDeviceEnrollmentBrowser,
  createPageMembershipEnrollmentBrowser,
  type EnrollmentWorkspaceExecution,
  type EnrollmentBrowser,
} from '../src/account/enrollmentExecution';
import type { SetupWorkspacePort } from '../src/account/setupWorkspace';
import type { SetupConfig } from '../src/account/setupProgress';
import type { DeviceRoster } from '../src/account/deviceRoster';
const mocked = vi.hoisted(() => ({ joined: vi.fn() }));
vi.mock('../src/crdt/joinedAccount', () => ({ hasJoinedAccount: mocked.joined }));
const config: SetupConfig = {
  networkSessions: true,
  pin: {
    v: 1,
    origin: 'https://enrollment.test',
    rpId: 'enrollment.test',
    serviceId: 'ab'.repeat(16),
    authRoot: 'cd'.repeat(32),
  },
};
const cleanup: (() => Promise<void>)[] = [];
beforeEach(() => {
  vi.stubGlobal('location', { origin: config.pin.origin });
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  mocked.joined
    .mockReset()
    .mockResolvedValue({ workspaceId: 'workspace', principalId: 'principal' });
});
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
  vi.unstubAllGlobals();
});
function fixture() {
  const workspace: SetupWorkspacePort = {
    status: {
      state: 'active',
      revision: 0,
      pendingItems: 0,
      pendingBytes: 0,
      reservedBytes: 0,
      durable: true,
      pressure: null,
    },
    onStatus: vi.fn(() => () => {}),
    whenDurable: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  };
  const open = vi.fn(async () => ({
      workspace,
      devices: {} as DeviceRoster,
      accountId: 'fixture-account',
    })),
    execution: EnrollmentWorkspaceExecution<SetupWorkspacePort> = { open };
  const browser: EnrollmentBrowser = { authenticate: vi.fn(), assertSlot: vi.fn() };
  return { workspace, open, execution, browser };
}
it('legacy device coordinator opens a genuine joined execution surface without needing a document or command facade', async () => {
  const f = fixture(),
    owner = createDeviceEnrollmentCoordinator(
      f.execution,
      () => f.browser,
      config,
      'enrollment-' + 'ab'.repeat(16),
      'fictional',
      'new',
      'workspace',
    );
  cleanup.push(owner.close);
  const view = await owner.refresh();
  expect(view.kind).toBe('editing');
  expect(view.editor?.workspace).toBe(f.workspace);
  expect(view.editor?.accountId).toBe('fixture-account');
  expect('read' in f.workspace).toBe(false);
  expect('command' in f.workspace).toBe(false);
  expect(f.open.mock.calls).toHaveLength(1);
  expect(f.open).toHaveBeenCalledWith(
    expect.objectContaining({
      slotId: 'enrollment-' + 'ab'.repeat(16),
      assertPasskey: f.browser.assertSlot,
      identity: expect.objectContaining({ id: 'principal' }),
    }),
    expect.any(Function),
    true,
  );
  expect(f.browser.authenticate).not.toHaveBeenCalled();
});
it('membership coordinator uses the same minimal joined execution contract and original participant identity', async () => {
  const f = fixture(),
    owner = createMembershipEnrollmentCoordinator(
      f.execution,
      () => f.browser,
      config,
      'enrollment-' + 'ab'.repeat(16),
      'fictional',
      'new',
      'workspace',
    );
  cleanup.push(owner.close);
  const view = await owner.refresh();
  expect(view.kind).toBe('editing');
  expect(view.editor?.workspace).toBe(f.workspace);
  expect(f.open).toHaveBeenCalledWith(
    expect.objectContaining({
      membershipContinuation: true,
      assertPasskey: f.browser.assertSlot,
      identity: expect.objectContaining({ id: 'principal' }),
    }),
    expect.any(Function),
    true,
  );
  await owner.close();
  expect(f.workspace.close).toHaveBeenCalledOnce();
});
it('a mismatched retained workspace refuses before either execution factory opens', async () => {
  const f = fixture(),
    legacy = createDeviceEnrollmentCoordinator(
      f.execution,
      () => f.browser,
      config,
      'enrollment-' + 'ac'.repeat(16),
      'fictional',
      'new',
      'other',
    ),
    membership = createMembershipEnrollmentCoordinator(
      f.execution,
      () => f.browser,
      config,
      'enrollment-' + 'ad'.repeat(16),
      'fictional',
      'new',
      'other',
    );
  cleanup.push(legacy.close, membership.close);
  await expect(legacy.refresh()).rejects.toThrow('differs');
  await expect(membership.refresh()).rejects.toThrow('differs');
  expect(f.open).not.toHaveBeenCalled();
});
it('Page enrollment providers preserve parser, scope and distinct cancellation messages', async () => {
  const get = vi.fn().mockResolvedValue(null),
    parse = vi.fn((v) => v),
    guard = vi.fn(),
    signal = new AbortController().signal;
  vi.stubGlobal('navigator', { credentials: { get } });
  vi.stubGlobal('PublicKeyCredential', { parseRequestOptionsFromJSON: parse });
  const options = { challenge: 'fixture' };
  await expect(
    createPageDeviceEnrollmentBrowser(signal, guard).authenticate(options, signal),
  ).rejects.toThrow('Passkey cancelled');
  await expect(
    createPageMembershipEnrollmentBrowser(signal, guard).authenticate(options, signal),
  ).rejects.toThrow('Passkey request cancelled');
  expect(parse).toHaveBeenNthCalledWith(1, options);
  expect(get).toHaveBeenNthCalledWith(1, { publicKey: options, signal });
  expect(guard).toHaveBeenCalledTimes(2);
});
it('Page enrollment refuses a late assertion through the original lifetime guard before encoding', async () => {
  const stop = new AbortController();
  let finish!: (v: unknown) => void;
  vi.stubGlobal('navigator', {
    credentials: { get: () => new Promise((resolve) => (finish = resolve)) },
  });
  vi.stubGlobal('PublicKeyCredential', { parseRequestOptionsFromJSON: (v: unknown) => v });
  const browser = createPageMembershipEnrollmentBrowser(stop.signal, () =>
      stop.signal.throwIfAborted(),
    ),
    pending = browser.authenticate({ challenge: 'fixture' }, stop.signal);
  stop.abort();
  finish({
    get response() {
      throw Error('late encoding touched');
    },
  });
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
});
