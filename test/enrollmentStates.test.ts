/**
 * §13.6's six enrollment states as executable states with crash points
 * (`P-1` criterion 11 and falsifier 18; round 1 `D-4`; the `S0-2` return).
 *
 * Round 1's protocol challenger showed the join `P-1` criterion 11 names had
 * no model: `generationApply` schedules the transition's kill points and none
 * of its steps is key delivery or certified-set activation, while §13.6's six
 * states — service-admitted, ceremony-committed, SAS-confirmed,
 * key-and-recovery-state-delivered, installed-and-countersigned, certified —
 * were prose. Its unfalsified doubt was sharper: two owner devices enrolling
 * different new devices at one `parent_epoch` produce sibling successor sets,
 * and if the loser's set is simply dropped, a device a person authenticated by
 * typing five symbols strands at installed-and-countersigned forever —
 * indistinguishable from the admitted-but-uncertified credential the design
 * exists to refuse.
 *
 * This model puts the states under `test/scheduler.ts`. The writers are
 * `resumable`, and that is a claim the steps earn (the scheduler docblock
 * reserves the shape for exactly this return): every step reads the durable
 * enrollment record to decide what remains, so a page kill at any boundary
 * resumes from durable state rather than from anyone's memory. Criterion 11's
 * rule is the `deliver` step's shape: **key delivery and the staged successor
 * certificate commit together**, so there is no reachable state where a key
 * has been released and no durable carrier knows the set it licensed.
 *
 * What this file does not model: the ceremony's bytes (the enrollment vectors
 * own the transcript, the SAS and their negatives), the member-entry triple
 * and approval resolution (the transition vectors own the lookup), and the
 * platform (this is the machine's decisions, checked against §13.6, not
 * against IndexedDB).
 */

import { describe, expect, it } from 'vitest';
import { type Machine, type Point, type Trace, type World, type Writer, runSchedule, upTo } from './scheduler';

const STATES = [
  'service-admitted',
  'ceremony-committed',
  'SAS-confirmed',
  'key-and-recovery-state-delivered',
  'installed-and-countersigned',
  'certified',
] as const;
type EnrollState = (typeof STATES)[number];

interface PendingCert {
  /** The epoch the successor consumes as its parent — the serializer's key. */
  readonly parentEpoch: number;
  readonly members: readonly string[];
  readonly newMember: string;
}

interface Durable {
  /** The service-serialized chain of activated certified sets. */
  readonly sets: readonly { parentEpoch: number; nextEpoch: number; members: readonly string[] }[];
  /** Everything the service admitted — never by itself an eligibility. */
  readonly admitted: readonly string[];
  /** Per new credential: its durable enrollment record. */
  readonly enrollments: Readonly<
    Record<string, { state: EnrollState; pendingCert: PendingCert | null }>
  >;
}

/** The ceremony's in-flight halves die with the page; the model keeps nothing volatile. */
type V = null;
type W = World<Durable, V>;

const initial = (): W => ({
  durable: {
    sets: [{ parentEpoch: 8, nextEpoch: 9, members: ['laptop', 'desktop'] }],
    admitted: ['laptop', 'desktop'],
    enrollments: {},
  },
  volatile: null,
  observed: [],
});

const latest = (d: Durable) => {
  const s = d.sets[d.sets.length - 1];
  if (s === undefined) throw new Error('the chain has no activated set; the fixture is broken');
  return s;
};

/** Reader eligibility: the latest activated set's members, and nothing else. */
const recipients = (d: Durable): readonly string[] => latest(d).members;

const at = (d: Durable, cred: string) => d.enrollments[cred] ?? null;

const setEnrollment = (
  w: W,
  cred: string,
  patch: Partial<{ state: EnrollState; pendingCert: PendingCert | null }>,
): W => ({
  ...w,
  durable: {
    ...w.durable,
    enrollments: {
      ...w.durable.enrollments,
      [cred]: { state: 'service-admitted', pendingCert: null, ...w.durable.enrollments[cred], ...patch },
    },
  },
});

