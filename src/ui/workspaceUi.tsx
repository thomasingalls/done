/** Read projections and admitted commands for the application. No Y.Doc or legacy Store crosses this port. */
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
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
  snapshot: WorkspaceSnapshot;
  actorId: string;
  status: AdmittedWorkspace['status'];
  error: string;
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
}
const Context = createContext<WorkspaceUi | null>(null);
export const useWorkspaceUi = (): WorkspaceUi => {
  const value = useContext(Context);
  if (!value) throw Error('The editor needs an owned Local workspace.');
  return value;
};

export const WorkspaceUiProvider = ({
  workspace,
  actorId,
  registerEditor,
  onLock,
  onConnectAccount,
  accountWorkspace = false,
  accountId,
  onSwitchAccount,
  children,
}: {
  workspace: AdmittedWorkspace;
  actorId: string;
  registerEditor: (destroy: () => void) => () => void;
  onLock: () => void;
  onConnectAccount?: () => void;
  accountWorkspace?: boolean;
  accountId?: string;
  onSwitchAccount?: () => void;
  children: React.ReactNode;
}) => {
  const [snapshot, setSnapshot] = useState(() => workspace.read());
  const [status, setStatus] = useState(() => workspace.status);
  const [error, setError] = useState('');
  const [storage, setStorage] = useState('Unknown');
  const firstRevision = useRef(workspace.status.revision);
  const requestedPersistence = useRef(false);
  useEffect(() => {
    let live = true;
    void navigator.storage
      ?.persisted?.()
      .then((value) => {
        if (live) setStorage(value ? 'Persistent' : 'Best-effort');
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (requestedPersistence.current || status.revision <= firstRevision.current) return;
    requestedPersistence.current = true;
    void navigator.storage
      ?.persist?.()
      .then((value) => setStorage(value ? 'Persistent' : 'Best-effort'))
      .catch(() => {});
  }, [status.revision]);
  useLayoutEffect(() => {
    const update = () => {
      try {
        setSnapshot(workspace.read());
      } catch {
        /* Startup owns invalidation and removal. */
      }
    };
    const unsubscribe = workspace.subscribe(update);
    const stopStatus = workspace.onStatus(setStatus);
    update();
    return () => {
      unsubscribe();
      stopStatus();
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
  return (
    <Context
      value={{
        workspace,
        snapshot,
        actorId,
        status,
        error,
        storage,
        ...actions,
        lock: onLock,
        accountWorkspace,
        ...(accountId ? { accountId } : {}),
        ...(onSwitchAccount ? { switchAccount: onSwitchAccount } : {}),
        ...(onConnectAccount ? { connectAccount: onConnectAccount } : {}),
      }}
    >
      {children}
      {(blocked || error || status.pendingItems > 0) && (
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
      )}
    </Context>
  );
};
