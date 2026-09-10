import { randomUUID } from 'node:crypto';
import { eventually } from './cdp.mjs';

/** Experimental containment only. Deliberately never returns production migration authority. */
export class PreflightExclusion {
  constructor(cdp, record = () => {}, { pause = true, recurse = true } = {}) {
    this.cdp = cdp;
    this.record = record;
    this.pause = pause;
    this.recurse = recurse;
    this.targets = new Map();
    this.jobs = new Set();
    this.epoch = randomUUID();
    this.loss = null;
    this.coverageGaps = new Set();
    cdp.on('disconnected', () => this.invalidate('debugger-disconnected'));
    cdp.on('Target.attachedToTarget', (event) => {
      const job = this.attach(event).catch(() => this.invalidate('target-configuration-failed'));
      this.jobs.add(job);
      void job.finally(() => this.jobs.delete(job));
    });
    cdp.on('Target.detachedFromTarget', ({ sessionId }) => {
      for (const target of this.targets.values())
        if (target.sessionId === sessionId) target.detached = true;
    });
  }
  invalidate(reason) {
    if (!this.loss) {
      this.loss = reason;
      this.record('epoch-lost', { reason, epoch: this.epoch });
    }
  }
  guard(epoch) {
    // Connection-epoch check only. No method in this experiment issues an exclusion capability.
    if (this.loss || epoch !== this.epoch) throw Error('host-epoch-lost');
  }
  async attach({ sessionId, targetInfo, waitingForDebugger }) {
    const target = {
      id: targetInfo.targetId,
      type: targetInfo.type,
      sessionId,
      waiting: waitingForDebugger,
      configured: false,
      detached: false,
    };
    this.targets.set(target.id, target);
    this.record('target-attached', { targetType: target.type, waiting: target.waiting });
    if (
      !['page', 'iframe', 'worker', 'shared_worker', 'service_worker', 'tab'].includes(target.type)
    )
      this.coverageGaps.add('unsupported-target');
    if (!waitingForDebugger) this.coverageGaps.add('already-running-target');
    if (this.recurse && ['page', 'iframe', 'tab'].includes(target.type))
      await this.cdp.send(
        'Target.setAutoAttach',
        { autoAttach: true, waitForDebuggerOnStart: this.pause, flatten: true },
        sessionId,
      );
    target.configured = true;
  }
  async install() {
    await this.cdp.send('Target.setDiscoverTargets', { discover: true });
    await this.cdp.send('Target.setAutoAttach', {
      autoAttach: true,
      waitForDebuggerOnStart: this.pause,
      flatten: true,
    });
    await this.drain();
    // Already running targets cannot be retroactively fenced. Acquisition remains an observation.
    return {
      epoch: this.epoch,
      existing: [...this.targets.values()].map((t) => ({ type: t.type, waiting: t.waiting })),
      production: 'unsupported',
      coverageGaps: [...this.coverageGaps],
    };
  }
  async drain() {
    while (this.jobs.size) await Promise.all([...this.jobs]);
  }
  async target(id) {
    return eventually(
      'attached target configuration',
      () => this.targets.get(id),
      (t) => t?.configured,
    );
  }
  async create(url = 'about:blank') {
    const { targetId } = await this.cdp.send('Target.createTarget', { url });
    return this.target(targetId);
  }
  /** Harness-only: admit a deliberately chosen fixture/probe. Never called on a URL-derived allowlist. */
  async admit(target) {
    await this.cdp.send('Runtime.runIfWaitingForDebugger', {}, target.sessionId);
    target.waiting = false;
    return target;
  }
  async closeTarget(target) {
    await this.cdp.send('Target.closeTarget', { targetId: target.id });
  }
}
