// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fc from 'fast-check';
import {
  beginLocalGenesis,
  inspectLocalStartup,
  listLocalWorkspaces,
  openLocalWorkspace,
  resumeLocalGenesis,
} from '../src/crdt/localGenesis';
import { createLocalStartup } from '../src/ui/localStartup';
import type { WorkspaceStartupResult } from '../src/crdt/ownedStartup';
import type { AdmittedWorkspace } from '../src/crdt/admittedWorkspace';
import type { StartupKind } from '../src/crdt/startupState';

vi.mock('../src/crdt/localGenesis', () => ({
  beginLocalGenesis: vi.fn(),
  inspectLocalStartup: vi.fn(),
  listLocalWorkspaces: vi.fn(),
  openLocalWorkspace: vi.fn(),
  resumeLocalGenesis: vi.fn(),
}));
const inspect = vi.mocked(inspectLocalStartup);
const open = vi.mocked(openLocalWorkspace);
const routes = vi.mocked(listLocalWorkspaces);
const begin = vi.mocked(beginLocalGenesis);
const resume = vi.mocked(resumeLocalGenesis);
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
};
const ready = () => {
  const close = vi.fn(async () => {});
  const workspace = {
    close,
    exportEntries: () => [{ path: 'master.md', content: 'private writing' }],
    onStatus: vi.fn(() => () => {}),
  } as unknown as AdmittedWorkspace;
  return { close, result: { kind: 'ready', workspace } as WorkspaceStartupResult };
};
beforeEach(() => {
  vi.resetAllMocks();
  inspect.mockResolvedValue({ kind: 'unlock-required', reason: 'test' });
  routes.mockResolvedValue([
    { principal: 'verified-principal', workspace: 'workspace', dbName: 'database' },
  ]);
  open.mockResolvedValue(ready().result);
});

