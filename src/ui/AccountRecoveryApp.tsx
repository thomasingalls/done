import { useCallback, useEffect, useRef, useState } from 'react';
import type { SetupConfig } from '../account/setupProgress';
import {
  beginLostDeviceRecovery,
  resumeLostDeviceRecovery,
  finishLostDeviceRecovery,
  openRecoveredWorkspace,
} from '../account/lostDeviceRecovery';
import type { RecoveryOpening } from '../account/recoveryOpening';
import { inspectLocalStartup } from '../crdt/localGenesis';
import { newConnectionHref } from '../account/connectionNavigation';
import { newRecoveryHref } from '../account/lostRecoveryRoutes';
import { useCeremonyNavigation } from './ceremonyNavigation';
import { WorkspaceBackdrop } from './WorkspaceBackdrop';
import { AccountIdentity } from './AccountIdentity';
import { WorkspaceUiProvider } from './workspaceUi';
import { RemoveFromDeviceButton } from './DeviceDataRemoval';
import { AccountDevices } from './AccountDevices';
import { App } from './App';

type Step =
  | 'checking'
  | 'start'
  | 'recovery-code'
  | 'save-code'
  | 'confirm-code'
  | 'unlock'
  | 'review'
  | 'installed'
  | 'editing'
  | 'devices';
