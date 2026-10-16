import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { PreviewNavigationContext } from './ceremonyNavigation';
import {
  acknowledgeLocalRemoval,
  readDeviceRemoval,
  removeDeviceData,
  LegacyRemovalRequired,
  WorkspaceDataAbsent,
} from '../crdt/deviceDataRemoval';
import { withDeviceRemovalSlot } from '../crdt/writeSession';
import { probeDatabase, readRow } from '../crdt/startupStorage';
import { AccountIdentity } from './AccountIdentity';

export function RemoveFromDeviceButton({ slotId }: { slotId: string }) {
  const navigation = useContext(PreviewNavigationContext);
  return (
    <button
      className="menu-button local-secondary"
      onClick={() => {
        const href = '/remove/' + encodeURIComponent(slotId);
        if (navigation) void navigation.go(href);
        else location.assign(href);
      }}
    >
      Remove from this device
    </button>
  );
}
type RemovalProps = {
  slotId: string;
  onBack: () => void;
  onStartFresh: () => void;
};
export function DeviceDataRemoval(props: RemovalProps) {
  return <RemovalFlow key={props.slotId} {...props} />;
}
function RemovalFlow({ slotId, onBack, onStartFresh }: RemovalProps) {
  const [step, setStep] = useState<
    | 'checking'
    | 'review'
    | 'confirm'
    | 'failed'
    | 'blocked'
    | 'absent'
    | 'read-failed'
    | 'working'
    | 'removed'
  >('checking');
  const [typed, setTyped] = useState(''),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const pending = useRef(false);
  const [check, setCheck] = useState(0);
  const navigation = useContext(PreviewNavigationContext);
  const [identity, setIdentity] = useState<{ name?: string; accountId?: string }>({});
  const remove = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    setError('');
    setMessage('');
    setStep('working');
    try {
      await removeDeviceData(slotId, setMessage);
      setStep('removed');
    } catch (cause) {
      if (cause instanceof WorkspaceDataAbsent) setStep('absent');
      else if (cause instanceof LegacyRemovalRequired) {
        setError(cause.message);
        setStep('blocked');
      } else {
        setError(
          'Removal could not finish. Remaining local data and cleanup progress have been kept. Close other tabs using this workspace and check that browser storage is available, then retry removal. If it still fails, keep your browser data and backups for recovery.',
        );
        setStep('failed');
      }
    } finally {
      pending.current = false;
    }
  }, [slotId]);
  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    setStep('checking');
    setError('');
    void withDeviceRemovalSlot(
      slotId,
      async (task) => {
        const hint = (await probeDatabase(task, 'done.first-device-setup.v1', (db) =>
          readRow(task, db, 'attempt', slotId === 'local' ? 'current' : slotId),
        )) as { name?: unknown; requestedName?: unknown; view?: { accountId?: unknown } } | null;
        if (live && hint) {
          const name = hint.name ?? hint.requestedName,
            accountId = hint.view?.accountId;
          setIdentity({
            ...(typeof name === 'string' && name.length <= 80 ? { name } : {}),
            ...(typeof accountId === 'string' && /^[A-Za-z0-9_-]{43}$/.test(accountId)
              ? { accountId }
              : {}),
          });
        }
        return readDeviceRemoval(task, slotId);
      },
      { signal: controller.signal },
    )
      .then((r) => {
        if (!live) return;
        if (r && r.phase !== 'removed') void remove();
        else setStep(r ? 'removed' : 'review');
      })
      .catch(() => {
        if (live) {
          setError(
            'Saved removal progress could not be read. Check that browser storage is available, then retry this check. No new removal was started.',
          );
          setStep('read-failed');
        }
      });
    return () => {
      live = false;
      controller.abort();
    };
  }, [slotId, check, remove]);
  return (
    <main className="local-startup workspace-gate">
      <section className="local-startup-panel workspace-gate-panel" aria-labelledby="remove-title">
        <span className="local-brand">done</span>
        <h1 id="remove-title">
          {step === 'removed'
            ? 'Removed from this device'
            : step === 'absent'
              ? 'Nothing to remove'
              : 'Remove from this device'}
        </h1>
        <p className="setup-note">
          {identity.name
            ? `${identity.name}’s saved list`
            : slotId === 'local'
              ? 'Local list in this browser'
              : 'Account saved in this browser'}
        </p>
        {identity.accountId && <AccountIdentity id={identity.accountId} />}
        {step === 'review' && (
          <>
            <p>
              This removes this workspace’s writing, local keys, and saved setup from this browser.
              Unsynced changes may exist only here and will be lost.
            </p>
            <p>
              Removal affects this browser. Account deletion and device revocation are separate
              actions.
            </p>
            <button onClick={() => setStep('confirm')}>Continue to confirmation</button>
            <button className="local-secondary" onClick={onBack}>
              Keep my data
            </button>
          </>
        )}
        {step === 'confirm' && (
          <form
            className="local-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (typed === 'REMOVE') void remove();
            }}
          >
            <p>
              You cannot undo local removal. If this is the last readable copy, your writing will be
              lost.
            </p>
            <label htmlFor="remove-confirm">Type REMOVE to confirm</label>
            <input
              id="remove-confirm"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
            <button disabled={typed !== 'REMOVE'}>Remove local data</button>
            <button type="button" className="local-secondary" onClick={onBack}>
              Keep my data
            </button>
          </form>
        )}
        {step === 'checking' && (
          <p role="status">
            Checking saved removal progress. If this waits, close other tabs using this workspace.
          </p>
        )}
        {step === 'failed' && (
          <>
            <button onClick={() => void remove()}>Retry removal</button>
          </>
        )}
        {step === 'read-failed' && (
          <button onClick={() => setCheck((value) => value + 1)}>Retry check</button>
        )}
        {step === 'blocked' && (
          <button
            onClick={() => {
              if (navigation) void navigation.go('/local');
              else location.assign('/local');
            }}
          >
            Return to workspace
          </button>
        )}
        {step === 'absent' && (
          <p>No saved data was found for this workspace. No removal was started.</p>
        )}
        {['failed', 'blocked', 'absent', 'read-failed', 'checking'].includes(step) && (
          <button className="local-secondary" onClick={onBack}>
            Back to accounts
          </button>
        )}
        {step === 'working' && (
          <p role="status">{message || 'Closing local storage and removing data…'}</p>
        )}
        {step === 'removed' && (
          <>
            <p>
              The local copy has been removed. You can connect an account or start with a new local
              list.
            </p>
            {slotId === 'local' && (
              <button
                onClick={() => {
                  if (pending.current) return;
                  pending.current = true;
                  void acknowledgeLocalRemoval(slotId)
                    .then(onStartFresh)
                    .catch(() => {
                      pending.current = false;
                      setError('Fresh creation could not start. Try again.');
                    });
                }}
              >
                Start fresh
              </button>
            )}
            <button className="local-secondary" onClick={onBack}>
              Choose an account
            </button>
          </>
        )}
        {error && <p role="alert">{error}</p>}
      </section>
    </main>
  );
}
