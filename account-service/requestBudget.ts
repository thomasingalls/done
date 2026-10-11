/** Scoped operation policy. These are admission limits, not measured server capacity.
 * A session has room for interactive submit + peer reads; a process ceiling, concurrency,
 * existing byte bounds and deadlines still cap work. Renewed access/grants share the same key. */
export const REQUEST_LIMITS = Object.freeze({
  sessionBurst: 120,
  sessionPerSecond: 16,
  processBurst: 480,
  processPerSecond: 64,
  active: 16,
  sessionActive: 4,
  sessions: 1024,
});
type Bucket = { tokens: number; last: number; active: number };
export class ScopedRequestBudget {
  #now: () => number;
  #sessions = new Map<string, Bucket>();
  #process: Bucket;
  #invalid: Bucket;
  constructor(now = () => performance.now()) {
    this.#now = now;
    this.#process = { tokens: REQUEST_LIMITS.processBurst, last: now(), active: 0 };
    this.#invalid = { tokens: 120, last: now(), active: 0 };
  }
  #refill(b: Bucket, burst: number, rate: number, now: number) {
    b.tokens = Math.min(burst, b.tokens + (Math.max(0, now - b.last) * rate) / 1000);
    b.last = Math.max(b.last, now);
  }
  /** Invalid bearer attempts have a separate bounded allowance, not one bucket per input. */
  invalid(): boolean {
    this.#refill(this.#invalid, 120, 2, this.#now());
    if (this.#invalid.tokens < 1) return false;
    this.#invalid.tokens--;
    return true;
  }
  /** Only pass a service-held session key. A rejected session never debits the shared ceiling. */
  acquire(key: string): (() => void) | undefined {
    const now = this.#now(),
      l = REQUEST_LIMITS;
    let b = this.#sessions.get(key);
    if (!b) {
      // Forget only fully replenished, inactive buckets: churn cannot reset spent tokens.
      for (const [id, item] of this.#sessions) {
        this.#refill(item, l.sessionBurst, l.sessionPerSecond, now);
        if (!item.active && item.tokens === l.sessionBurst) this.#sessions.delete(id);
      }
      if (this.#sessions.size >= l.sessions) return;
      b = { tokens: l.sessionBurst, last: now, active: 0 };
      this.#sessions.set(key, b);
    }
    this.#refill(b, l.sessionBurst, l.sessionPerSecond, now);
    if (b.tokens < 1 || b.active >= l.sessionActive) return;
    this.#refill(this.#process, l.processBurst, l.processPerSecond, now);
    if (this.#process.tokens < 1 || this.#process.active >= l.active) return;
    b.tokens--;
    b.active++;
    this.#process.tokens--;
    this.#process.active++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      b.active--;
      this.#process.active--;
    };
  }
}
