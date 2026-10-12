import { SyncNotice } from './SyncNotice';
import type { SyncRuntime } from '../crdt/accountSyncDriver';
import type { NetworkLogin } from '../account/networkLogin';
/** Read projections and admitted commands for the application. No Y.Doc or legacy Store crosses this port. */
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import type { Extension } from '@codemirror/state';
import { createAdmittedEditor } from '../editor/admittedEditor';
import { masterLineSelection } from '../editor/masterLineSelection';
import type {
  AdmittedWorkspace,
  TextTarget,
  WorkspaceCommand,
  WorkspaceSnapshot,
} from '../crdt/admittedWorkspace';

interface CommandFeedback {
  /** The caller owns any completed-action error message instead of the workspace banner. */
  feedback?: 'local';
}

export interface WorkspaceUi {
  workspace: AdmittedWorkspace;
  sync?: SyncRuntime | undefined;
  snapshot: WorkspaceSnapshot;
  actorId: string;
  storage: string;
  execute(command: WorkspaceCommand, options?: CommandFeedback): Promise<unknown>;
  removeMasterLines(lines: readonly number[], options?: CommandFeedback): Promise<boolean>;
  mountEditor(
    parent: HTMLElement,
    target: TextTarget,
    extra?: readonly Extension[],
    placeholder?: string,
  ): ReturnType<typeof createAdmittedEditor>;
  lock(): void;
  connectAccount?: () => void;
  accountWorkspace: boolean;
  accountId?: string;
  switchAccount?: () => void;
  networkLogin?: NetworkLogin;
  devices?: import('../account/deviceRoster').DeviceRoster;
  showDevices?: () => void;
}
const Context = createContext<WorkspaceUi | null>(null);
export const useWorkspaceUi = (): WorkspaceUi => {
  const value = useContext(Context);
  if (!value) throw Error('The editor needs an owned Local workspace.');
  return value;
};

export const WorkspaceUiProvider = ({
  workspace,
  sync,
  actorId,
  registerEditor,
  onLock,
  onConnectAccount,
  accountWorkspace = false,
  accountId,
  onSwitchAccount,
  networkLogin,
  devices,
  onShowDevices,
  children,
}: {
  workspace: AdmittedWorkspace;
  sync?: SyncRuntime | undefined;
  actorId: string;
  registerEditor: (destroy: () => void) => () => void;
  onLock: () => void;
  onConnectAccount?: () => void;
  accountWorkspace?: boolean;
  accountId?: string;
  onSwitchAccount?: () => void;
  networkLogin?: NetworkLogin;
  devices?: import('../account/deviceRoster').DeviceRoster;
  onShowDevices?: () => void;
  children: React.ReactNode;
}) => {
  const [snapshot, setSnapshot] = useState(() => workspace.read());
  const [error, setError] = useState('');
  const [storage, setStorage] = useState('Unknown');
  useLayoutEffect(() => {
    const update = () => {
      try {
        setSnapshot(workspace.read());
      } catch {
        /* Startup owns invalidation and removal. */
      }
    };
    const unsubscribe = workspace.subscribe(update);
    update();
    return () => {
      unsubscribe();
    };
  }, [workspace]);
  const actions = useMemo(
    () => ({
      async removeMasterLines(lines: readonly number[], options?: CommandFeedback) {
        try {
          if (options?.feedback !== 'local') setError('');
          const surface = workspace.text({ kind: 'master' });
          const selection = masterLineSelection(surface.read().text, lines);
          if (!selection) return false;
          await surface.input({ name: 'insert', text: '' }, selection).accepted;
          return true;
        } catch {
          if (options?.feedback !== 'local')
            setError('The selected lines were not removed. Check storage and try again.');
          return false;
        }
      },
      async execute(command: WorkspaceCommand, options?: CommandFeedback) {
        try {
          if (options?.feedback !== 'local') setError('');
          const result = await workspace.command(command).accepted;
          if (options?.feedback !== 'local' && (result.value === false || result.value === null)) {
            setError(
              'That action could not be applied. Check the destination and whether the day is frozen.',
            );
          }
          return result.value;
        } catch {
          if (options?.feedback !== 'local')
            setError('That action was not saved. Check storage and try again.');
          return false;
        }
      },
      mountEditor(
        parent: HTMLElement,
        target: TextTarget,
        extra: readonly Extension[] = [],
        placeholder?: string,
      ) {
        const handle = createAdmittedEditor({
          parent,
          document: workspace.text(target),
          extra,
          surface: target.kind === 'card' ? 'card' : 'document',
          ...(placeholder === undefined ? {} : { placeholder }),
        });
        let destroyed = false;
        let unregister = () => {};
        const destroy = () => {
          if (destroyed) return;
          destroyed = true;
          unregister();
          try {
            handle.destroy();
          } finally {
            parent.replaceChildren();
          }
        };
        unregister = registerEditor(destroy);
        return { view: handle.view, destroy };
      },
    }),
    [workspace, registerEditor],
  );
  // Queue notifications belong to WorkspaceStatus, not this content/actions value.
  const value = useMemo<WorkspaceUi>(
    () => ({
      workspace,
      sync,
      snapshot,
      actorId,
      storage,
      ...actions,
      lock: onLock,
      accountWorkspace,
      ...(networkLogin ? { networkLogin } : {}),
      ...(devices ? { devices } : {}),
      ...(onShowDevices ? { showDevices: onShowDevices } : {}),
      ...(accountId ? { accountId } : {}),
      ...(onSwitchAccount ? { switchAccount: onSwitchAccount } : {}),
      ...(onConnectAccount ? { connectAccount: onConnectAccount } : {}),
    }),
    [
      workspace,
      sync,
      snapshot,
      actorId,
      storage,
      actions,
      onLock,
      accountWorkspace,
      networkLogin,
      devices,
      onShowDevices,
      accountId,
      onSwitchAccount,
      onConnectAccount,
    ],
  );
  return (
    <Context value={value}>
      {children}
      {sync && <SyncNotice sync={sync} {...(networkLogin ? { login: networkLogin } : {})} />}
      <WorkspaceStatus
        workspace={workspace}
        error={error}
        setError={setError}
        setStorage={setStorage}
      />
    </Context>
  );
};

