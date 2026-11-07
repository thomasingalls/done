// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import type { AccountOwnerBootstrap } from '../src/crdt/accountWorkerOwner';
const ticket = {
  v: 1 as const,
  slotId: 'fictional',
  incarnation: 'ab'.repeat(16),
  windowClient: 'fictional-window',
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
it('same-realm owner entry refuses Window execution before accessing a supplied bootstrap', async () => {
  vi.stubGlobal('window', {});
  const { startAccountWorkerOwner } = await import('../src/crdt/accountWorkerOwner');
  let touched = false;
  const input = {
    get port() {
      touched = true;
      throw Error('not an endpoint');
    },
  };
  expect(() => startAccountWorkerOwner(input as never)).toThrow('Account Worker entry unavailable');
  expect(touched).toBe(false);
});
it('a non-native message endpoint cannot reserve the one-shot entry', async () => {
  vi.stubGlobal('window', undefined);
  vi.stubGlobal('isSecureContext', false);
  const { startAccountWorkerOwner } = await import('../src/crdt/accountWorkerOwner');
  expect(() => startAccountWorkerOwner({ port: {} } as never)).toThrow(
    'Account Worker entry unavailable',
  );
  const ports = new MessageChannel();
  try {
    expect(() =>
      startAccountWorkerOwner({
        ticket,
        port: ports.port1,
        activity: { visibility: 'visible', online: true },
      } as AccountOwnerBootstrap),
    ).toThrow('Web Locks requires a supported secure context.');
  } finally {
    ports.port1.close();
    ports.port2.close();
  }
});
it('a failed native runtime installation consumes the entry and cannot be rebound to another incarnation', async () => {
  vi.stubGlobal('window', undefined);
  vi.stubGlobal('isSecureContext', false);
  const { startAccountWorkerOwner } = await import('../src/crdt/accountWorkerOwner');
  const ports = new MessageChannel();
  try {
    const input = {
      ticket,
      port: ports.port1,
      activity: { visibility: 'visible' as const, online: true },
    };
    expect(() => startAccountWorkerOwner(input as AccountOwnerBootstrap)).toThrow();
    expect(() =>
      startAccountWorkerOwner({
        ...input,
        ticket: { ...ticket, incarnation: 'cd'.repeat(16) },
      } as AccountOwnerBootstrap),
    ).toThrow('Account Worker entry unavailable');
  } finally {
    ports.port1.close();
    ports.port2.close();
  }
});
