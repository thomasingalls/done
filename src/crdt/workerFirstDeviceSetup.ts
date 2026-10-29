import { createAcknowledgedPresentation } from './acknowledgedPresentation';
/** Native setup lifetime; original coordinator, Task owners and approval WeakMaps remain authoritative. */
import { createFirstDeviceCoordinator } from '../account/firstDeviceSetup';
import type { SetupConfig } from '../account/setupProgress';
import { captureSetupCommand, setupPresentation } from '../account/setupWorkerProtocol';
import type { SetupWorkspaceExecution, SetupWorkspacePort } from '../account/setupWorkspace';
import { openCeremonyWorkerLifetime } from './ceremonyWorkerLifetime';
import { createWorkerCeremonyPhase } from './workerCeremonyPhase';
import { installCeremonyEnvironment } from './ceremonyEnvironment';
import { installProtectionEnvironment } from './protectionEnvironment';
import { createWorkerAccountHandoff } from './workerAccountHandoff';
import type {
  WorkerAccountContext,
  WorkerAccountComposition,
  WorkerSetupDisplay,
} from './workerAccountContext';
import type { WorkerCeremonyOpening } from './workerCeremonyOpening';
import type { AccountWorkspaceOptions } from './accountWorkspace';
import { createWorkerChannel } from './workerChannel';
import { createWorkerCeremonyBrowser } from './ceremonyBrowser';
import { accountWorkerRuntime, type WorkerActivity } from './accountWorkerRuntime';
import { workerActivityKinds, type WorkerActivityMessage } from './workerActivity';
import type { AccountWorkerTicket } from './nativeCoordination';
const deferred = <T>() => {
  let resolve!: (v: T | PromiseLike<T>) => void, reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  void promise.catch(() => {});
  return { promise, resolve, reject };
};
export async function startWorkerFirstDeviceSetup(m: {
  ticket: AccountWorkerTicket;
  port: MessagePort;
  controlPort: MessagePort;
  config: SetupConfig;
  activity: WorkerActivity;
  initialCode?: string;
}) {
  if (typeof window !== 'undefined' || m.config.networkSessions !== true)
    throw Error('Native public setup required');
  const stop = new AbortController(),
    root = await openCeremonyWorkerLifetime(m.ticket),
    phase = createWorkerCeremonyPhase(root);
  let user!: ReturnType<typeof createFirstDeviceCoordinator<SetupWorkspacePort>>,
    preparing = false,
    accountRole:
      | ReturnType<(typeof import('./accountWorkerOwner'))['startAccountWorkerOwner']>
      | undefined,
    pending: AccountWorkspaceOptions | undefined,
    display: WorkerSetupDisplay | undefined,
    lastName: string | undefined,
    opened = deferred<WorkerAccountComposition>(),
    initial: string | undefined,
    closing: Promise<void> | undefined;
  let rootChannel!: ReturnType<typeof createWorkerChannel>,
    control!: ReturnType<typeof createWorkerChannel>;
  const live = () => {
    stop.signal.throwIfAborted();
    const runtime = accountWorkerRuntime();
    if (runtime) runtime.assertCurrent();
    else root.assertCurrent();
  };
  const withdraw = () => {
    stop.abort();
    initial = undefined;
    pending = undefined;
    opened.reject(Error('Native setup closed'));
    void user?.close().catch(() => {});
  };
  const close = () => {
    if (closing) return closing;
    withdraw();
    return (closing = Promise.resolve().then(async () => {
      const userClosing = user?.close();
      if (accountRole) await accountRole.close();
      else await root.close();
      await userClosing;
    }));
  };
  const presentation = createAcknowledgedPresentation({
    signal: stop.signal,
    send: ({
      sequence,
      value,
    }: {
      sequence: number;
      value: {
        state: ReturnType<typeof setupPresentation>;
        visitable: string[];
        recoveryDisplay: boolean;
      };
    }) => control.request('setupState', { sequence, ...value }),
    failed: () => {
      void close().catch(() => {});
    },
  });
  const publish = () => {
    if (stop.signal.aborted) return;
    presentation.publish({
      state: setupPresentation(user.getSnapshot()),
      visitable: [...user.visitableSteps()],
      recoveryDisplay: user.hasRecoveryDisplay(),
    });
  };
  const flush = presentation.flush;
  const execution: SetupWorkspaceExecution<SetupWorkspacePort> = {
    async open(options) {
      live();
      if (pending || accountRole) throw Error('Native setup opening already requested');
      pending = options;
      await phase.yieldToAccount();
      live();
      const membershipContinuation = options.membershipContinuation;
      // Only fixed opening data crosses. Functions, login, approval and native scope stay in this realm.
      const wire = {
        slotId: options.slotId,
        code: options.code,
        pin: options.pin,
        identity: options.identity,
        membershipContinuation:
          typeof membershipContinuation === 'function'
            ? membershipContinuation() === true
            : membershipContinuation === true,
      };
      const transition = control.request('setupOpen', wire);
      const [value] = await Promise.all([opened.promise, transition]);
      live();
      return value;
    },
    async actorName() {
      live();
      if (!display) throw Error('Native setup display unavailable');
      lastName = await display.actorName();
      live();
      return lastName;
    },
    async rename(_workspace, _actorId, name) {
      live();
      if (!display) throw Error('Native setup display unavailable');
      await display.rename(name);
      live();
      lastName = name;
    },
    closingName() {
      return lastName;
    },
  };
  let handoff!: ReturnType<typeof createWorkerAccountHandoff>;
  rootChannel = createWorkerChannel(
    m.port,
    m.ticket.incarnation,
    {
      prepareHandoff: async (input) => {
        live();
        if (!pending || !phase.handingOff || preparing)
          throw Error('Native setup handoff unavailable');
        const nonce = (input as { nonce: string }).nonce;
        preparing = true;
        return handoff.prepare(nonce);
      },
    },
    () => {
      if (preparing) {
        void root.close().then(
          () =>
            self.postMessage({
              v: 1,
              kind: 'setupPreparationClosed',
              owner: m.ticket.incarnation,
              ok: true,
            }),
          () =>
            self.postMessage({
              v: 1,
              kind: 'setupPreparationClosed',
              owner: m.ticket.incarnation,
              ok: false,
            }),
        );
      } else
        void close().then(
          () =>
            self.postMessage({ v: 1, kind: 'setupClosed', owner: m.ticket.incarnation, ok: true }),
          () =>
            self.postMessage({ v: 1, kind: 'setupClosed', owner: m.ticket.incarnation, ok: false }),
        );
    },
  );
  const env = installCeremonyEnvironment(root, rootChannel, m.activity);
  installProtectionEnvironment(root, rootChannel);
  let membership = m.config.membershipContinuation === true;
  const configListeners = new Set<() => void>();
  control = createWorkerChannel(
    m.controlPort,
    m.ticket.incarnation,
    {
      setupCommand: async (input) => {
        live();
        const value = captureSetupCommand(input);
        const invoke = async () => {
          switch (value.command) {
            case 'inspect':
              await user.inspect();
              break;
            case 'start':
              user.start(value.value!);
              break;
            case 'savedDeviceCode':
              user.savedDeviceCode();
              break;
            case 'confirmDeviceCode':
              await user.confirmDeviceCode(value.value!);
              break;
            case 'unlock':
              await user.unlock(value.value!);
              break;
            case 'passkey':
              await user.passkey();
              break;
            case 'resumeSetup':
              await user.resumeSetup();
              break;
            case 'savedRecovery':
              user.savedRecovery();
              break;
            case 'confirmRecovery':
              await user.confirmRecovery(value.value!);
              break;
            case 'saveName':
              await user.saveName(value.value!);
              break;
            case 'restart':
              await user.restart();
              break;
            default:
              throw Error('Out-of-band setup action');
          }
          await user.whenIdle();
        };
        let result: unknown;
        if (value.command === 'approvePasskey') user.approvePasskey();
        else if (value.command === 'visit') result = user.visit(value.value!);
        else if (accountRole) await invoke();
        else await phase.run(invoke);
        publish();
        await flush();
        return result;
      },
      setupClose: async (input) => {
        const name = (input as { name?: unknown })?.name;
        if (typeof name === 'string' && name.length <= 80) lastName = name;
        await close();
      },
      configuration(input) {
        live();
        if (
          !input ||
          typeof input !== 'object' ||
          Object.keys(input).join(',') !== 'membershipContinuation' ||
          typeof (input as { membershipContinuation: unknown }).membershipContinuation !== 'boolean'
        )
          throw Error('Setup capability observation changed');
        membership = (input as { membershipContinuation: boolean }).membershipContinuation;
        for (const fn of configListeners) fn();
      },
      activity(input) {
        live();
        const v = input as WorkerActivityMessage;
        if (
          !workerActivityKinds.includes(v.kind) ||
          !['visible', 'hidden'].includes(v.visibility) ||
          typeof v.online !== 'boolean'
        )
          throw Error('Setup activity changed');
        if (!preparing) {
          Object.assign(env.activity, { visibility: v.visibility, online: v.online });
          env.events.dispatchEvent(new Event(v.kind));
        }
      },
    },
    () => {
      void close().catch(() => {});
    },
  );
  const browser = createWorkerCeremonyBrowser(control, stop.signal, live, () => {
    void close().catch(() => {});
  });
  initial = m.initialCode;
  delete m.initialCode;
  const takeInitial = () => {
    const value = initial;
    initial = undefined;
    return value;
  };
  user = createFirstDeviceCoordinator(
    {
      ...m.config,
      get membershipContinuation() {
        return membership;
      },
      onMembershipContinuationChange(fn) {
        configListeners.add(fn);
        return () => configListeners.delete(fn);
      },
    },
    m.ticket.slotId,
    () => {
      return takeInitial();
    },
    execution,
    () => browser,
  );
  user.subscribe(publish);
  root.beforeRelease(async () => {
    if (!phase.handingOff) await user.close();
  });
  root.signal.addEventListener(
    'abort',
    () => {
      if (!phase.handingOff) withdraw();
    },
    { once: true },
  );
  handoff = createWorkerAccountHandoff(root, rootChannel, {
    take(): WorkerCeremonyOpening | undefined {
      if (!pending) throw Error('Native setup options missing');
      return pending.promotionOpening || pending.recoveryOpening
        ? {
            slotId: pending.slotId,
            pin: pending.pin,
            ...(pending.promotionOpening ? { promotionOpening: pending.promotionOpening } : {}),
            ...(pending.recoveryOpening ? { recoveryOpening: pending.recoveryOpening } : {}),
            ...(pending.networkLogin ? { networkLogin: pending.networkLogin } : {}),
            close: withdraw,
          }
        : undefined;
    },
    context(): WorkerAccountContext {
      if (!pending) throw Error('Native setup context missing');
      const options = pending;
      pending = undefined;
      return {
        slotId: options.slotId,
        pin: options.pin,
        joined: false,
        code: options.code,
        identity: options.identity,
        assertPasskey: options.assertPasskey,
        ...(options.networkLogin ? { networkLogin: options.networkLogin } : {}),
        signal: stop.signal,
        composed(value, port) {
          display = port;
          opened.resolve(value);
        },
        close: withdraw,
      };
    },
    started(owner) {
      accountRole = owner;
    },
    close: withdraw,
  });
  publish();
  self.postMessage({ v: 1, kind: 'setupBooted', owner: m.ticket.incarnation });
  return { accept: handoff.accept, close };
}
