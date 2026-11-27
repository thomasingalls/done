// @vitest-environment node
/** Phase 554, step 0: the send-path observation is inert without VITE_ACCOUNT_LEDGER_PROFILE=1 and
 * records every timer and walk counter with it. The same scenario runs in both module graphs:
 * verifier compares and selections, five send-only ledger continuations with their receipt turns,
 * an on-request ownership report, a driver step that gets a position accepted, and the delivery
 * submit and acceptance record with its expected-position chain and speculative check. */
import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
type Modules = Awaited<ReturnType<typeof modules>>;
async function modules() {
  return {
    metrics: await import('../src/crdt/accountLedgerMetrics'),
    verified: await import('../src/crdt/verifiedRecords'),
    ledger: await import('../src/crdt/incrementalAccountLedger'),
    inbound: await import('../src/crdt/accountInbound'),
    driver: await import('../src/crdt/accountSyncDriver'),
    delivery: await import('../src/crdt/accountDelivery'),
    selection: await import('../src/crdt/contentSelection'),
    fixture: await import('./sendPathFixture'),
    page: await import('./inbound-page/append-fixtures'),
    coverage: await import('../src/crdt/inboundLedger'),
  };
}
/** Profiled modules come from a fresh graph, evaluated after the flag is set. */
async function profiled() {
  vi.stubEnv('VITE_ACCOUNT_LEDGER_PROFILE', '1');
  vi.resetModules();
  return modules();
}
async function unprofiled() {
  vi.stubEnv('VITE_ACCOUNT_LEDGER_PROFILE', '');
  vi.resetModules();
  return modules();
}
const task = {
  signal: new AbortController().signal,
  step: <T>(f: () => T) => f(),
  wait: <T>(f: () => Promise<T>) => f(),
};

/** The whole scenario; `clocked` brackets the parts that read no clock before phase 554. */
async function scenario(m: Modules, clocked: <T>(run: () => Promise<T>) => Promise<T>) {
  const f = await m.fixture.sendHistory(64);
  try {
    let view = await f.view();
    // Verifier: adopt, compare unchanged rows, extend a changed view, select.
    const cache = m.verified.createVerifiedRecords<{ n: number }>({ ownResults: true });
    const rows = f.rows.slice(0, 40).map((r) => ({ ...r, bytes: r.bytes.slice() })),
      token = {};
    await clocked(async () => {
      await cache.verify(
        rows,
        token,
        async () => ({ n: 1 }),
        () => {},
      );
      await cache.verify(
        rows,
        token,
        async () => ({ n: 2 }),
        () => {},
      );
      const changed = {};
      await cache.verify(
        f.rows.slice(0, 41),
        changed,
        async () => ({ n: 3 }),
        () => {},
      );
      expect(
        m.selection.withContentSelection(
          task,
          changed,
          () => true,
          (lease) => cache.select(lease, (v) => v.n),
        ),
      ).toBe(3);
    });
    cache.clear();
    // Five send-only continuations, each with its receipt turn, as the validate callback runs them.
    for (const step of f.next()) {
      const turn = m.inbound.createInboundReceiptTurn();
      try {
        const next = await f.extend(view, step, turn);
        await clocked(async () => {
          turn.complete(next.view);
          turn.dispose();
        });
        view = next.view;
      } finally {
        turn.dispose();
      }
    }
    await clocked(async () => {
      m.ledger.accountLedgerIndexUsage(view, f.rows, f.memo.ownedBytes(), 'shared');
    });
    // A captured receipt turn still walks: complete and dispose.
    const page = await m.page.appendPageFixture();
    try {
      const coverage = m.coverage.createInboundCoverage();
      const previous = await page.indexed(),
        records = page.add(page.rows, page.f.producer.raw),
        turn = m.inbound.createInboundReceiptTurn();
      const next = (await m.ledger.extendAccountLedger(
        previous,
        page.rows,
        records,
        page.route,
        await page.counter(records),
        page.base,
        page.signer,
        crypto.subtle,
        { memo: page.memo, current() {} },
        undefined,
        turn,
      ))!;
      const inbound = await m.coverage.verifyInboundLedger(
        next.census,
        records,
        page.base,
        page.lifetime,
        { memo: page.memo, coverage },
        { state: previous.inbound, after: page.rows.at(-1)!.seq },
        turn,
      );
      await clocked(async () => {
        turn.complete({ ...next, inbound });
        turn.dispose();
      });
      coverage.clear();
    } finally {
      page.cleanup();
    }
    // Driver: one step that gets a new position accepted, with a stubbed owner.
    let accepted = 0;
    const status = () => ({
      state: 'ready' as const,
      acceptedThrough: accepted,
      finalThrough: null,
      closed: [],
      submissions: [] as number[],
      responses: [],
    });
    await clocked(() =>
      m.driver.driveOutboundStep(
        {
          deliveryStatus: async () => status(),
          spoolStatus: async () => ({ positions: [] }),
          prepareNextEnvelope: async () => ({ position: 1, bytes: new Uint8Array(1) }),
          prepareSubmission: async () => ({ kind: 'ready' }),
          submitPending: async () => {
            accepted = 1;
            return { kind: 'accepted' };
          },
        },
        '' as never,
        () => 'ready',
      ),
    );
    // Delivery: a paused submit, then the accepted reply recorded through its speculative check.
    const n = f.rows.length && view.delivery.acceptedThrough + 1;
    for (const step of f.next().slice(0, 4)) {
      const turn = m.inbound.createInboundReceiptTurn();
      try {
        const next = await f.extend(view, step, turn);
        turn.complete(next.view);
        view = next.view;
      } finally {
        turn.dispose();
      }
    }
    const state = structuredClone(view.delivery);
    state.submissions.set(n, new Uint8Array([1]));
    let witness = f.witness();
    const owner = {
      carrier: {
        canSelect: true,
        load: async () => f.rows.map((r) => ({ ...r, bytes: r.bytes.slice() })),
        spoolWitness: async () => ({ ...witness }),
        appendSpool: async (
          _task: unknown,
          _input: unknown,
          transition: {
            after: typeof witness;
            beforeCommit?: (sealed: { seq: number; gen: number }[]) => Promise<void>;
          },
        ) => {
          await transition.beforeCommit?.([{ seq: f.rows.at(-1)!.seq + 1, gen: 1 }]);
          witness = { ...transition.after };
        },
      },
    } as never;
    const operations = m.delivery.createDeliveryOperations({
      authority: () => f.base.authority,
      pin: () => ({}) as never,
      signer: () => ({}) as CryptoKey,
      publicKey: () => f.signer,
      assertCurrent: async () => {},
      run: (operation) => operation(task, owner, f.route),
      network: (operation) => operation(task),
      canSubmit: () => false,
      loadSelection: async (_t, _o, select) => select(state),
      loadState: async () => ({
        census: structuredClone(view.census.delivery),
        state: structuredClone(state),
      }),
      verifyProposed: async () => true,
    });
    await clocked(async () => {
      expect(await operations.submitPending('' as never)).toMatchObject({ kind: 'unknown' });
      expect(await operations.recordResponse(n, f.proof(n))).toMatchObject({
        kind: 'accepted',
        recorded: true,
      });
    });
    return m.metrics.accountLedgerMetrics();
  } finally {
    f.cleanup();
  }
}

