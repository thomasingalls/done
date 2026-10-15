import { useContext, useEffect, useRef, useState } from 'react';
import { PreviewNavigationContext } from './ceremonyNavigation';
import {
  acknowledgeLocalRemoval,
  readDeviceRemoval,
  removeDeviceData,
  LegacyRemovalRequired,
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
export function DeviceDataRemoval({
  slotId,
  onBack,
  onStartFresh,
}: {
  slotId: string;
  onBack: () => void;
  onStartFresh: () => void;
}) {
  const [step, setStep] = useState<'review' | 'confirm' | 'resume' | 'working' | 'removed'>(
    'review',
  );
  const [typed, setTyped] = useState(''),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const pending = useRef(false);
  const [identity, setIdentity] = useState<{ name?: string; accountId?: string }>({});
  useEffect(() => {
    let live = true;
    void withDeviceRemovalSlot(slotId, async (task) => {
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
    })
      .then((r) => {
        if (live && r) setStep(r.phase === 'removed' ? 'removed' : 'resume');
      })
      .catch(() => {
        if (live) setError('Saved removal progress could not be read.');
      });
    return () => {
      live = false;
    };
  }, [slotId]);
  const remove = async () => {
    if (pending.current) return;
    pending.current = true;
    setError('');
    setStep('working');
    try {
      await removeDeviceData(slotId, setMessage);
      setStep('removed');
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Removal could not finish. Your remaining local data has been kept.',
      );
      setStep(cause instanceof LegacyRemovalRequired ? 'review' : 'resume');
    } finally {
      pending.current = false;
    }
  };
  return (
    <main className="local-startup workspace-gate">
      <section className="local-startup-panel workspace-gate-panel" aria-labelledby="remove-title">
        <span className="local-brand">done</span>
        <h1 id="remove-title">
          {step === 'removed' ? 'Removed from this device' : 'Remove from this device'}
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
        {step === 'resume' && (
          <>
            <p>Removal has started. Finish cleanup before opening this workspace.</p>
            <button onClick={() => void remove()}>Finish removal</button>
          </>
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
