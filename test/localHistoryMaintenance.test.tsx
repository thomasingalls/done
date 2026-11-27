import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type {
  LocalRetentionRuntime,
  LocalRetentionStatus,
} from '../src/crdt/automaticLocalRetention';
import {
  aboutTime,
  LocalHistoryMaintenance,
  localHistoryCapacityMessage,
  localHistoryNeedsAttention,
  useLocalHistoryStatus,
} from '../src/ui/LocalHistoryMaintenance';
import {
  beginReductionPass,
  endReductionPass,
  recordReductionProgress as record,
  type LocalReductionFacts,
} from '../src/crdt/reductionProgress';
import { MenuSection } from '../src/ui/MenuSection';
async function fixture() {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let status: LocalRetentionStatus = Object.freeze({ phase: 'idle', reason: undefined });
  const observers = new Set<() => void>();
  const retry = vi.fn(() => true);
  const runtime: LocalRetentionRuntime = {
    get status() {
      return status;
    },
    retry,
    onStatus: (cb) => {
      observers.add(cb);
      return () => {
        observers.delete(cb);
      };
    },
  };
  function Panel() {
    const value = useLocalHistoryStatus(runtime)!;
    return (
      <MenuSection
        title="Data"
        notice={localHistoryNeedsAttention(value) ? 'Maintenance paused' : undefined}
      >
        <LocalHistoryMaintenance runtime={runtime} status={value} />
      </MenuSection>
    );
  }
  await act(async () => root.render(<Panel />));
  return {
    host,
    retry,
    observers,
    update: (next: LocalRetentionStatus) =>
      act(async () => {
        status = Object.freeze(next);
        for (const cb of observers) cb();
      }),
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}
it('keeps ordinary deferrals quiet and preserves native collapsed Data', async () => {
  const f = await fixture();
  try {
    const data = f.host.querySelector('details')!;
    expect(data.open).toBe(false);
    for (const reason of [
      undefined,
      'activity-or-journal',
      'pending-promotion',
      'already-preparing',
    ]) {
      await f.update({ phase: 'idle', reason });
      expect(f.host.querySelector('summary')!.textContent).toBe('Data');
      expect(f.host.querySelector('[role=status]')).toBeNull();
      expect(f.host.querySelector('button')).toBeNull();
    }
  } finally {
    await f.close();
  }
});
for (const [reason, text] of [
  ['capacity', 'preparation or snapshot size limit'],
  ['history-required', 'history needed'],
  ['ineligible', 'not ready for a safe reduction'],
] as const)
  it(`shows actionable ${reason} without claiming removal or forcing the section open`, async () => {
    const f = await fixture();
    try {
      await f.update({ phase: 'idle', reason });
      expect(f.host.querySelector('summary')!.textContent).toContain('Maintenance paused');
      expect(f.host.textContent).toContain(text);
      expect(f.host.querySelector('details')!.open).toBe(false);
      await act(async () => f.host.querySelector('button')!.click());
      expect(f.retry).toHaveBeenCalledOnce();
      await f.update({ phase: 'waiting', reason });
      expect(f.host.querySelector('button')!.disabled).toBe(true);
      expect(f.host.textContent).toContain('retry delay');
      await f.update({ phase: 'running', reason });
      expect(f.host.textContent).toContain('Checking and reducing');
      await f.update({ phase: 'idle', reason: undefined });
      expect(f.host.querySelector('summary')!.textContent).toBe('Data');
    } finally {
      await f.close();
    }
  });
it('asks for reopen on unexpected failure and offers no retry or data-erasure action', async () => {
  const f = await fixture();
  try {
    await f.update({ phase: 'halted', reason: 'owner-error' });
    expect(f.host.textContent).toContain('Lock and reopen');
    expect(f.host.textContent).not.toContain('writing is safe');
    expect(f.host.querySelector('button')).toBeNull();
    await f.update({ phase: 'closed', reason: 'owner-error' });
    expect(f.host.querySelector('section')).toBeNull();
  } finally {
    await f.close();
  }
  expect(f.observers.size).toBe(0);
});
it('says which limit or condition parked maintenance, and falls back without a known cause (phase 543)', async () => {
  const kept = 'Your existing history is still in place.',
    recheck = 'It will check again after new writing or sync changes this device’s history.';
  const general = `History maintenance reached a preparation or snapshot size limit. ${kept} ${recheck}`;
  const cases: [LocalRetentionStatus['detail'] | Record<string, unknown> | undefined, string][] = [
    [undefined, general],
    [{ cause: 'a-later-cause', needed: 1, allowed: 2 }, general],
    [
      { cause: 'snapshot-size', needed: 9856614, allowed: 8388608 },
      `The smaller history snapshot would need 9.4 MiB, and this version saves snapshots of up to 8.0 MiB. ${kept} ${recheck}`,
    ],
    [
      { cause: 'snapshot-size' },
      `The smaller history snapshot is larger than this version saves. ${kept} ${recheck}`,
    ],
    [
      { cause: 'snapshot-sources', needed: 4100, allowed: 4096 },
      `More writing is waiting to be sent from this device than a smaller history snapshot can hold (4100 batches; up to 4096). ${kept} ${recheck}`,
    ],
    [
      { cause: 'snapshot-publishers', needed: 130, allowed: 128 },
      `This workspace has more writing devices than a smaller history snapshot can record (130; up to 128). ${kept} ${recheck}`,
    ],
    [
      { cause: 'resume-progress', needed: 34603008, allowed: 33554432 },
      `The progress this device saves to resume history maintenance is full (33.0 MiB; up to 32.0 MiB). ${kept} ${recheck}`,
    ],
    [
      { cause: 'resume-progress' },
      `The progress this device saves to resume history maintenance is full. ${kept} ${recheck}`,
    ],
    [
      { cause: 'resume-index', needed: 314572, allowed: 262128 },
      `The list of saved history maintenance progress is full (0.3 MiB; up to 0.2 MiB). ${kept} ${recheck}`,
    ],
    [
      { cause: 'resume-history', needed: 67108900, allowed: 67108864 },
      `Saved history on this device is too large to mark a point where maintenance can resume (more than 64.0 MiB). ${kept} ${recheck}`,
    ],
    [
      { cause: 'interrupted' },
      `History maintenance was interrupted by other work on this device and had no saved progress to resume from. ${kept} It will try again after new writing or sync changes this device’s history, or when you choose Check again.`,
    ],
  ];
  const f = await fixture();
  try {
    for (const [detail, text] of cases) {
      await f.update({
        phase: 'idle',
        reason: 'capacity',
        ...(detail ? { detail: detail as LocalRetentionStatus['detail'] } : {}),
      } as LocalRetentionStatus);
      expect(f.host.querySelector('p')!.textContent).toBe(text);
      // Every cause keeps the existing attention notice and the Check again action.
      expect(f.host.querySelector('summary')!.textContent).toContain('Maintenance paused');
      expect(f.host.querySelector('button')!.textContent).toBe('Check again');
    }
    expect(cases.at(-1)![1]).not.toContain('limit');
  } finally {
    await f.close();
  }
});
it('names an installed service snapshot that no longer fits on re-check (phase 544)', () => {
  expect(
    localHistoryCapacityMessage({
      cause: 'installed-snapshot',
      needed: 4_300_000,
      allowed: 4_194_304,
    }),
  ).toBe(
    'A service history snapshot installed on this device needs 4.1 MiB to check, and this version checks snapshots of up to 4.0 MiB. Your existing history is still in place. It will check again after new writing or sync changes this device’s history.',
  );
  expect(localHistoryCapacityMessage({ cause: 'installed-snapshot' })).toBe(
    'A service history snapshot installed on this device is larger than this version checks. Your existing history is still in place. It will check again after new writing or sync changes this device’s history.',
  );
});
it('says a saved account step blocks reduction, keeps writing safe and offers Check again (phase 546)', async () => {
  const f = await fixture();
  try {
    await f.update({ phase: 'idle', reason: 'durable-attempt' });
    expect(f.host.querySelector('p')!.textContent).toBe(
      'An unfinished account step saved on this device, such as a service history snapshot, a device approval or a device removal, has to finish before history here can be reduced. Your existing history is still in place. It will check again after new writing or sync changes this device’s history, or when you choose Check again.',
    );
    expect(f.host.querySelector('summary')!.textContent).toContain('Maintenance paused');
    expect(f.host.querySelector('details')!.open).toBe(false);
    await act(async () => f.host.querySelector('button')!.click());
    expect(f.retry).toHaveBeenCalledOnce();
    await f.update({ phase: 'waiting', reason: 'durable-attempt' });
    expect(f.host.querySelector('button')!.disabled).toBe(true);
  } finally {
    await f.close();
  }
});

// Phase 565: where a reduction is, how long it has left and what is saved.
const S = 1000;
/** Pass 1 of a 10,000-result reduction: a 30 s read, a 2 s prefix, 1,000 fresh results in a 20 s
 * slice (50 a second) and a 5 s save. */
function savedPass(online = false, planned = 10_000) {
  let f = beginReductionPass(undefined, 0, online);
  for (const stage of ['durability', 'reading', 'opening'] as const) f = record(f, { stage }, 0);
  f = record(f, { stage: 'verifying' }, 30 * S);
  f = record(f, { stage: 'verifying', saved: 0, held: 0, fresh: 0, planned }, 30 * S);
  f = record(f, { stage: 'verifying', saved: 0, held: 0, fresh: 0, budget: 20 * S }, 32 * S);
  f = record(f, { stage: 'verifying', saved: 0, held: 1000, fresh: 1000 }, 52 * S);
  return endReductionPass(f, 'saved', 57 * S);
}
const running = (
  reduction: LocalReductionFacts,
  stage: NonNullable<LocalRetentionStatus['progress']>['stage'],
): LocalRetentionStatus => ({
  phase: 'running',
  reason: 'preparation-saved',
  progress: { stage, attempt: reduction.pass, elapsedMs: 0 },
  reduction,
});
async function at<T>(now: number, body: () => Promise<T>) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  try {
    return await body();
  } finally {
    vi.useRealTimers();
  }
}
const lines = (host: HTMLElement) => [...host.querySelectorAll('p')].map((p) => p.textContent);
const bar = (host: HTMLElement) => {
  const p = host.querySelector('progress');
  return (
    p && {
      label: p.getAttribute('aria-label'),
      value: p.getAttribute('value'),
      max: p.getAttribute('max'),
    }
  );
};
it('running, step 1: the step, checking done across passes, the pass and the time left', async () => {
  const f = await fixture();
  try {
    // Pass 2, 10 s into re-reading: 10% checked; 498 s left in this step, 558 s in all.
    let p = beginReductionPass(savedPass(), 57 * S, false);
    p = record(p, { stage: 'reading' }, 57 * S);
    await at(67 * S, () => f.update(running(p, 'reading')));
    expect(lines(f.host)).toEqual([
      'Reducing saved history: step 1 of 3, checking saved history. 10% checked (pass 2). About 9 minutes left in this step, about 10 minutes in all if this device stays quiet.',
      'Reading history saved on this device…',
    ]);
    expect(f.host.querySelector('p')!.getAttribute('role')).toBe('status');
    expect(bar(f.host)).toEqual({ label: 'Saved history checked', value: '10', max: '100' });
  } finally {
    await f.close();
  }
});
it('running, steps 2 and 3: each step named, with its own time and the whole', async () => {
  const f = await fixture();
  try {
    let p = beginReductionPass(savedPass(false, 2000), 57 * S, false);
    p = record(p, { stage: 'verifying' }, 87 * S);
    p = record(p, { stage: 'verifying', saved: 1000, held: 2000, fresh: 1000 }, 100 * S);
    p = record(p, { stage: 'building' }, 100 * S);
    // Steps 2 and 3 are each allowed one measured 30 s read.
    await at(105 * S, () => f.update(running(p, 'building')));
    expect(lines(f.host)).toEqual([
      'Reducing saved history: step 2 of 3, building the smaller history. About 30 seconds left in this step, about 1 minute in all if this device stays quiet.',
      'Building a smaller history snapshot…',
    ]);
    expect(bar(f.host)).toEqual({ label: 'Reduction steps', value: '1', max: '3' });
    p = record(p, { stage: 'installing' }, 120 * S);
    await at(121 * S, () => f.update(running(p, 'installing')));
    expect(lines(f.host)).toEqual([
      'Reducing saved history: step 3 of 3, saving the smaller history. About 30 seconds left if this device stays quiet.',
      'Saving the smaller history…',
    ]);
    expect(bar(f.host)).toEqual({ label: 'Reduction steps', value: '2', max: '3' });
  } finally {
    await f.close();
  }
});
it('running, step 2 of a short reduction: one figure when the step and the whole read alike', async () => {
  const f = await fixture();
  try {
    // A 4 s read: steps 2 and 3 are each allowed 4 s, and both figures read "about 10 seconds".
    let p = beginReductionPass(undefined, 0, false);
    p = record(p, { stage: 'verifying' }, 4 * S);
    p = record(p, { stage: 'verifying', saved: 0, held: 0, fresh: 0, planned: 100 }, 4 * S);
    p = record(p, { stage: 'verifying', saved: 0, held: 0, fresh: 0, budget: 2 * S }, 4 * S);
    p = record(p, { stage: 'verifying', saved: 0, held: 100, fresh: 100 }, 5 * S);
    p = record(p, { stage: 'building' }, 5 * S);
    await at(5 * S, () => f.update(running(p, 'building')));
    expect(lines(f.host)[0]).toBe(
      'Reducing saved history: step 2 of 3, building the smaller history. About 10 seconds left if this device stays quiet.',
    );
  } finally {
    await f.close();
  }
});
it('running before anything is measured: says it is estimating and shows no number', async () => {
  const f = await fixture();
  try {
    let p = beginReductionPass(undefined, 0, false);
    p = record(p, { stage: 'opening' }, 0);
    await at(5 * S, () =>
      f.update({
        ...running(p, 'opening'),
        progress: { stage: 'opening', completed: 320, total: 5000, attempt: 1, elapsedMs: 0 },
      }),
    );
    expect(lines(f.host)).toEqual([
      'Reducing saved history: step 1 of 3, checking saved history (pass 1). Estimating the time left…',
      'Reading saved history: 320 of 5000 records…',
    ]);
    expect(f.host.textContent).not.toMatch(/\d+%|minute|second/);
    // The per-pass count stays as a detail, on the stage's own bar.
    expect(bar(f.host)).toEqual({ label: 'Local history maintenance', value: '320', max: '5000' });
  } finally {
    await f.close();
  }
});
it('running before the new attempt has reported: the ended pass is not shown as the running one', async () => {
  const f = await fixture();
  try {
    // Pass 1 saved and ended at 57 s. The next attempt runs but has reported nothing yet, so the
    // status still carries pass 1's facts. No percentage, pass or time is claimed for it.
    await at(300 * S, () =>
      f.update({ phase: 'running', reason: 'preparation-saved', reduction: savedPass() }),
    );
    expect(lines(f.host)).toEqual(['Checking and reducing technical history on this device…']);
    expect(f.host.textContent).not.toMatch(/\d+%|pass|minute|second/);
    expect(bar(f.host)).toBeNull();
  } finally {
    await f.close();
  }
});
it('running past an estimate: says it is taking longer than expected and re-estimates', async () => {
  const f = await fixture();
  try {
    let p = beginReductionPass(savedPass(false, 2000), 57 * S, false);
    p = record(p, { stage: 'verifying' }, 87 * S);
    p = record(p, { stage: 'verifying', saved: 1000, held: 2000, fresh: 1000 }, 100 * S);
    p = record(p, { stage: 'building' }, 100 * S);
    // 90 s into a step allowed 30 s: the rest is taken as half of that, 45 s.
    await at(190 * S, () => f.update(running(p, 'building')));
    expect(lines(f.host)[0]).toBe(
      'Reducing saved history: step 2 of 3, building the smaller history. This step is taking longer than expected. About 50 seconds left in this step, about 2 minutes in all if this device stays quiet.',
    );
  } finally {
    await f.close();
  }
});
it('paused with saved progress: why, what is saved, and the quiet work still needed', async () => {
  const f = await fixture();
  try {
    await at(60 * S, () =>
      f.update({ phase: 'waiting', reason: 'preparation-saved', reduction: savedPass() }),
    );
    expect(lines(f.host)).toEqual([
      'Maintenance saved its progress. It will continue when this device is quiet.',
      'Step 1 of 3. 10% of checking is saved. About 10 minutes of quiet still needed.',
    ]);
    expect(f.host.querySelector('p')!.getAttribute('role')).toBe('status');
    expect(bar(f.host)).toEqual({ label: 'Saved history checked', value: '10', max: '100' });
    // Online, before a wait between passes is measured, it says the figure leaves them out.
    await at(60 * S, () =>
      f.update({ phase: 'waiting', reason: 'preparation-saved', reduction: savedPass(true) }),
    );
    expect(lines(f.host)).toEqual([
      'Maintenance saved its progress and paused to let sync run. It will continue when this device is quiet.',
      'Step 1 of 3. 10% of checking is saved. About 10 minutes of quiet still needed, not counting pauses that let sync run.',
    ]);
    expect(f.host.querySelector('button')).toBeNull();
  } finally {
    await f.close();
  }
});
it('paused without saved progress: nothing saved yet, still estimating', async () => {
  const f = await fixture();
  try {
    let p = beginReductionPass(undefined, 0, false);
    p = record(p, { stage: 'opening' }, 0);
    p = endReductionPass(p, 'cut', 9 * S);
    await at(10 * S, () =>
      f.update({ phase: 'idle', reason: 'activity-or-journal', reduction: p }),
    );
    expect(lines(f.host)).toEqual([
      'Maintenance paused to let editing or sync finish. It will retry when this device is quiet.',
      'Step 1 of 3. No checking is saved yet. Estimating the work left…',
    ]);
    expect(bar(f.host)).toBeNull();
  } finally {
    await f.close();
  }
});
it('lost progress: shows the fall and says that part is being redone', async () => {
  const f = await fixture();
  try {
    // Pass 2 checks 600 more of 4,000, then input cuts it before its save.
    let p = beginReductionPass(savedPass(false, 4000), 57 * S, false);
    p = record(p, { stage: 'verifying' }, 87 * S);
    p = record(p, { stage: 'verifying', saved: 1000, held: 1000, fresh: 0 }, 87 * S);
    p = record(
      p,
      { stage: 'verifying', saved: 1000, held: 1000, fresh: 0, budget: 20 * S },
      89 * S,
    );
    p = record(p, { stage: 'verifying', saved: 1000, held: 1600, fresh: 600 }, 101 * S);
    await at(101 * S, () => f.update(running(p, 'verifying')));
    expect(lines(f.host)[0]).toContain('40% checked (pass 2)');
    p = endReductionPass(p, 'cut', 102 * S);
    await at(103 * S, () =>
      f.update({ phase: 'idle', reason: 'activity-or-journal', reduction: p }),
    );
    expect(lines(f.host)).toEqual([
      'Maintenance paused to let editing or sync finish. It will retry when this device is quiet.',
      expect.stringMatching(
        /^Step 1 of 3\. 25% of checking is saved\. About \d+ minutes of quiet still needed\.$/,
      ),
      'Some checking has to be redone: it went from 40% back to 25%.',
    ]);
    expect(bar(f.host)).toEqual({ label: 'Saved history checked', value: '25', max: '100' });
  } finally {
    await f.close();
  }
});
it('finished: says when, for this open of the app', async () => {
  const f = await fixture();
  try {
    let p = beginReductionPass(savedPass(false, 2000), 57 * S, false);
    p = record(p, { stage: 'complete' }, 120 * S);
    p = endReductionPass(p, 'removed', Date.UTC(2026, 10, 27, 14, 32));
    const when = new Date(p.finishedAt!).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
    for (const phase of ['idle', 'waiting'] as const) {
      await f.update({ phase, reason: undefined, reduction: p });
      expect(lines(f.host)).toEqual([`History on this device was reduced at ${when}.`]);
    }
    expect(f.host.querySelector('summary')!.textContent).toBe('Data');
  } finally {
    await f.close();
  }
});
it.each([
  [
    'capacity',
    'History maintenance reached a preparation or snapshot size limit. Your existing history is still in place. It will check again after new writing or sync changes this device’s history.',
  ],
  [
    'history-required',
    'Some history needed for a safe reduction is unavailable. Your existing history is kept. Let sync finish before checking again.',
  ],
  [
    'ineligible',
    'This device’s history is not ready for a safe reduction. Your existing history is kept. Let sync finish before checking again.',
  ],
  [
    'durable-attempt',
    'An unfinished account step saved on this device, such as a service history snapshot, a device approval or a device removal, has to finish before history here can be reduced. Your existing history is still in place. It will check again after new writing or sync changes this device’s history, or when you choose Check again.',
  ],
  [
    'owner-error',
    'Automatic maintenance stopped because a storage or verification check failed. Lock and reopen this workspace before trying again.',
  ],
] as const)(
  'refusal %s keeps its sentence exactly while a reduction is in progress',
  async (reason, text) => {
    const f = await fixture();
    try {
      const phase = reason === 'owner-error' ? 'halted' : 'idle';
      await at(60 * S, () => f.update({ phase, reason, reduction: savedPass() }));
      expect(lines(f.host)).toEqual([text]);
      expect(bar(f.host)).toBeNull();
      if (phase === 'idle') {
        expect(f.host.querySelector('button')!.textContent).toBe('Check again');
        await f.update({ phase: 'waiting', reason, reduction: savedPass() });
        expect(lines(f.host)).toEqual([
          'A history check is queued. It will wait until you stop editing and the retry delay has passed.',
        ]);
      }
    } finally {
      await f.close();
    }
  },
);
it('words estimates as a person reads them, never as zero', () => {
  const rows: [number, string][] = [
    [0, 'about 10 seconds'],
    [9999, 'about 10 seconds'],
    [10000, 'about 10 seconds'],
    [41000, 'about 50 seconds'],
    [59000, 'about 1 minute'],
    [61000, 'about 2 minutes'],
    [7200001, 'about 3 hours'],
  ];
  expect(rows.map(([ms]) => aboutTime(ms))).toEqual(rows.map(([, words]) => words));
});
