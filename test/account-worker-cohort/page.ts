import {
  openWindowAccountCohort,
  type WindowAccountCohort,
  type AccountWorkerTicket,
} from '../../src/crdt/accountWorkerCohort';
const roots: {
  owner: WindowAccountCohort | undefined;
  members: { worker: Worker; done: Promise<void>; release(): void }[];
  stopFails: boolean;
  stopSkips: boolean;
  key: Uint8Array;
}[] = [];
const forced: (() => void)[] = [];
let inject = false;
const api = {
  async open(signal?: AbortSignal) {
    const entry = {
      owner: undefined as WindowAccountCohort | undefined,
      members: [] as (typeof roots)[number]['members'],
      stopFails: false,
      stopSkips: false,
      key: new Uint8Array(32).fill(7),
    };
    const index = roots.push(entry) - 1;
    entry.owner = await openWindowAccountCohort(
      'slot',
      async () => {
        if (entry.stopFails) throw Error('deliberate worker stop failure');
        if (entry.stopSkips) return;
        for (const m of entry.members) m.release();
        await Promise.all(entry.members.map((m) => m.done));
      },
      signal,
    );
    entry.owner.disposeWith(() => entry.key.fill(0));
    return index;
  },
  ticket(index = 0) {
    return roots[index]!.owner!.ticket;
  },
  async join(index = 0, ticket?: AccountWorkerTicket) {
    const worker = new Worker(new URL('./member.ts', import.meta.url), { type: 'module' });
    let settle!: (v: string) => void, finished!: () => void;
    const ready = new Promise<string>((resolve) => {
        settle = resolve;
      }),
      done = new Promise<void>((resolve) => {
        finished = resolve;
      });
    const entry = { worker, done, release: () => worker.postMessage({ kind: 'release' }) };
    roots[index]!.members.push(entry);
    worker.onmessage = (e) => {
      settle(e.data.kind);
      if (['closed', 'refused'].includes(e.data.kind)) {
        finished();
        worker.terminate();
      }
    };
    worker.onerror = () => {
      settle('error');
      finished();
      worker.terminate();
    };
    worker.postMessage({ kind: 'join', ticket: ticket ?? roots[index]!.owner!.ticket });
    return ready;
  },
  close(index = 0) {
    return roots[index]!.owner!.close();
  },
  state(index = 0) {
    return {
      state: roots[index]!.owner!.state,
      keyZero: roots[index]!.key.every((v) => v === 0),
      aborted: roots[index]!.owner!.signal.aborted,
    };
  },
  write(index = 0) {
    return roots[index]!.owner!.write(() => 1);
  },
  stopFails(index = 0) {
    roots[index]!.stopFails = true;
  },
  stopSkips(index = 0) {
    roots[index]!.stopSkips = true;
  },
  before(index = 0) {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    roots[index]!.owner!.beforeRelease(() => pending);
    (window as unknown as { finishDrain: () => void }).finishDrain = finish;
  },
  injectOrphanFault() {
    const native = navigator.locks;
    inject = true;
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: {
        query: () => native.query(),
        request: (name: string, options: LockOptions, callback: LockGrantedCallback<unknown>) =>
          native.request(name, options, (lock) => {
            const operation = callback(lock);
            if (!inject) return operation;
            return Promise.race([operation, new Promise<void>((resolve) => forced.push(resolve))]);
          }),
      },
    });
  },
  loseSupervisor() {
    inject = false;
    for (const release of forced.splice(0)) release();
  },
};
(window as unknown as { cohortLab: typeof api }).cohortLab = api;