/**
 * The activation the service serializes: exactly one successor per parent
 * epoch, exactly as it serializes epochs. A pending certificate whose parent
 * is already consumed is refused as stale-parent — the loser keeps its record
 * and its state, which is what makes the resumption below possible at all.
 */
const tryActivate = (w: W, cred: string): W => {
  const record = at(w.durable, cred);
  if (record === null || record.state === 'certified' || record.pendingCert === null) return w;
  if (record.state !== 'installed-and-countersigned') return w;
  const cert = record.pendingCert;
  if (w.durable.sets.some((s) => s.parentEpoch === cert.parentEpoch)) {
    return w; // refused: stale parent. The record stays; the certificate stays.
  }
  const activated = {
    ...w,
    durable: {
      ...w.durable,
      sets: [
        ...w.durable.sets,
        { parentEpoch: cert.parentEpoch, nextEpoch: cert.parentEpoch + 1, members: cert.members },
      ],
    },
  };
  return setEnrollment(activated, cred, { state: 'certified', pendingCert: null });
};

/**
 * One enrollment: `releasing` (an existing certified member) enrolling
 * `newCred`. Resumable: every step reads the durable record to decide, so the
 * scheduler may continue it across a kill.
 */
const enrollment = (name: string, newCred: string): Writer<Durable, V> => ({
  name,
  resumable: true,
  steps: [
    {
      id: 'admit',
      // Gate 1: the service admits the credential and nothing more follows
      // from that — admitted is not certified, and the assertions below hold
      // it that way at every boundary.
      run: (w) =>
        setEnrollment(
          { ...w, durable: { ...w.durable, admitted: [...w.durable.admitted, newCred] } },
          newCred,
          { state: 'service-admitted' },
        ),
    },
    {
      id: 'commit-ceremony',
      run: (w) =>
        at(w.durable, newCred)?.state === 'service-admitted'
          ? setEnrollment(w, newCred, { state: 'ceremony-committed' })
          : w,
    },
    {
      id: 'confirm-sas',
      run: (w) =>
        at(w.durable, newCred)?.state === 'ceremony-committed'
          ? setEnrollment(w, newCred, { state: 'SAS-confirmed' })
          : w,
    },
    {
      id: 'deliver',
      // Criterion 11's joint: the key release and the staged successor
      // certificate are one durable write on the releasing device. There is no
      // step boundary between them on purpose — a kill lands before both or
      // after both, and "after" leaves a resumable pending certificate.
      run: (w) => {
        if (at(w.durable, newCred)?.state !== 'SAS-confirmed') return w;
        const parent = latest(w.durable);
        return setEnrollment(w, newCred, {
          state: 'key-and-recovery-state-delivered',
          pendingCert: {
            parentEpoch: parent.nextEpoch,
            members: [...parent.members, newCred],
            newMember: newCred,
          },
        });
      },
    },
    {
      id: 'install',
      run: (w) =>
        at(w.durable, newCred)?.state === 'key-and-recovery-state-delivered'
          ? setEnrollment(w, newCred, { state: 'installed-and-countersigned' })
          : w,
    },
    {
      id: 'activate',
      run: (w) => tryActivate(w, newCred),
    },
    {
      id: 'rebuild',
      // The loser's resumption (falsifier 18): the pending certificate was
      // refused as stale-parent, so the releasing device rebuilds it against
      // the winner — the winner's members plus its own new entry, at the
      // winner's successor epoch. A certified enrollment makes this a no-op.
      run: (w) => {
        const record = at(w.durable, newCred);
        if (record === null || record.state === 'certified' || record.pendingCert === null) return w;
        const parent = latest(w.durable);
        return setEnrollment(w, newCred, {
          pendingCert: {
            parentEpoch: parent.nextEpoch,
            members: [...parent.members, newCred],
            newMember: newCred,
          },
        });
      },
    },
    {
      id: 're-activate',
      run: (w) => tryActivate(w, newCred),
    },
  ],
});

