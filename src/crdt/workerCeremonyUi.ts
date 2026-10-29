import { createAcknowledgedPresentation } from './acknowledgedPresentation';
/** Native setup lifetime; original coordinator, Task owners and approval WeakMaps remain authoritative. */
import type { SetupConfig } from '../account/setupProgress';
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
import { createWorkerCeremonyBrowser, type CeremonyBrowser } from './ceremonyBrowser';
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
export interface WorkerCeremonyUiBootstrap {
  ticket: AccountWorkerTicket;
  port: MessagePort;
  controlPort: MessagePort;
  config: SetupConfig;
  activity: WorkerActivity;
  initialCode?: string;
  data?: unknown;
}
export interface NativeCeremonyWorkspaceExecution extends Omit<
  SetupWorkspaceExecution<SetupWorkspacePort>,
  'open'
> {
  open(
    options: AccountWorkspaceOptions,
    access: Parameters<SetupWorkspaceExecution<SetupWorkspacePort>['open']>[1],
    joined?: boolean,
  ): Promise<WorkerAccountComposition>;
}
export type NativeUiInvocation =
  | { outOfBand: true; run(): void | boolean }
  | { outOfBand: false; run(): Promise<void | boolean> };
export interface NativeCeremonyUiController {
  snapshot(): Record<string, unknown>;
  command(input: unknown): NativeUiInvocation;
  close(): Promise<void>;
}
export interface NativeCeremonyUiContext {
  config: SetupConfig;
  slotId: string;
  signal: AbortSignal;
  takeInitialCode(): string | undefined;
  browser: CeremonyBrowser;
  execution: NativeCeremonyWorkspaceExecution;
  publish(): void;
  data: unknown;
}
/** Trusted composition only. Commands/projections belong to fixed native factories, never messages. */
export async function startWorkerCeremonyUi(
  m: WorkerCeremonyUiBootstrap,
  makeController: (context: NativeCeremonyUiContext) => NativeCeremonyUiController,
) {
  if (typeof window !== 'undefined' || m.config.networkSessions !== true)
    throw Error('Native public setup required');
  const stop = new AbortController(),
    root = await openCeremonyWorkerLifetime(m.ticket),
    phase = createWorkerCeremonyPhase(root);
  let user!: NativeCeremonyUiController,
    preparing = false,
    accountRole:
      | ReturnType<(typeof import('./accountWorkerOwner'))['startAccountWorkerOwner']>
      | undefined,
    pending: AccountWorkspaceOptions | undefined,
    pendingJoined = false,
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
    send: ({ sequence, value }: { sequence: number; value: Record<string, unknown> }) =>
      control.request('setupState', { sequence, ...value }),
    failed: () => {
      void close().catch(() => {});
    },
  });
  const publish = () => {
    if (stop.signal.aborted || !user) return;
    presentation.publish(user.snapshot());
  };
  const flush = presentation.flush;
  const execution: NativeCeremonyWorkspaceExecution = {
    async open(options, _access, joined = false) {
      live();
      if (pending || accountRole) throw Error('Native setup opening already requested');
      if (typeof joined !== 'boolean') throw Error('Native account role changed');
      pendingJoined = joined;
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
        ...(joined ? { joined: true } : {}),
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
        const action = user.command(input);
        let result: void | boolean;
        if (action.outOfBand) result = action.run();
        else if (accountRole) result = await action.run();
        else result = await phase.run(action.run);
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
  user = makeController({
    config: {
      ...m.config,
      get membershipContinuation() {
        return membership;
      },
      onMembershipContinuationChange(fn) {
        configListeners.add(fn);
        return () => configListeners.delete(fn);
      },
    },
    slotId: m.ticket.slotId,
    signal: stop.signal,
    takeInitialCode: takeInitial,
    execution,
    browser,
    publish,
    data: m.data,
  });
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
        joined: pendingJoined,
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