export function AccountRecoveryApp({
  config,
  slotId,
  onNavigate,
}: {
  config: SetupConfig;
  slotId: string;
  onNavigate: (href: string) => void;
}) {
  const [step, setStep] = useState<Step>('checking');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [typed, setTyped] = useState('');
  const [generated, setGenerated] = useState('');
  const [accountId, setAccountId] = useState('');
  const [opened, setOpened] = useState<Awaited<ReturnType<typeof openRecoveredWorkspace>>>();
  const life = useRef(new AbortController());
  const early = useRef<Awaited<ReturnType<typeof beginLostDeviceRecovery>> | undefined>(undefined);
  const opening = useRef<RecoveryOpening | undefined>(undefined);
  const heldCode = useRef('');
  const liveEditor = useRef<typeof opened>(undefined);
  const editors = useRef(new Set<() => void>());
  const operating = useRef<Promise<void> | undefined>(undefined);
  const closing = useRef<Promise<void> | undefined>(undefined);
  const navigate = useRef(onNavigate);
  navigate.current = onNavigate;
  const close = useCallback(() => {
    if (closing.current) return closing.current;
    life.current.abort();
    early.current?.close();
    early.current = undefined;
    opening.current = undefined;
    heldCode.current = '';
    for (const destroy of editors.current) {
      try {
        destroy();
      } catch {
        /* Storage still needs to close. */
      }
    }
    editors.current.clear();
    liveEditor.current?.login.close();
    closing.current = (async () => {
      await operating.current;
      await liveEditor.current?.editor.workspace.close();
      liveEditor.current = undefined;
    })();
    return closing.current;
  }, []);
  const run = useCallback((message: string, action: () => Promise<void>) => {
    if (operating.current || life.current.signal.aborted) return;
    setBusy(message);
    setError('');
    const work = (async () => {
      try {
        await action();
      } catch (cause) {
        if (!life.current.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : 'Recovery could not finish. Retry the saved step.',
          );
      } finally {
        operating.current = undefined;
        if (!life.current.signal.aborted) setBusy('');
      }
    })();
    operating.current = work;
  }, []);
  const navigation = useCeremonyNavigation({
    base: '/recover/' + slotId,
    step: busy || step === 'checking' || life.current.signal.aborted ? null : step,
    parent: heldCode.current || step === 'unlock' ? '/accounts' : '/connect/choose',
    visit: (target) => {
      if (busy) return false;
      if (opened && (target === 'editing' || target === 'devices')) {
        setStep(target);
        return true;
      }
      if (
        generated &&
        ['save-code', 'confirm-code'].includes(step) &&
        ['save-code', 'confirm-code'].includes(target)
      ) {
        setTyped('');
        setStep(target as Step);
        return true;
      }
      return false;
    },
    close,
  });
  useEffect(() => {
    void inspectLocalStartup(slotId, { signal: life.current.signal })
      .then((state) => {
        if (!life.current.signal.aborted) setStep(state.kind === 'fresh' ? 'start' : 'unlock');
      })
      .catch((cause) => {
        if (!life.current.signal.aborted) {
          setStep('unlock');
          setError(String(cause));
        }
      });
    const hide = () => {
      void close();
    };
    const show = (event: PageTransitionEvent) => {
      if (event.persisted) void close().then(() => navigate.current('/accounts'));
    };
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', show);
    return () => {
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', show);
      void close();
    };
  }, [slotId, close]);
  useEffect(() => {
    if (!opened) return;
    return opened.editor.workspace.onStatus((status) => {
      if (life.current.signal.aborted) return;
      if (
        ['active', 'blocked'].includes(status.state) &&
        status.pressure?.code !== 'repair-required'
      )
        return;
      void close().then(() => navigate.current('/accounts'));
    });
  }, [opened, close]);
  const registerEditor = useCallback((destroy: () => void) => {
    life.current.signal.throwIfAborted();
    editors.current.add(destroy);
    return () => {
      editors.current.delete(destroy);
    };
  }, []);
  const open = async () => {
    const fresh = opening.current;
    opening.current = undefined;
    const result = await openRecoveredWorkspace(
      config,
      slotId,
      heldCode.current,
      life.current.signal,
      fresh,
    );
    liveEditor.current = result;
    if (life.current.signal.aborted) {
      result.login.close();
      await result.editor.workspace.close();
      return;
    }
    setAccountId(result.accountId);
    setOpened(result);
    setStep('editing');
  };
  const leave = () => {
    void close().then(() => onNavigate('/accounts'));
  };
  if (navigation.leaving)
    return <p role="status">{navigation.error || 'Closing and finishing storage operations…'}</p>;
  if (opened && (step === 'editing' || step === 'devices'))
    return (
      <WorkspaceUiProvider
        slotId={slotId}
        workspace={opened.editor.workspace}
        sync={opened.editor.sync}
        actorId={opened.actorId}
        devices={opened.editor.devices}
        onShowDevices={() => setStep('devices')}
        accountWorkspace
        accountId={opened.accountId}
        networkLogin={opened.login}
        registerEditor={registerEditor}
        onLock={leave}
        onSwitchAccount={leave}
      >
        {step === 'devices' ? (
          <AccountDevices
            continuationAvailable={config.membershipContinuation === true}
            onBack={() => (navigation.enabled ? navigation.back() : setStep('editing'))}
            onConnect={() => {
              void close().then(() => onNavigate(newConnectionHref(slotId)));
            }}
          />
        ) : (
          <App />
        )}
      </WorkspaceUiProvider>
    );
  const submit = (
    event: React.FormEvent,
    action: (value: string) => Promise<void>,
    message: string,
  ) => {
    event.preventDefault();
    const value = typed;
    setTyped('');
    run(message, () => action(value));
  };
  return (
    <main className="local-startup workspace-gate account-setup" data-recovery-state={step}>
      <WorkspaceBackdrop />
      <section className="local-startup-panel workspace-gate-panel setup-panel">
        <span className="local-brand">done</span>
        <button className="local-secondary" onClick={navigation.back} disabled={!!busy}>
          Back
        </button>
        <h1>Recover your account</h1>
        {accountId && <AccountIdentity id={accountId} />}
        {step === 'checking' && <p role="status">Checking saved recovery…</p>}
        {step === 'start' && (
          <>
            <p>
              Use your existing account passkey and saved recovery code when you no longer have a
              connected device.
            </p>
            <p>
              Recovery opens the writing accepted by the account service. Writing that never reached
              the service cannot be recovered here.
            </p>
            <button
              className="setup-primary"
              disabled={!!busy}
              onClick={() =>
                run('Choose your existing account passkey…', async () => {
                  const next = await beginLostDeviceRecovery(config, {
                    slotId,
                    signal: life.current.signal,
                  });
                  early.current = next;
                  setAccountId(next.accountId);
                  setStep('recovery-code');
                })
              }
            >
              Use account passkey
            </button>
          </>
        )}
        {step === 'recovery-code' && (
          <form
            className="local-form"
            onSubmit={(e) =>
              submit(
                e,
                async (value) => {
                  const code = await early.current!.prepare(value);
                  setGenerated(code);
                  setStep('save-code');
                },
                'Verifying and recovering accepted writing…',
              )
            }
          >
            <label htmlFor="recovery-code">Recovery code</label>
            <input
              id="recovery-code"
              type="password"
              autoComplete="off"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              required
              disabled={!!busy}
            />
            <button disabled={!!busy}>Continue with recovery code</button>
          </form>
        )}
        {step === 'unlock' && <RemoveFromDeviceButton slotId={slotId} />}
        {step === 'save-code' && (
          <>
            <h2>Save this device’s lock code</h2>
            <p>
              Save this in a new password-manager entry for this device. Keep your existing account
              passkey and recovery code; they are unchanged.
            </p>
            <pre className="local-generated-code" aria-label="Generated unlock code">
              {generated}
            </pre>
            <button onClick={() => setStep('confirm-code')}>I saved my unlock code</button>
          </>
        )}
        {(step === 'confirm-code' || step === 'unlock') && (
          <form
            className="local-form"
            onSubmit={(e) =>
              submit(
                e,
                async (value) => {
                  if (step === 'confirm-code') {
                    const result = await early.current!.confirm(value);
                    opening.current = result.opening;
                    heldCode.current = value;
                    setGenerated('');
                    setStep('review');
                  } else {
                    const result = await resumeLostDeviceRecovery(
                      config,
                      slotId,
                      value,
                      life.current.signal,
                    );
                    heldCode.current = value;
                    if ('accountId' in result) setAccountId(result.accountId!);
                    setStep(result.stage === 'installed' ? 'installed' : 'review');
                  }
                },
                step === 'confirm-code'
                  ? 'Saving encrypted recovery progress…'
                  : 'Opening saved recovery…',
              )
            }
          >
            <h2>
              {step === 'confirm-code' ? 'Enter the code you saved' : 'Resume on this device'}
            </h2>
            <label htmlFor="device-lock-code">Unlock code</label>
            <input
              id="device-lock-code"
              type="password"
              autoComplete="current-password"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              required
              disabled={!!busy}
            />
            <button disabled={!!busy}>
              {step === 'confirm-code' ? 'Confirm unlock code' : 'Unlock saved recovery'}
            </button>
          </form>
        )}
        {step === 'review' && (
          <>
            <h2>Recover on this device and disconnect the previous devices</h2>
            <p>
              This device will become the only approved device. Future writing uses a new encryption
              key. Previous devices may still hold their existing copies; recovery cannot erase
              them.
            </p>
            <p>
              Your account passkey and recovery code stay the same. If a previous attempt already
              completed, continuing resolves that same recovery.
            </p>
            <button
              className="setup-primary"
              disabled={!!busy}
              onClick={() =>
                run('Recovering and opening your writing…', async () => {
                  await finishLostDeviceRecovery(
                    config,
                    slotId,
                    heldCode.current,
                    life.current.signal,
                  );
                  setStep('installed');
                  await open();
                })
              }
            >
              Recover on this device and disconnect the previous devices
            </button>
          </>
        )}
        {step === 'installed' && (
          <>
            <p>Recovery is installed on this device. Open your writing with the account passkey.</p>
            <button disabled={!!busy} onClick={() => run('Opening recovered writing…', open)}>
              Open recovered writing
            </button>
          </>
        )}
        {busy && <p role="status">{busy}</p>}
        {error && <p role="alert">{error}</p>}
        {error && !busy && (
          <button
            className="local-secondary"
            onClick={() => {
              void close().then(() => onNavigate(newRecoveryHref()));
            }}
          >
            Start a new recovery attempt
          </button>
        )}
        <button className="local-secondary" disabled={!!busy} onClick={leave}>
          Close and return to accounts
        </button>
      </section>
    </main>
  );
}
