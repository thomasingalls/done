import { useCallback, useEffect, useRef, useState } from 'react';
import { rememberedAccounts, isSetupSlot, type SetupConfig } from '../account/firstDeviceSetup';
import {
  createDeviceEnrollment,
  pendingDeviceSlot,
  preparePendingDevice,
  type EnrollmentView,
} from '../account/deviceEnrollment';
import { inspectLocalStartup, type LocalGenesisEnrollment } from '../crdt/localGenesis';
import { WorkspaceBackdrop } from './WorkspaceBackdrop';
import { parseCeremonyInvitation } from '../../account-protocol/ceremonyRelay';
import type { RememberedAccount } from '../account/accountIdentity';
import { AccountIdentity } from './AccountIdentity';
import { useCeremonyNavigation } from './ceremonyNavigation';
export function AccountEnrollmentApp({
  config,
  workspace,
  selectedSlot,
  invitation,
  onNavigate,
}: {
  config: SetupConfig;
  workspace: string | null;
  selectedSlot: string | null;
  invitation: string | null;
  onNavigate: (href: string) => void;
}) {
  const [accounts, setAccounts] = useState<RememberedAccount[]>([]);
  const [accountsStatus, setAccountsStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [slot, setSlot] = useState(() =>
    workspace
      ? (pendingDeviceSlot(workspace) ?? '')
      : isSetupSlot(selectedSlot)
        ? selectedSlot
        : '',
  );
  const [stage, setStage] = useState<'choose' | 'save' | 'unlock' | 'open'>(
    (workspace && pendingDeviceSlot(workspace)) || isSetupSlot(selectedSlot) ? 'unlock' : 'choose',
  );
  const [generated, setGenerated] = useState(''),
    [code, setCode] = useState(''),
    [typed, setTyped] = useState('');
  const [invitationLink, setInvitationLink] = useState('');
  const [state, setState] = useState<EnrollmentView | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const owner = useRef<ReturnType<typeof createDeviceEnrollment> | null>(null),
    genesis = useRef<LocalGenesisEnrollment | null>(null),
    life = useRef(new AbortController()),
    operating = useRef<Promise<void> | null>(null),
    foreground = useRef(false);
  const navigate = useRef(onNavigate);
  navigate.current = onNavigate;
  const close = useCallback(async () => {
    life.current.abort();
    owner.current?.close();
    genesis.current?.cancel();
    genesis.current = null;
    setGenerated('');
    setCode('');
    setTyped('');
    setState(null);
    await operating.current;
  }, []);
  const step =
    stage === 'choose'
      ? workspace
        ? 'prepare'
        : 'choose'
      : stage === 'unlock' && genesis.current
        ? 'confirm-code'
        : stage === 'open'
          ? (state?.kind ?? 'unlock')
          : stage;
  const navigation = useCeremonyNavigation({
    base: '/connect',
    step: busy || life.current.signal.aborted ? null : step,
    parent:
      stage === 'choose' && !workspace
        ? '/accounts'
        : stage !== 'open' || state?.kind === 'invite'
          ? '/connect/choose'
          : '/accounts',
    visit: (target) => {
      if (busy || !genesis.current?.displayCode || !['choose', 'save', 'unlock'].includes(stage))
        return false;
      if (target === 'prepare') setStage('choose');
      else if (target === 'save') {
        setGenerated(genesis.current.displayCode);
        setStage('save');
      } else if (target === 'confirm-code') setStage('unlock');
      else return false;
      setCode('');
      return true;
    },
    close,
  });
  useEffect(() => {
    const savedSlot = workspace ? pendingDeviceSlot(workspace) : null;
    if (savedSlot)
      void inspectLocalStartup(savedSlot, { signal: life.current.signal })
        .then((s) => {
          if (life.current.signal.aborted) return;
          if (s.kind === 'fresh') setStage('choose');
        })
        .catch(() => {
          if (!life.current.signal.aborted) setError('Saved enrollment could not be inspected.');
        });
    if (!workspace)
      void rememberedAccounts(config.pin)
        .then((values) => {
          if (life.current.signal.aborted) return;
          setAccounts(values.filter((a) => a.connected));
          setAccountsStatus('ready');
        })
        .catch(() => {
          if (!life.current.signal.aborted) setAccountsStatus('failed');
        });
    const retire = () => {
      void close();
    };
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) void close().then(() => navigate.current('/accounts'));
    };
    window.addEventListener('pagehide', retire);
    window.addEventListener('pageshow', restore);
    return () => {
      window.removeEventListener('pagehide', retire);
      window.removeEventListener('pageshow', restore);
      retire();
    };
  }, [config, workspace, close]);
  const publish = useCallback((next: EnrollmentView) => {
    if (life.current.signal.aborted) return;
    setState((previous) =>
      previous?.kind === next.kind &&
      previous.message === next.message &&
      previous.link === next.link &&
      previous.code === next.code
        ? previous
        : next,
    );
  }, []);
  const run = useCallback(async (action: () => Promise<void>, background = false) => {
    if (foreground.current || life.current.signal.aborted) return;
    if (background && operating.current) return;
    const previous = operating.current;
    if (!background) {
      foreground.current = true;
      setBusy(true);
    }
    // A user action waits for the poll already in flight. Further polls/clicks cannot
    // overtake it, and the owner still rechecks authority before taking that action.
    const task = (async () => {
      if (previous) await previous;
      if (life.current.signal.aborted) return;
      if (!background) setError('');
      try {
        await action();
      } catch (cause) {
        if (!life.current.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : 'This step did not complete. Resume with your saved code.',
          );
      }
    })();
    operating.current = task;
    try {
      await task;
    } finally {
      if (operating.current === task) operating.current = null;
      if (!background) {
        foreground.current = false;
        if (!life.current.signal.aborted) setBusy(false);
      }
    }
  }, []);
  const refresh = useCallback(
    (background = false) =>
      run(async () => {
        if (owner.current) publish(await owner.current.refresh());
      }, background),
    [publish, run],
  );
  const stateKind = state?.kind;
  useEffect(() => {
    if (error || !stateKind || !['invite', 'waiting', 'display', 'compare'].includes(stateKind))
      return;
    const timer = setInterval(() => {
      void refresh(true);
    }, 2500);
    return () => clearInterval(timer);
  }, [error, stateKind, refresh]);
  if (navigation.leaving)
    return <p role="status">{navigation.error || 'Closing and finishing storage operations…'}</p>;
  return (
    <main
      className="local-startup workspace-gate account-setup"
      data-enrollment-state={state?.kind ?? stage}
    >
      <WorkspaceBackdrop />
      <section className="local-startup-panel workspace-gate-panel setup-panel enrollment-panel">
        <p className="setup-eyebrow">done · development</p>
        <button className="local-secondary" onClick={navigation.back}>
          Back
        </button>
        <h1>{workspace ? 'Connect this device' : 'Connect devices'}</h1>
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
                  if (genesis.current?.displayCode) {
                    setGenerated(genesis.current.displayCode);
                    setStage('save');
                    return;
                  }
                  const next = await preparePendingDevice(workspace, life.current.signal);
                  if (life.current.signal.aborted) {
                    next.enrollment.cancel();
                    return;
                  }
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
              <h2>Use an invitation</h2>
              <p>
                On the device with the account you want to use, open Use another account and invite
                this device. Paste its invitation link here, or open the link directly.
              </p>
              <form
                className="local-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  setError('');
                  try {
                    if (invitationLink.length > 4096) throw Error('Invalid invitation');
                    const url = new URL(invitationLink.trim());
                    if (
                      url.origin !== location.origin ||
                      url.pathname !== '/private/account-enrollment.html' ||
                      url.username ||
                      url.password
                    )
                      throw Error('Invalid invitation');
                    const encoded = url.searchParams.get('invitation') ?? '';
                    const invitation = parseCeremonyInvitation(JSON.parse(atob(encoded)));
                    if (url.searchParams.get('workspace') !== invitation.workspaceId)
                      throw Error('Invalid invitation');
                    const query = new URLSearchParams({
                      workspace: invitation.workspaceId,
                      invitation: encoded,
                    });
                    onNavigate('/connect/prepare?' + query);
                  } catch {
                    setError('Paste a complete device invitation link from this preview.');
                  }
                }}
              >
                <label htmlFor="received-invitation">Invitation from your other device</label>
                <input
                  id="received-invitation"
                  value={invitationLink}
                  onChange={(event) => setInvitationLink(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={4096}
                  required
                />
                <button>Connect this device</button>
              </form>
              <h2>Invite another device</h2>
              <p>
                Create an invitation from a connected account below. Enter its device-lock code to
                get a link, or resume an invitation already in progress.
              </p>
              {accountsStatus === 'loading' && <p role="status">Loading connected accounts…</p>}
              {accountsStatus === 'failed' && (
                <p role="alert">Saved accounts could not be read. Reload this page to try again.</p>
              )}
              {accounts.map((a) => (
                <div className="account-invitation" key={a.slotId}>
                  <button
                    className="setup-primary"
                    onClick={() => {
                      onNavigate('/connect/unlock?slot=' + a.slotId);
                    }}
                  >
                    Create invitation for {a.name ?? 'saved account'}
                  </button>
                  {a.id && <AccountIdentity id={a.id} />}
                </div>
              ))}
              {accountsStatus === 'ready' && !accounts.length && (
                <>
                  <p>
                    No connected account is saved in this browser yet. A local-only workspace needs
                    account setup before it can invite a device: open that workspace, choose{' '}
                    <strong>Connect this workspace</strong>, and finish the passkey and
                    recovery-code steps. You can also create a new account.
                  </p>
                  <p>
                    <a
                      href="/accounts"
                      onClick={(event) => {
                        event.preventDefault();
                        onNavigate('/accounts');
                      }}
                    >
                      Open your workspace or set up an account
                    </a>
                  </p>
                </>
              )}
            </>
          ))}
        {stage === 'save' && (
          <>
            <h2>Save this device’s lock code</h2>
            <p>
              Save this code in a separate password-manager entry named for this device, such as
              “done — phone”. Keep your other device’s code; do not overwrite it. Both devices use
              the same account, but have different device-lock codes.
            </p>
            <p>Keep this code to unlock this device again. The comparison code is temporary.</p>
            <pre className="local-generated-code" aria-label="Generated device-lock code">
              {generated}
            </pre>
            <button
              onClick={() => {
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
                  setGenerated('');
                }
                owner.current?.close();
                owner.current = createDeviceEnrollment(
                  config,
                  slot,
                  entered,
                  workspace ? 'new' : 'existing',
                  workspace ?? undefined,
                  workspace && invitation ? JSON.parse(atob(invitation)) : undefined,
                );
                publish(await owner.current.refresh());
                if (!life.current.signal.aborted) setStage('open');
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
            <button disabled={busy}>
              {workspace ? 'Unlock enrollment' : 'Unlock and get invitation'}
            </button>
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
                  void run(async () => publish(await owner.current!.enroll()));
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
                  void run(async () => publish(await owner.current!.compare(input)));
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
                      void run(async () => publish(await owner.current!.cancel()));
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
          <a
            href="/accounts"
            onClick={(event) => {
              event.preventDefault();
              onNavigate('/accounts');
            }}
          >
            Close and return to accounts
          </a>
        </p>
      </section>
    </main>
  );
}
