/** Window presentation/provider/canonical-mirror adapter for the original native setup coordinator. */
import { renewCeremonyOnCommand } from './renewableCeremony';
import { rememberRecoveryRoute, type RecoveryRoute } from '../account/lostRecoveryRoutes';
import type { SetupConfig } from '../account/setupProgress';
import type { NetworkLoginView } from '../crdt/accountSessionBridge';
import { createWindowCeremonyBrowser } from '../crdt/ceremonyBrowser';
import { openWindowCeremonyCohort, requireWindowCeremonyCohort } from '../crdt/accountWorkerCohort';
import { createWindowCeremonyJournal } from '../crdt/windowCeremonyJournal';
import { createWorkerChannel, workerMessageBytes } from '../crdt/workerChannel';
import { credentialFields } from '../crdt/ownedCredentialPrompt';
import { watchWindowWorkerLifetime } from '../crdt/windowWorkerLifetime';
import { createWindowAccountHandoff } from '../crdt/windowAccountHandoff';
import { openAccountWorkerSession } from '../crdt/accountWorkerClient';
import { assertSlotPasskey } from '../account/assertSlotPasskey';
import { parseAuthorityPin, pinBytes } from '../../account-protocol/authority';
import { hex } from '../crdt/custodyCrypto';
import { createWorkerActivityForwarder, type WorkerActivityKind } from '../crdt/workerActivity';
type Cohort = Awaited<ReturnType<typeof openWindowCeremonyCohort>>;
type Session = Awaited<ReturnType<typeof openAccountWorkerSession>>;
export type WindowCeremonySession = Session;
export interface WindowCeremonyUiOptions<T> {
  initial: T;
  closing: T;
  failure(poisoned: boolean, transition?: string): T;
  fields: readonly string[];
  capture(input: unknown, session: Session | undefined): T;
  editing(state: T): boolean;
  worker(): Worker;
  bootstrapKind: string;
  data?: unknown;
  takeInitialCode?: () => string | undefined;
  expectedJoined: boolean;
  retryCommand?: unknown;
  captureCommand(input: unknown): unknown;
}
/** Trusted fixed UI composition only. Native joins and verification remain original. */
export function createWindowCeremonyUi<T>(
  config: SetupConfig,
  slotId: string,
  options: WindowCeremonyUiOptions<T>,
) {
  const { takeInitialCode, ...reusable } = options;
  let initial = takeInitialCode;
  const renewed = renewCeremonyOnCommand<T, ReturnType<typeof createWindowCeremonyIncarnation<T>>>(
    (first) => {
      const take = first ? initial : undefined;
      initial = undefined;
      return createWindowCeremonyIncarnation(config, slotId, {
        ...reusable,
        ...(take ? { takeInitialCode: take } : {}),
      });
    },
    options.retryCommand,
  );
  return {
    get networkLogin() {
      return renewed.current.networkLogin;
    },
    get session() {
      return renewed.current.session;
    },
    get busy() {
      return renewed.current.busy;
    },
    get requiresUnlock() {
      return renewed.current.requiresUnlock || renewed.current.failed;
    },
    getSnapshot: renewed.getSnapshot,
    subscribe: renewed.subscribe,
    registerEditor: (destroy: () => void) => renewed.current.registerEditor(destroy),
    whenIdle: () => renewed.current.whenIdle(),
    command: renewed.command,
    send: renewed.send,
    close: renewed.close,
  };
}
function createWindowCeremonyIncarnation<T>(
  config: SetupConfig,
  slotId: string,
  options: WindowCeremonyUiOptions<T>,
) {
  let takeInitialCode = options.takeInitialCode;
  if (config.networkSessions !== true) throw Error('Worker setup requires public account sessions');
  const pin = parseAuthorityPin(config.pin);
  if (pin.origin !== location.origin) throw Error('Setup origin changed');
  workerMessageBytes(options.data);
  const bootstrapData = structuredClone(options.data);
  const stop = new AbortController(),
    listeners = new Set<() => void>(),
    editors = new Set<() => void>(),
    commands = new Set<Promise<unknown>>();
  let state: T = options.initial,
    activeActorId: string | undefined,
    worker: Worker | undefined,
    cohort: Cohort | undefined,
    rootChannel: ReturnType<typeof createWorkerChannel> | undefined,
    control: ReturnType<typeof createWorkerChannel> | undefined,
    session: Session | undefined,
    rawSession: Promise<Session> | undefined,
    boot: Promise<void> | undefined,
    closing: Promise<void> | undefined,
    preserve = false,
    handingOff = false,
    ended = false,
    closed = false,
    explicitlyClosed = false,
    failed = false,
    terminalTransition: string | undefined,
    needsReboot = false,
    sequence = 0,
    poisoned: unknown,
    acknowledged: (ok: boolean) => void = () => {},
    stopActivity: () => void = () => {},
    stopConfig: () => void = () => {},
    stopBrowser: () => void = () => {};
  const changed = () => {
    for (const fn of listeners) fn();
  };
  const retire = () => {
    for (const fn of [...editors]) {
      try {
        fn();
      } catch {
        /* Every editor is still retired. */
      }
    }
    editors.clear();
  };
  const live = () => {
    stop.signal.throwIfAborted();
    if (closed) throw Error('Setup closed');
    if (poisoned) throw poisoned;
  };
  const drain = () => {
    if (closing) return closing;
    let lastName: string | undefined;
    try {
      if (options.editing(state) && session?.composedWorkspace)
        lastName = session.composedWorkspace
          .read()
          .actors.find((v) => v.id === activeActorId)?.name;
    } catch {
      /* Cosmetic hint only. */
    }
    closed = true;
    stop.abort();
    stopActivity();
    stopConfig();
    stopBrowser();
    retire();
    state = options.closing;
    changed();
    const request =
      control && !control.closed
        ? control.request('setupClose', { name: lastName ?? null }).catch(() => {})
        : Promise.resolve();
    return (closing = Promise.resolve().then(async () => {
      try {
        await boot?.catch(() => {});
        await (await rawSession?.catch(() => undefined))?.cohort.close();
        await cohort?.close();
      } finally {
        control?.close();
        rootChannel?.close();
        worker?.terminate();
        await request;
        session = undefined;
        rawSession = undefined;
      }
    }));
  };
  const close = () => {
    explicitlyClosed = true;
    return drain();
  };
  const fail = () => {
    if (closed || needsReboot || poisoned) return;
    void drain().then(
      () => {
        if (explicitlyClosed) return;
        failed = true;
        state = options.failure(false, terminalTransition);
        changed();
      },
      (cause) => {
        if (explicitlyClosed) return;
        poisoned = cause;
        state = options.failure(true);
        changed();
      },
    );
  };
  const start = async () => {
    live();
    preserve = false;
    handingOff = false;
    ended = false;
    sequence = 0;
    const stopped = new Promise<boolean>((resolve) => (acknowledged = resolve));
    cohort = await openWindowCeremonyCohort(
      slotId,
      async () => {
        rootChannel?.close();
        if (preserve && !stop.signal.aborted) return;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const ok = ended
          ? true
          : await Promise.race([
              stopped,
              new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), 5000))),
            ]);
        clearTimeout(timer);
        worker?.terminate();
        if (ok === false) throw Error('Setup native cleanup failed');
      },
      stop.signal,
    );
    live();
    const current = cohort,
      io = createWindowCeremonyJournal(current),
      rootPorts = new MessageChannel(),
      uiPorts = new MessageChannel();
    worker = options.worker();
    rootChannel = createWorkerChannel(
      rootPorts.port1,
      current.ticket.incarnation,
      io.methods,
      () => {
        if (!handingOff) fail();
      },
    );
    const providerStop = new AbortController();
    const browser = createWindowCeremonyBrowser(
      pin,
      AbortSignal.any([stop.signal, providerStop.signal]),
      live,
    );
    stopBrowser = () => {
      providerStop.abort();
      browser.close();
    };
    control = createWorkerChannel(
      uiPorts.port1,
      current.ticket.incarnation,
      {
        recoveryRoute(input) {
          live();
          requireWindowCeremonyCohort(current);
          credentialFields(input, ['slotId', 'accountId', 'workspaceId', 'pin']);
          const v = input as RecoveryRoute;
          if (v.slotId !== slotId || hex(pinBytes(parseAuthorityPin(v.pin))) !== hex(pinBytes(pin)))
            throw Error('Recovery route scope changed');
          rememberRecoveryRoute(v);
        },
        credential: (input) => browser.prompt(input),
        credentialCancel: (input) => browser.cancel(input),
        setupState(input) {
          if (closed || needsReboot) return;
          credentialFields(input, ['sequence', ...options.fields]);
          const value = input as { sequence: number };
          if (!Number.isSafeInteger(value.sequence) || value.sequence !== sequence + 1)
            throw Error('Setup state changed');
          state = options.capture(input, session);
          sequence = value.sequence;
          if (!options.editing(state)) retire();
          changed();
        },
        async setupOpen(input) {
          live();
          requireWindowCeremonyCohort(current);
          credentialFields(
            input,
            options.expectedJoined
              ? ['slotId', 'code', 'pin', 'identity', 'membershipContinuation', 'joined']
              : ['slotId', 'code', 'pin', 'identity', 'membershipContinuation'],
          );
          const v = input as {
            slotId: string;
            code: string;
            pin: SetupConfig['pin'];
            identity: Parameters<typeof openAccountWorkerSession>[0]['identity'];
            membershipContinuation: boolean;
            joined?: boolean;
          };
          if (
            v.slotId !== slotId ||
            typeof v.code !== 'string' ||
            v.code.length > 4096 ||
            hex(pinBytes(parseAuthorityPin(v.pin))) !== hex(pinBytes(pin)) ||
            typeof v.membershipContinuation !== 'boolean' ||
            (v.joined !== undefined && typeof v.joined !== 'boolean') ||
            (v.joined === true) !== options.expectedJoined ||
            handingOff ||
            rawSession
          )
            throw Error('Setup opening changed');
          handingOff = true;
          stopActivity();
          stopConfig();
          const nonce = hex(crypto.getRandomValues(new Uint8Array(16)));
          try {
            const reply = await rootChannel!.request<{ nonce: string }>('prepareHandoff', {
              nonce,
            });
            live();
            if (reply.nonce !== nonce) throw Error('Setup handoff changed');
            preserve = true;
            await current.close();
            live();
            const transfer = createWindowAccountHandoff(worker!, current, nonce, stop.signal);
            rawSession = openAccountWorkerSession(
              {
                ...v,
                assertPasskey: assertSlotPasskey(stop.signal),
                signal: stop.signal,
                membershipContinuation: () => config.membershipContinuation === true,
                ...(config.onMembershipContinuationChange
                  ? { onMembershipContinuationChange: config.onMembershipContinuationChange }
                  : {}),
              },
              v.joined === true,
              { networkSessions: true, composed: true },
              transfer,
              (transition) => {
                terminalTransition = transition;
              },
            );
            session = await rawSession;
            activeActorId = v.identity.id;
            await session.ready();
            live();
            session.cohort.signal.addEventListener(
              'abort',
              () => {
                if (!needsReboot) fail();
              },
              { once: true },
            );
            return true;
          } catch (cause) {
            // Account entry is one-shot. Recreate the native setup owner before a later user retry.
            needsReboot = true;
            stopBrowser();
            await rawSession?.catch(() => {});
            try {
              await session?.cohort.close();
              await current.close();
            } catch (cleanupFailure) {
              poisoned = cleanupFailure;
              needsReboot = false;
            }
            control?.close();
            worker?.terminate();
            if (!closed) {
              retire();
              state = options.failure(!!poisoned);
              changed();
            }
            throw cause;
          }
        },
      },
      fail,
    );
    const ownedControl = control;
    const booted = new Promise<void>((resolve, reject) => {
      const aborted = () => reject(Error('Setup opening cancelled'));
      stop.signal.addEventListener('abort', aborted, { once: true });
      worker!.addEventListener('message', (event) => {
        const v = event.data;
        if (v?.v !== 1 || v.owner !== current.ticket.incarnation) return;
        if (v.kind === 'setupBooted') {
          stop.signal.removeEventListener('abort', aborted);
          resolve();
        }
        if (
          ['setupClosed', 'setupPreparationClosed'].includes(v.kind) &&
          typeof v.ok === 'boolean'
        ) {
          acknowledged(v.ok);
          if (!handingOff || !v.ok) fail();
        }
      });
      worker!.addEventListener(
        'error',
        () => {
          reject(Error('Setup Worker failed'));
          fail();
        },
        { once: true },
      );
    });
    const initialCode = takeInitialCode?.();
    takeInitialCode = undefined;
    worker.postMessage(
      {
        v: 1,
        kind: options.bootstrapKind,
        ticket: current.ticket,
        port: rootPorts.port2,
        controlPort: uiPorts.port2,
        ...(bootstrapData !== undefined ? { data: bootstrapData } : {}),
        config: {
          networkSessions: true,
          pin,
          membershipContinuation: config.membershipContinuation === true,
        },
        activity: { visibility: document.visibilityState, online: navigator.onLine !== false },
        ...(initialCode ? { initialCode } : {}),
      },
      [rootPorts.port2, uiPorts.port2],
    );
    await booted;
    live();
    await watchWindowWorkerLifetime(current, (released) => {
      ended ||= released;
      if (handingOff && released) return;
      fail();
    });
    const activity = createWorkerActivityForwarder({
      signal: stop.signal,
      snapshot: () => ({
        visibility: document.visibilityState,
        online: navigator.onLine !== false,
      }),
      send: (v) => ownedControl.request('activity', v),
      failed: fail,
    });
    const notify = (event: Event) => activity.notify(event.type as WorkerActivityKind);
    const documentKinds = [
        'visibilitychange',
        'keydown',
        'beforeinput',
        'pointerdown',
        'freeze',
        'resume',
      ] as const,
      globalKinds = ['online', 'offline', 'pageshow'] as const;
    for (const kind of documentKinds) document.addEventListener(kind, notify, true);
    for (const kind of globalKinds) window.addEventListener(kind, notify);
    stopActivity = () => {
      activity.close();
      for (const kind of documentKinds) document.removeEventListener(kind, notify, true);
      for (const kind of globalKinds) window.removeEventListener(kind, notify);
    };
    stopConfig =
      config.onMembershipContinuationChange?.(() => {
        void ownedControl
          .request('configuration', {
            membershipContinuation: config.membershipContinuation === true,
          })
          .catch(fail);
      }) ?? (() => {});
  };
  const get = async () => {
    live();
    if (needsReboot) {
      if (options.retryCommand === undefined)
        throw Error('Unlock this workspace again to continue.');
      stopActivity();
      stopConfig();
      stopBrowser();
      control?.close();
      rootChannel?.close();
      worker?.terminate();
      session = undefined;
      rawSession = undefined;
      boot = undefined;
      needsReboot = false;
      boot = start();
      await boot;
      await control!.request('setupCommand', options.captureCommand(options.retryCommand));
    }
    await (boot ??= start());
    live();
    return control!;
  };
  const command = (input: unknown): Promise<unknown> => {
    const captured = options.captureCommand(input),
      run = (async () => {
        const channel = await get();
        return channel.request('setupCommand', captured);
      })();
    commands.add(run);
    void run.finally(() => commands.delete(run)).catch(() => {});
    return run;
  };
  const send = (input: unknown) => {
    void command(input).catch(() => {
      if (!needsReboot) fail();
    });
  };
  return {
    get networkLogin(): NetworkLoginView | undefined {
      return session?.session?.networkLogin;
    },
    get session() {
      return session;
    },
    get busy() {
      return commands.size > 0;
    },
    get failed() {
      return failed;
    },
    get requiresUnlock() {
      return needsReboot;
    },
    getSnapshot: () => state,
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    registerEditor(destroy: () => void) {
      if (closed || !options.editing(state)) {
        destroy();
        return () => {};
      }
      editors.add(destroy);
      return () => {
        editors.delete(destroy);
      };
    },
    whenIdle: async () => {
      await Promise.all([...commands]);
    },
    command,
    send,
    close,
  };
}
