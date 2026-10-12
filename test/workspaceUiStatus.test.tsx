import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import {
  WorkspaceUiProvider,
  useWorkspaceUi,
  useWorkspaceAdmissionState,
} from '../src/ui/workspaceUi';
import type { AdmittedWorkspace } from '../src/crdt/admittedWorkspace';

afterEach(() => vi.unstubAllGlobals());
function fixture() {
  let status: AdmittedWorkspace['status'] = {
    state: 'active',
    revision: 0,
    pendingItems: 0,
    pendingBytes: 0,
    reservedBytes: 0,
    durable: true,
    pressure: null,
  };
  let snapshot = { master: 'original' };
  const statuses = new Set<(s: typeof status) => void>();
  const content = new Set<() => void>();
  const workspace = {
    get status() {
      return { ...status };
    },
    read: () => snapshot,
    onStatus: (f: (s: typeof status) => void) => {
      statuses.add(f);
      return () => {
        statuses.delete(f);
      };
    },
    subscribe: (f: () => void) => {
      content.add(f);
      return () => {
        content.delete(f);
      };
    },
    retry: vi.fn(() => change({ state: 'active', pendingItems: 0 })),
    discardPending: vi.fn(() => change({ state: 'active', pendingItems: 0 })),
    command: vi.fn(() => ({ accepted: Promise.reject(Error('storage')) })),
  } as unknown as AdmittedWorkspace;
  const change = (patch: Partial<typeof status>) => {
    status = { ...status, ...patch };
    for (const f of statuses) f({ ...status });
  };
  return {
    workspace,
    change,
    statuses,
    content,
    publish() {
      snapshot = { master: 'changed' };
      for (const f of content) f();
    },
  };
}
it('isolates queue churn while warnings, availability, retry/discard and content stay current', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const f = fixture(),
    host = document.createElement('div'),
    root = createRoot(host);
  let renders = 0,
    mounts = 0,
    availabilityRenders = 0;
  function Content() {
    const ui = useWorkspaceUi();
    renders++;
    useEffect(() => {
      mounts++;
    }, []);
    return (
      <>
        <output>{ui.snapshot.master}</output>
        <button onClick={() => void ui.execute({ kind: 'undo' })}>Command</button>
      </>
    );
  }
  function Availability() {
    const state = useWorkspaceAdmissionState();
    availabilityRenders++;
    return <button disabled={state !== 'active'}>Action</button>;
  }
  const register = () => () => {};
  try {
    await act(async () =>
      root.render(
        <WorkspaceUiProvider
          workspace={f.workspace}
          actorId="test"
          onLock={() => {}}
          registerEditor={register}
        >
          <Content />
          <Availability />
        </WorkspaceUiProvider>,
      ),
    );
    const before = renders,
      beforeAvailability = availabilityRenders;
    for (const pendingItems of [1, 2, 1]) {
      await act(async () => f.change({ pendingItems, durable: false }));
      expect(host.querySelector('[role=status]')?.textContent).toContain(
        'Input is waiting to be saved.',
      );
    }
    expect(renders).toBe(before);
    expect(availabilityRenders).toBe(beforeAvailability);
    await act(async () => f.change({ state: 'blocked', pressure: { code: 'quota' } }));
    const button = (text: string) =>
      [...host.querySelectorAll('button')].find((b) => b.textContent === text)!;
    expect(button('Action').disabled).toBe(true);
    expect(host.textContent).toContain('Input is waiting for storage.');
    await act(async () => button('Retry storage').click());
    expect(f.workspace.retry).toHaveBeenCalledOnce();
    expect(button('Action').disabled).toBe(false);
    expect(host.querySelector('[role=status]')).toBeNull();
    await act(async () => f.change({ state: 'blocked', pendingItems: 1 }));
    await act(async () => button('Discard pending input').click());
    expect(f.workspace.discardPending).toHaveBeenCalledOnce();
    expect(host.querySelector('[role=status]')).toBeNull();
    for (const state of ['closing', 'closed', 'failed', 'active'] as const) {
      await act(async () => f.change({ state }));
      expect(button('Action').disabled).toBe(state !== 'active');
    }
    await act(async () => button('Command').click());
    expect(host.textContent).toContain('That action was not saved.');
    await act(async () => button('Dismiss').click());
    expect(host.querySelector('[role=status]')).toBeNull();
    expect(renders).toBe(before); // Even feedback is separate from content/actions.
    await act(async () => f.publish());
    expect(host.querySelector('output')?.textContent).toBe('changed');
    expect(renders).toBeGreaterThan(before);
    expect(mounts).toBe(1);
  } finally {
    await act(async () => root.unmount());
  }
  expect(f.statuses.size).toBe(0);
  expect(f.content.size).toBe(0);
});
it('detaches replaced owners and requests persistence once, accepting a late result across revisions', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const a = fixture(),
    b = fixture(),
    host = document.createElement('div'),
    root = createRoot(host);
  let finish!: (v: boolean) => void;
  const persist = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
  );
  vi.stubGlobal('navigator', { storage: { persisted: async () => false, persist } });
  function Storage() {
    const ui = useWorkspaceUi();
    const state = useWorkspaceAdmissionState();
    return (
      <output>
        {ui.storage}:{state}
      </output>
    );
  }
  const render = (workspace: AdmittedWorkspace) =>
    root.render(
      <WorkspaceUiProvider
        workspace={workspace}
        actorId="test"
        onLock={() => {}}
        registerEditor={() => () => {}}
      >
        <Storage />
      </WorkspaceUiProvider>,
    );
  try {
    await act(async () => render(a.workspace));
    await act(async () => a.change({ revision: 1 }));
    await act(async () => a.change({ revision: 2 }));
    expect(persist).toHaveBeenCalledOnce();
    await act(async () => finish(true));
    expect(host.textContent).toBe('Persistent:active');
    await act(async () => a.change({ state: 'blocked', pendingItems: 1 }));
    await act(async () => render(b.workspace));
    expect(a.statuses.size).toBe(0);
    expect(a.content.size).toBe(0);
    expect(host.querySelector('[role=status]')).toBeNull();
    expect(host.textContent).toBe('Best-effort:active');
    expect(persist).toHaveBeenCalledOnce();
    await act(async () => b.change({ revision: 1 }));
    expect(persist).toHaveBeenCalledTimes(2);
    await act(async () => render(a.workspace));
    await act(async () => finish(true));
    expect(host.textContent).toContain('Best-effort:blocked'); // Old owner's reply is ignored.
  } finally {
    await act(async () => root.unmount());
  }
  expect(a.statuses.size + b.statuses.size).toBe(0);
});