/** Availability consumers do not subscribe to pending counts, revisions or maintenance. */
export const useWorkspaceAdmissionState = (): AdmittedWorkspace['status']['state'] => {
  const { workspace } = useWorkspaceUi();
  const read = useCallback(() => workspace.status.state, [workspace]);
  return useSyncExternalStore(workspace.onStatus, read, read);
};

/** Keep warnings immediate without rerendering the writing for queue-only notifications. */
const WorkspaceStatus = ({
  workspace,
  error,
  setError,
  setStorage,
}: {
  workspace: AdmittedWorkspace;
  error: string;
  setError: (error: string) => void;
  setStorage: (storage: string) => void;
}) => {
  const [observed, setObserved] = useState(() => ({ workspace, status: workspace.status }));
  const status = observed.workspace === workspace ? observed.status : workspace.status;
  const persistence = useMemo(
    () => ({ firstRevision: workspace.status.revision, requested: false }),
    [workspace],
  );
  // Reset cancellation on owner replacement, not on revision changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const lifetime = useMemo(() => ({ live: false }), [workspace]);
  useLayoutEffect(() => {
    lifetime.live = true;
    const update = (status: AdmittedWorkspace['status']) => setObserved({ workspace, status });
    const detach = workspace.onStatus(update);
    update(workspace.status);
    return () => {
      lifetime.live = false;
      detach();
    };
  }, [workspace, lifetime]);
  useEffect(() => {
    let current = true;
    void navigator.storage
      ?.persisted?.()
      .then((value) => {
        if (current) setStorage(value ? 'Persistent' : 'Best-effort');
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [workspace, setStorage]);
  useEffect(() => {
    if (persistence.requested || status.revision <= persistence.firstRevision) return;
    persistence.requested = true;
    void navigator.storage
      ?.persist?.()
      .then((value) => {
        if (lifetime.live) setStorage(value ? 'Persistent' : 'Best-effort');
      })
      .catch(() => {});
  }, [status.revision, persistence, setStorage, lifetime]);
  const blocked = status.state === 'blocked';
  const retry = () => {
    try {
      workspace.retry();
      setError('');
    } catch {
      setError('Storage is still unavailable.');
    }
  };
  const discard = () => {
    try {
      workspace.discardPending();
      setError('');
    } catch {
      setError('Wait for the current storage operation before discarding.');
    }
  };
  return blocked || error || status.pendingItems > 0 ? (
    <aside className="workspace-status" role="status">
      <span>
        {blocked ? 'Input is waiting for storage.' : error || 'Input is waiting to be saved.'}
      </span>
      {blocked && (
        <>
          <button onClick={retry}>Retry storage</button>
          <button onClick={discard}>Discard pending input</button>
        </>
      )}
      {error && !blocked && <button onClick={() => setError('')}>Dismiss</button>}
    </aside>
  ) : null;
};