describe('Local application lifetime', () => {
  it('keeps blocked admission open for retry and retires editors before closing the workspace', async () => {
    const owned = ready();
    if (owned.result.kind !== 'ready') throw Error('Expected ready fixture.');
    const events: string[] = [];
    owned.close.mockImplementation(async () => {
      events.push('workspace');
    });
    open.mockResolvedValue(owned.result);
    const owner = createLocalStartup();
    await owner.inspect();
    await owner.unlock('code');
    owner.registerEditor(() => events.push('editor'));
    const changed = vi.mocked(owned.result.workspace.onStatus).mock.calls[0]![0];
    changed({
      state: 'blocked',
      revision: 1,
      pendingItems: 1,
      pendingBytes: 1,
      reservedBytes: 1,
      durable: false,
      pressure: { code: 'quota' },
    });
    expect(owner.getSnapshot().kind).toBe('ready');
    expect(events).toEqual([]);
    await owner.close();
    expect(events).toEqual(['editor', 'workspace']);
  });
  it('keeps confirmation separate from displaying the generated code', async () => {
    inspect.mockResolvedValue({ kind: 'fresh', reason: 'test' });
    const cancel = vi.fn();
    const confirm = vi.fn(async () => ({
      kind: 'created' as const,
      scope: { slotId: 'local', principalId: 'p', workspaceId: 'w' },
      storeId: 's',
    }));
    begin.mockReturnValue({ displayCode: 'saved-code', confirm, cancel });
    const owner = createLocalStartup();
    await owner.inspect();
    owner.begin();
    await owner.confirm('saved-code');
    expect(confirm).not.toHaveBeenCalled();
    owner.saved();
    expect(JSON.stringify(owner.getSnapshot())).not.toContain('saved-code');
    await owner.confirm('saved-code');
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(owner.getSnapshot().kind).toBe('ready');
    const options = open.mock.calls[0]![2];
    expect(options.identity.id).toBe('verified-principal');
    expect(() => options.validateReceive(new Uint8Array())).toThrow();
    await owner.close();
    expect(JSON.stringify(owner.getSnapshot())).not.toContain('private writing');
  });

  it('resumes retained creation after a fresh classification, never reenrolls it', async () => {
    inspect.mockResolvedValue({ kind: 'creation-pending', reason: 'test' });
    const owner = createLocalStartup();
    await owner.inspect();
    await owner.unlock('existing-code');
    expect(resume).toHaveBeenCalledWith('local', 'existing-code', expect.anything());
    expect(begin).not.toHaveBeenCalled();
    expect(owner.getSnapshot().kind).toBe('ready');
    await owner.close();
  });

  it('rejects stale unlock hints when the retained state changes', async () => {
    const owner = createLocalStartup();
    await owner.inspect();
    inspect.mockResolvedValue({ kind: 'cleared', reason: 'test' });
    await owner.unlock('existing-code');
    expect(owner.getSnapshot().kind).toBe('cleared');
    expect(routes).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    await owner.close();
  });

  it('detaches the carrier listener when a subscriber locks at the ready handoff', async () => {
    const owned = ready();
    const detach = vi.fn();
    if (owned.result.kind !== 'ready') throw Error('Expected ready fixture.');
    vi.mocked(owned.result.workspace.onStatus).mockReturnValue(detach);
    open.mockResolvedValue(owned.result);
    const owner = createLocalStartup();
    await owner.inspect();
    owner.subscribe(() => {
      if (owner.getSnapshot().kind === 'ready') void owner.close();
    });
    await owner.unlock('existing-code');
    await owner.close();
    expect(detach).toHaveBeenCalledTimes(1);
    expect(owned.close).toHaveBeenCalledTimes(1);
    expect(owner.getSnapshot().kind).toBe('closing');
  });

  it('generated UI action sequences cannot turn a refusal into fresh enrollment', async () => {
    const kinds: StartupKind[] = [
      'migration-required',
      'clearing',
      'cleared',
      'repair-required',
      'slot-closed',
      'identity-required',
      'busy',
      'unavailable',
      'unsupported',
    ];
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...kinds),
        fc.array(fc.constantFrom('begin', 'saved', 'confirm', 'unlock'), { maxLength: 25 }),
        async (kind, actions) => {
          vi.clearAllMocks();
          inspect.mockResolvedValue({ kind, reason: 'test' });
          const owner = createLocalStartup();
          await owner.inspect();
          for (const action of actions) {
            if (action === 'confirm' || action === 'unlock') await owner[action]('code');
            else owner[action]();
          }
          expect(owner.getSnapshot().kind).toBe(kind);
          expect(begin).not.toHaveBeenCalled();
          expect(open).not.toHaveBeenCalled();
          await owner.close();
        },
      ),
      { numRuns: 100, seed: 8941 },
    );
  });

  it('generated close timing never publishes a late unlock or leaks its workspace', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 8 }), async (turns) => {
        vi.clearAllMocks();
        const pending = deferred<WorkspaceStartupResult>();
        open.mockReturnValue(pending.promise);
        const owned = ready();
        const owner = createLocalStartup();
        await owner.inspect();
        const observed: string[] = [];
        owner.subscribe(() => {
          observed.push(owner.getSnapshot().kind);
        });
        const unlocking = owner.unlock('existing-code');
        for (let turn = 0; turn < turns; turn++) await Promise.resolve();
        const stopping = owner.close();
        const stopIndex = observed.length;
        pending.resolve(owned.result);
        await Promise.all([unlocking, stopping]);
        expect(observed.slice(stopIndex)).not.toContain('ready');
        expect(owned.close).toHaveBeenCalledTimes(open.mock.calls.length ? 1 : 0);
        expect(owner.getSnapshot().kind).toBe('closing');
      }),
      { numRuns: 50, seed: 8941 },
    );
  });

  it('waits for an in-flight inspection when a subscriber closes during the working notification', async () => {
    const pending = deferred<Awaited<ReturnType<typeof inspectLocalStartup>>>();
    inspect.mockReturnValue(pending.promise);
    const owner = createLocalStartup();
    let drained = false;
    owner.subscribe(() => {
      if (owner.getSnapshot().kind === 'working')
        void owner.close().then(() => {
          drained = true;
        });
    });
    const inspecting = owner.inspect();
    for (let turn = 0; turn < 10; turn++) await Promise.resolve();
    expect(drained).toBe(false);
    pending.resolve({ kind: 'fresh', reason: 'test' });
    await inspecting;
    await owner.close();
    expect(drained).toBe(true);
    expect(owner.getSnapshot().kind).toBe('closing');
  });
});
