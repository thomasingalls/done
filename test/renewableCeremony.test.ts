// @vitest-environment node
/** Display replacement ordering only; fake lifetimes grant no native permit or storage access. */
import { expect, it, vi } from 'vitest';
import { renewCeremonyOnCommand } from '../src/ui/renewableCeremony';
const gate = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};
function fixture() {
  const drain = gate(),
    commands: unknown[] = [],
    listeners = new Set<() => void>();
  const first = {
    failed: true,
    send: vi.fn(),
    getSnapshot: () => 'failed',
    subscribe: (f: () => void) => {
      listeners.add(f);
      return () => {
        listeners.delete(f);
      };
    },
    close: vi.fn(() => drain.promise),
    whenIdle: vi.fn(async () => {}),
    command: vi.fn(async (v: unknown) => commands.push(v)),
  };
  const second = {
    ...first,
    failed: false,
    getSnapshot: () => 'fresh',
    close: vi.fn(async () => {}),
    command: vi.fn(async (v: unknown) => commands.push(v)),
  };
  const factory = vi.fn((initial: boolean) => (initial ? first : second));
  return { first, second, factory, drain, commands, listeners };
}
it('never constructs a replacement before successful native drain, and re-inspects before new explicit input', async () => {
  const f = fixture(),
    o = renewCeremonyOnCommand(f.factory, { command: 'inspect' }),
    run = o.command({ command: 'unlock', value: 'new-input' });
  expect(f.factory).toHaveBeenCalledTimes(1);
  expect(f.first.close).toHaveBeenCalledOnce();
  f.drain.resolve();
  await run;
  expect(f.factory.mock.calls).toEqual([[true], [false]]);
  expect(f.commands).toEqual([{ command: 'inspect' }, { command: 'unlock', value: 'new-input' }]);
  expect(f.listeners.size).toBe(1);
  await o.close();
});
it('concurrent explicit commands share one replacement and original initial-code getter is first-incarnation only', async () => {
  const f = fixture(),
    o = renewCeremonyOnCommand(f.factory, { command: 'inspect' });
  const a = o.command({ command: 'a' }),
    b = o.command({ command: 'b' });
  f.drain.resolve();
  await Promise.all([a, b]);
  expect(f.factory).toHaveBeenCalledTimes(2);
  expect(f.commands).toEqual([{ command: 'inspect' }, { command: 'a' }, { command: 'b' }]);
  await o.close();
});
it('explicit screen close during drain forbids any replacement or queued input', async () => {
  const f = fixture(),
    o = renewCeremonyOnCommand(f.factory, { command: 'inspect' }),
    run = o.command({ command: 'unlock' }),
    refused = expect(run).rejects.toThrow('closed');
  const close = o.close();
  f.drain.resolve();
  await refused;
  await close;
  expect(f.factory).toHaveBeenCalledTimes(1);
  expect(f.commands).toEqual([]);
  expect(o.close()).toBe(close);
});
it('failed native cleanup cannot be turned into a retry', async () => {
  const f = fixture();
  f.first.close.mockImplementation(() => Promise.reject(Error('native cleanup refused')));
  const o = renewCeremonyOnCommand(f.factory, { command: 'inspect' });
  await expect(o.command({ command: 'unlock' })).rejects.toThrow('native cleanup refused');
  expect(f.factory).toHaveBeenCalledTimes(1);
});
it('without a reviewed retry command the old display cannot recreate ceremony authority', async () => {
  const f = fixture(),
    o = renewCeremonyOnCommand(f.factory, undefined);
  await expect(o.command({ command: 'anything' })).rejects.toThrow('Unlock');
  expect(f.factory).toHaveBeenCalledTimes(1);
  f.drain.resolve();
  await o.close();
});
