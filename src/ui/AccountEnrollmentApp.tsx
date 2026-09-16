import { useEffect, useRef, useState } from 'react';
import { rememberedAccounts, type SetupConfig } from '../account/firstDeviceSetup';
import {
  createDeviceEnrollment,
  pendingDeviceSlot,
  preparePendingDevice,
  type EnrollmentView,
} from '../account/deviceEnrollment';
import { inspectLocalStartup, type LocalGenesisEnrollment } from '../crdt/localGenesis';
import { WorkspaceBackdrop } from './WorkspaceBackdrop';
export function AccountEnrollmentApp({ config }: { config: SetupConfig }) {
  const workspace = new URLSearchParams(location.search).get('workspace');
  const [accounts, setAccounts] = useState<{ slotId: string; name?: string }[]>([]);
  const [slot, setSlot] = useState(() => (workspace ? (pendingDeviceSlot(workspace) ?? '') : ''));
  const [stage, setStage] = useState<'choose' | 'save' | 'unlock' | 'open'>(
    workspace && pendingDeviceSlot(workspace) ? 'unlock' : 'choose',
  );
  const [generated, setGenerated] = useState(''),
    [code, setCode] = useState(''),
    [typed, setTyped] = useState('');
  const [state, setState] = useState<EnrollmentView | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const owner = useRef<ReturnType<typeof createDeviceEnrollment> | null>(null),
    genesis = useRef<LocalGenesisEnrollment | null>(null),
    life = useRef(new AbortController()),
    operating = useRef(false);
  useEffect(() => {
    const savedSlot = workspace ? pendingDeviceSlot(workspace) : null;
    if (savedSlot)
      void inspectLocalStartup(savedSlot, { signal: life.current.signal })
        .then((s) => {
          if (s.kind === 'fresh') setStage('choose');
        })
        .catch(() => setError('Saved enrollment could not be inspected.'));
    if (!workspace)
      void rememberedAccounts(config.pin).then((values) =>
        setAccounts(values.filter((a) => a.connected)),
      );
    const close = () => {
      life.current.abort();
      owner.current?.close();
      genesis.current?.cancel();
    };
    window.addEventListener('pagehide', close);
    return () => {
      window.removeEventListener('pagehide', close);
      close();
    };
  }, [config, workspace]);
  const run = async (action: () => Promise<void>) => {
    if (operating.current || life.current.signal.aborted) return;
    operating.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (cause) {
      if (!life.current.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : 'This step did not complete. Resume with your saved code.',
        );
    } finally {
      operating.current = false;
      if (!life.current.signal.aborted) setBusy(false);
    }
  };
  const refresh = () =>
    run(async () => {
      if (owner.current) setState(await owner.current.refresh());
    });
  useEffect(() => {
    if (error || !state || !['invite', 'waiting', 'display', 'compare'].includes(state.kind))
      return;
    const timer = setInterval(() => {
      void refresh();
    }, 2500);
    return () => clearInterval(timer);
  });
  return (
    <main
      className="local-startup workspace-gate account-setup"
      data-enrollment-state={state?.kind ?? stage}
    >
      <WorkspaceBackdrop />
      <section className="local-startup-panel workspace-gate-panel setup-panel enrollment-panel">
        <p className="setup-eyebrow">done · development</p>
        <h1>{workspace ? 'Connect this device' : 'Approve another device'}</h1>
        <p>
          This step enrolls a device and records your code comparison. Writing transfer comes next.
          Existing writing on either device is kept.
        </p>
        {stage === 'choose' &&
          (workspace ? (
            <button
              disabled={busy}
              onClick={() => {
                void run(async () => {
                  const next = await preparePendingDevice(workspace, life.current.signal);
                  setSlot(next.slot);
                  genesis.current = next.enrollment;
                  setGenerated(next.enrollment.displayCode!);
                  setStage('save');
                });
              }}
            >
              Prepare this device
            </button>
          ) : (
            <>
              <p>
                Close the account editor, then choose the account that already has your writing.
              </p>
              {accounts.map((a) => (
                <button
                  key={a.slotId}
                  onClick={() => {
                    setSlot(a.slotId);
                    setStage('unlock');
                  }}
                >
                  {a.name ?? 'Saved account'}
                </button>
              ))}
              {!accounts.length && (
                <p>
                  No connected account is saved in this browser.{' '}
                  <a href="/private/account-setup.html">Set up an account first.</a>
                </p>
              )}
            </>
          ))}
        {stage === 'save' && (
          <>
            <h2>Save this device’s lock code</h2>
            <p>
              Keep it for resuming this device’s enrollment. It is separate from the comparison
              code.
            </p>
            <pre className="local-generated-code" aria-label="Generated device-lock code">
              {generated}
            </pre>
            <button
              onClick={() => {
                setGenerated('');
                setStage('unlock');
              }}
            >
              I saved my device-lock code
            </button>
          </>
        )}
        {stage === 'unlock' && (
          <form
            className="local-form"
            onSubmit={(event) => {
              event.preventDefault();
              const entered = code;
              setCode('');
              void run(async () => {
                if (genesis.current) {
                  await genesis.current.confirm(entered);
                  genesis.current = null;
                }
                owner.current?.close();
                owner.current = createDeviceEnrollment(
                  config,
                  slot,
                  entered,
                  workspace ? 'new' : 'existing',
                  workspace ?? undefined,
                  workspace
                    ? JSON.parse(atob(new URLSearchParams(location.search).get('invitation') ?? ''))
                    : undefined,
                );
                setState(await owner.current.refresh());
                setStage('open');
              });
            }}
          >
            <label htmlFor="device-code">Device-lock code</label>
            <input
              id="device-code"
              type="password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="off"
              required
            />
            <button disabled={busy}>Unlock enrollment</button>
          </form>
        )}
        {stage === 'open' && state && (
          <>
            <h2>
              {state.kind === 'approved'
                ? 'Device approved'
                : state.kind === 'mismatch'
                  ? 'Codes did not match'
                  : state.kind === 'display'
                    ? 'Your comparison code'
                    : state.kind === 'compare'
                      ? 'Compare the devices'
                      : state.kind === 'invite'
                        ? 'Invite your other device'
                        : state.kind === 'enroll'
                          ? 'Verify your account'
                          : state.kind === 'waiting'
                            ? 'Waiting for the other device'
                            : 'Attempt stopped'}
            </h2>
            <p role="status">{state.message}</p>
            {state.link && (
              <>
                <label htmlFor="invitation">Device invitation link</label>
                <input id="invitation" readOnly value={state.link} />
                <button
                  onClick={() => {
                    void navigator.clipboard.writeText(state.link!);
                  }}
                >
                  Copy link
                </button>
              </>
            )}
            {state.kind === 'enroll' && (
              <button
                disabled={busy}
                onClick={() => {
                  void run(async () => setState(await owner.current!.enroll()));
                }}
              >
                Use account passkey
              </button>
            )}
            {state.code && (
              <pre className="local-generated-code" aria-label="Comparison code">
                {state.code}
              </pre>
            )}
            {state.kind === 'compare' && (
              <form
                className="local-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  const input = typed;
                  setTyped('');
                  void run(async () => setState(await owner.current!.compare(input)));
                }}
              >
                <label htmlFor="comparison">Code on the new device</label>
                <input
                  id="comparison"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={64}
                  required
                />
                <button disabled={busy}>Compare and approve</button>
              </form>
            )}
            {!['approved', 'mismatch', 'expired', 'restart-required', 'cancelled'].includes(
              state.kind,
            ) && (
              <>
                <button
                  disabled={busy}
                  onClick={() => {
                    void refresh();
                  }}
                >
                  Check again
                </button>
                {['compare', 'display'].includes(state.kind) && (
                  <button
                    disabled={busy}
                    onClick={() => {
                      void run(async () => setState(await owner.current!.cancel()));
                    }}
                  >
                    Cancel this attempt
                  </button>
                )}
              </>
            )}
          </>
        )}
        {busy && <p role="status">Saving and checking this step…</p>}
        {error && <p role="alert">{error}</p>}
        <p>
          <a href="/private/account-setup.html">Close and return to accounts</a>
        </p>
      </section>
    </main>
  );
}