const machine = (writers: readonly Writer<Durable, V>[]): Machine<Durable, V> => ({
  initial: initial(),
  recover: () => null,
  writers,
});

const all = (w: Writer<Durable, V>): Point[] => w.steps.map((s) => ({ step: `${w.name}.${s.id}` }));

/**
 * The invariants every reached boundary must satisfy — §13.6's sentences as
 * predicates, checked at each point of a schedule rather than at its end.
 */
const invariants = (w: W) => {
  for (const [cred, record] of Object.entries(w.durable.enrollments)) {
    // Only the last state is reader-eligible: an enrollment that is not
    // certified is not a recipient, however far it got.
    if (record.state !== 'certified') {
      expect(recipients(w.durable)).not.toContain(cred);
    }
    // Criterion 11: once the key is delivered, either a durable pending
    // certificate exists or the set is activated — there is no state where a
    // released key has no carrier working toward certification.
    const delivered = STATES.indexOf(record.state) >= STATES.indexOf('key-and-recovery-state-delivered');
    if (delivered && record.state !== 'certified') {
      expect(record.pendingCert).not.toBeNull();
    }
  }
  // The serializer's law: at most one activated successor per parent epoch.
  const parents = w.durable.sets.map((s) => s.parentEpoch);
  expect(new Set(parents).size).toBe(parents.length);
};

const runChecked = (m: Machine<Durable, V>, schedule: readonly Point[]): Trace<Durable, V> => {
  // Execute point by point so the invariants hold at every boundary, not only
  // at the end — a crash point is a boundary, so this is the crash model's
  // claim stated once for all of them.
  for (let i = 1; i <= schedule.length; i += 1) {
    invariants(runSchedule(m, schedule.slice(0, i)).world);
  }
  return runSchedule(m, schedule);
};

describe('the six enrollment states, with crash points (P-1 criterion 11)', () => {
  const phone = enrollment('enrollPhone', 'phone');

  it('walks the states in order and only certified is reader-eligible', () => {
    const m = machine([phone]);
    const walked: (EnrollState | null)[] = [];
    for (let i = 1; i <= phone.steps.length; i += 1) {
      const w = runSchedule(m, all(phone).slice(0, i)).world;
      walked.push(at(w.durable, 'phone')?.state ?? null);
    }
    expect(walked).toEqual([
      'service-admitted',
      'ceremony-committed',
      'SAS-confirmed',
      'key-and-recovery-state-delivered',
      'installed-and-countersigned',
      'certified',
      'certified',
      'certified',
    ]);
    const final = runChecked(m, all(phone)).world;
    expect(recipients(final.durable)).toEqual(['laptop', 'desktop', 'phone']);
  });

  it('recovers from a kill at every step boundary and still reaches certified', () => {
    // The crash model criterion 11 always owed: kill at each boundary, resume
    // from durable state alone, and certification still lands — with the
    // invariants holding at every point along the way.
    for (let k = 0; k <= phone.steps.length; k += 1) {
      const m = machine([phone]);
      const schedule: Point[] = [...all(phone).slice(0, k), { kill: true }, ...all(phone).slice(k)];
      const trace = runChecked(m, schedule);
      expect(at(trace.world.durable, 'phone')?.state).toBe('certified');
      expect(recipients(trace.world.durable)).toContain('phone');
      // Resuming across the kill did not double-activate: one successor per
      // parent epoch is the serializer's law, asserted by `invariants` at
      // every boundary and restated here at the end.
      expect(trace.world.durable.sets).toHaveLength(2);
    }
  });
});