it(
  'without the profile flag, the send-path observation reads no clock and counts nothing',
  { timeout: 120000 },
  async () => {
    const m = await unprofiled();
    expect(m.metrics.ledgerProfiling).toBe(false);
    expect('__doneLedgerMetrics' in globalThis).toBe(false);
    let reads = 0;
    const now = performance.now.bind(performance);
    const result = await scenario(m, async (run) => {
      const spy = vi.spyOn(performance, 'now').mockImplementation(() => {
        reads++;
        return now();
      });
      try {
        return await run();
      } finally {
        spy.mockRestore();
      }
    });
    expect(reads, 'clock reads inside the bracketed send-path operations').toBe(0);
    expect(result.costs).toEqual({});
    expect(result.acceptedSends).toEqual([]);
    for (const name of [
      'indexUsageWalks',
      'receiptTurnWalks',
      'adoptionEraseWalks',
      'graphWalkObjects',
      'verifyCompares',
      'verifyPrefixes',
      'acceptedSends',
    ] as const)
      expect(result.work[name], name).toBe(0);
  },
);

it(
  'with the profile flag, every send-path timer and walk counter records',
  { timeout: 120000 },
  async () => {
    const m = await profiled();
    expect(m.metrics.ledgerProfiling).toBe(true);
    expect(typeof (globalThis as Record<string, unknown>)['__doneLedgerMetrics']).toBe('function');
    const result = await scenario(m, (run) => run());
    for (const name of [
      'verifyCompare',
      'verifyPrefix',
      'selectProjection',
      'indexUsage',
      'receiptTurnWalk',
      'extendLedger',
      'proposalCheck',
      'expectedChain',
      'sendNetwork',
      'opDeliveryStatus',
      'opSpoolStatus',
      'opPrepareEnvelope',
      'opPrepareSubmission',
      'opSubmit',
      'sendStep',
    ] as const)
      expect(result.costs[name]?.calls ?? 0, name).toBeGreaterThan(0);
    expect(result.work.verifyCompares).toBe(1);
    expect(result.work.verifyPrefixes).toBe(1);
    // Two adoptions (the first verify and the changed view), two traversals each.
    expect(result.work.adoptionEraseWalks).toBe(4);
    // The on-request ownership report.
    expect(result.work.indexUsageWalks).toBe(1);
    // Only the captured receipt turn walks: its escape check and its erasure.
    expect(result.work.receiptTurnWalks).toBe(2);
    expect(result.work.graphWalkObjects).toBeGreaterThan(1000);
    expect(result.work.acceptedSends).toBe(1);
    expect(result.acceptedSends).toHaveLength(1);
    expect(result.acceptedSends[0]!.stepMs).toBeGreaterThanOrEqual(0);
  },
);

it(
  'stop condition (a): send-only continuations on a 1,024-position history walk no whole graph',
  { timeout: 120000 },
  async () => {
    const m = await profiled();
    const f = await m.fixture.sendHistory(1024);
    try {
      let view = await f.view();
      const before = m.metrics.accountLedgerMetrics().work;
      let continuations = 0;
      for (let position = 0; position < 2; position++)
        for (const step of f.next()) {
          const turn = m.inbound.createInboundReceiptTurn();
          try {
            const next = await f.extend(view, step, turn);
            turn.complete(next.view);
            view = next.view;
            continuations++;
          } finally {
            turn.dispose();
          }
        }
      const after = m.metrics.accountLedgerMetrics().work;
      expect(continuations).toBe(10);
      expect(view.indexes).toBeDefined();
      expect(after.indexUsageWalks - before.indexUsageWalks, 'index usage walks').toBe(0);
      expect(after.receiptTurnWalks - before.receiptTurnWalks, 'receipt turn walks').toBe(0);
    } finally {
      f.cleanup();
    }
  },
);