describe('sibling successors at one parent epoch (P-1 falsifier 18)', () => {
  it('serializes the rivals: exactly one activates, and the loser resumes to certified', () => {
    // Two owner devices enroll different new devices concurrently. Both
    // pending certificates are built against parent epoch 9; the service
    // serializes, so exactly one activates — and the loser's device, holding a
    // person-authenticated credential at installed-and-countersigned, reaches
    // certified through a rebuilt successor against the winner rather than
    // stranding there (round 1 D-4's doubt, refused).
    const a = enrollment('enrollPhone', 'phone');
    const b = enrollment('enrollTablet', 'tablet');
    const m = machine([a, b]);

    // Interleave to the race: both ceremonies run to installed-and-
    // countersigned first, so both pending certificates were built against
    // parent epoch 9; phone activates first, tablet's activation is refused
    // as stale-parent.
    const toLoss = [
      ...upTo(a, 'install'),
      ...upTo(b, 'install'),
      { step: 'enrollPhone.activate' } as Point,
      { step: 'enrollTablet.activate' } as Point,
    ];
    const raced = runChecked(m, toLoss);
    const d1 = raced.world.durable;
    expect(at(d1, 'phone')?.state).toBe('certified');
    expect(at(d1, 'tablet')?.state).toBe('installed-and-countersigned');
    // The refusal kept the loser's pending certificate — the resumable carrier
    // criterion 11 requires — and both rivals differed only in their member.
    expect(at(d1, 'tablet')?.pendingCert).toMatchObject({ parentEpoch: 9 });
    expect(d1.sets.filter((s) => s.parentEpoch === 9)).toHaveLength(1);
    expect(recipients(d1)).not.toContain('tablet');

    // The resumption: rebuild against the winner, re-activate, certified.
    const resumed = runChecked(m, [
      ...toLoss,
      { step: 'enrollTablet.rebuild' },
      { step: 'enrollTablet.re-activate' },
    ]);
    const d2 = resumed.world.durable;
    expect(at(d2, 'tablet')?.state).toBe('certified');
    expect(recipients(d2)).toEqual(['laptop', 'desktop', 'phone', 'tablet']);
    expect(d2.sets.map((s) => s.parentEpoch)).toEqual([8, 9, 10]);
  });

  it('survives a kill between the loss and the rebuild — the loser is never stranded', () => {
    const a = enrollment('enrollPhone', 'phone');
    const b = enrollment('enrollTablet', 'tablet');
    const m = machine([a, b]);
    const trace = runChecked(m, [
      ...upTo(a, 'install'),
      ...upTo(b, 'install'),
      { step: 'enrollPhone.activate' },
      { step: 'enrollTablet.activate' },
      { kill: true },
      { step: 'enrollTablet.rebuild' },
      { step: 'enrollTablet.re-activate' },
    ]);
    // The pending certificate is durable, the writers resume from durable
    // state, and the person-authenticated device still reaches certified.
    expect(at(trace.world.durable, 'tablet')?.state).toBe('certified');
    expect(recipients(trace.world.durable)).toContain('tablet');
  });

  it('an admitted credential that never ran the ceremony is refused activation and is never a recipient', () => {
    // The design's original refusal, restated over this machine: admission is
    // the service's to grant and certification is not. A writer that skips to
    // activation finds tryActivate inert — no SAS-confirmed delivery ever
    // staged a certificate — and the credential stays outside every set.
    const intruder: Writer<Durable, V> = {
      name: 'intruder',
      resumable: true,
      steps: [
        {
          id: 'admit',
          run: (w) => ({
            ...w,
            durable: {
              ...w.durable,
              admitted: [...w.durable.admitted, 'intruder'],
              enrollments: {
                ...w.durable.enrollments,
                intruder: { state: 'service-admitted', pendingCert: null },
              },
            },
          }),
        },
        { id: 'activate', run: (w) => tryActivate(w, 'intruder') },
      ],
    };
    const m = machine([intruder]);
    const trace = runChecked(m, all(intruder));
    expect(trace.world.durable.admitted).toContain('intruder');
    expect(at(trace.world.durable, 'intruder')?.state).toBe('service-admitted');
    expect(recipients(trace.world.durable)).not.toContain('intruder');
    expect(trace.world.durable.sets).toHaveLength(1);
  });
});
