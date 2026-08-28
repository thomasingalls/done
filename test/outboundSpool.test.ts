/**
 * The outbound spool and the position decision, as an executable model
 * (TRD §§6.1/7.4/7.5, §15 rows 4 and 6, `S0-4`).
 *
 * **Two findings, one position number.** Row 4 made the exact bytes
 * load-bearing — a random nonce, a signature over them, a digest of the
 * ciphertext — without selecting anywhere to keep them
 * (`f-992bc91-outbound-envelope-spool-undefined`). Row 6 made a definite refusal
 * the only license to re-mint, pointing at a transition `Outcome` that cannot
 * name an envelope (`f-745e332-envelope-refusal-carrier-missing`). Composed,
 * they describe a client that must resubmit bytes it no longer has, or act on an
 * answer nothing can send it.
 *
 * **Why this is a test and not a vector.** The refusal's *bytes* are published —
 * `test/vectors/antireplay.json` carries the message, its signature and fifteen
 * negatives. What is here is the part that is not a value: what survives a kill
 * at each point, what a service may answer twice, and whether a credential can
 * still make progress after two refusals. There is nothing to publish as bytes.
 *
 * **Signatures are modelled as a token, deliberately.** Whether Ed25519 works is
 * row 1's, and whether the refusal binds its nine fields is the generator's.
 * What this file must not do is re-prove either and call the sequence tested.
 */

import { describe, expect, it } from 'vitest';

type SpoolState = 'minted' | 'sent' | 'accepted' | 'closed';

interface Envelope {
  position: number;
  gen: number;
  /** Stands for the whole immutable byte string: nonce, ciphertext, signature. */
  digest: string;
  /** The refusal this attempt was licensed by; null for the first at a position. */
  parent: string | null;
}

interface SpoolRecord {
  envelope: Envelope;
  state: SpoolState;
}

interface Refusal {
  id: string;
  position: number;
  digest: string;
  /** Signed by `K_accept`; a token here, bytes in the generator. */
  signed: boolean;
}

type Answer =
  | { kind: 'head'; position: number; digest: string }
  | { kind: 'refusal'; refusal: Refusal }
  | { kind: 'unsigned' }
  | { kind: 'nothing' };

type Verdict = 'accepted' | 're-mint' | 'resubmit' | 'equivocation';

/** §7.4's rule, and everything that is not a verified answer about my digest is silence. */
const decide = (mine: Envelope, answer: Answer): Verdict => {
  switch (answer.kind) {
    case 'head':
      if (answer.position !== mine.position) return 'resubmit';
      return answer.digest === mine.digest ? 'accepted' : 'equivocation';
    case 'refusal':
      if (!answer.refusal.signed) return 'resubmit';
      if (answer.refusal.position !== mine.position) return 'resubmit';
      return answer.refusal.digest === mine.digest ? 're-mint' : 'resubmit';
    default:
      return 'resubmit';
  }
};

// --- the client ----------------------------------------------------------------

interface Client {
  /** The durable spool: §6.1's store at `kind: 'outbound'`. */
  spool: SpoolRecord[];
  /** `PositionCounter`. Not §6.1's `seq` — a different number with a different owner. */
  nextPosition: number;
  reserved: Record<number, number>;
  gen: number;
  /** The newest checkpoint positions this device has seen admitted, newest first. */
  checkpoints: number[];
}

const client = (): Client => ({
  spool: [],
  nextPosition: 1,
  reserved: {},
  gen: 3,
  checkpoints: [],
});

/** One durable transaction: grant the position and count it against the generation. */
const reserve = (c: Client): { c: Client; position: number } => ({
  c: {
    ...c,
    nextPosition: c.nextPosition + 1,
    reserved: { ...c.reserved, [c.gen]: (c.reserved[c.gen] ?? 0) + 1 },
  },
  position: c.nextPosition,
});

let minted = 0;
/** Fresh bytes every time, which is exactly why they have to be kept. */
const mint = (position: number, gen: number, parent: string | null): Envelope => ({
  position,
  gen,
  digest: `E${position}#${++minted}`,
  parent,
});

const spoolAdd = (c: Client, envelope: Envelope): Client => ({
  ...c,
  spool: [...c.spool, { envelope, state: 'minted' }],
});

const setState = (c: Client, digest: string, state: SpoolState): Client => ({
  ...c,
  spool: c.spool.map((r) => (r.envelope.digest === digest ? { ...r, state } : r)),
});

const pending = (c: Client): SpoolRecord[] =>
  c.spool.filter((r) => r.state === 'minted' || r.state === 'sent');

/**
 * Row 6's floor: a resolved record goes only below the **second-newest**
 * checkpoint, and an unresolved one never goes at all.
 */
const trim = (c: Client): Client => {
  const floor = c.checkpoints[1];
  if (floor === undefined) return c;
  return {
    ...c,
    spool: c.spool.filter(
      (r) => (r.state !== 'accepted' && r.state !== 'closed') || r.envelope.position >= floor,
    ),
  };
};

// --- the service ---------------------------------------------------------------

interface Service {
  /** At most one accepted digest per position. */
  accepted: Record<number, string>;
  /** Digests permanently closed, and by which refusal. */
  closed: Record<string, Refusal>;
  refusals: number;
}

const service = (): Service => ({ accepted: {}, closed: {}, refusals: 0 });

type Submission = { s: Service; answer: Answer };

/**
 * The service's whole contract, and every rule here is one a client depends on.
 *
 * It is deliberately written as one function: the accepted set, the closed set
 * and the successor map have to be consulted together, and a service that
 * checked them in three places is where "accepted a digest it had refused"
 * comes from.
 */
const submit = (s: Service, e: Envelope, refuse = false): Submission => {
  // A refused digest is refused forever, however delayed its arrival. Without
  // this a client could re-mint on a refusal and have its original accepted
  // behind it -- two links at one position.
  const already = s.closed[e.digest];
  if (already !== undefined) return { s, answer: { kind: 'refusal', refusal: already } };

  const accepted = s.accepted[e.position];
  if (accepted !== undefined) {
    // Idempotent: the same bytes get the same answer rather than a second one.
    if (accepted === e.digest) {
      return { s, answer: { kind: 'head', position: e.position, digest: e.digest } };
    }
    return { s, answer: { kind: 'nothing' } }; // a second digest is not accepted
  }

  if (e.parent !== null) {
    const licence = Object.values(s.closed).find((r) => r.id === e.parent);
    // A refusal nobody issued is not a licence.
    if (licence === undefined) return { s, answer: { kind: 'nothing' } };
    // **And it licenses its own position and no other.** A successor at n+1
    // naming a refusal for n would be skipping, which row 4 forbids -- and this
    // is the rule that catches it. It replaces `RC-4A`'s "sole attempt-1 slot",
    // which turned out not to be load-bearing: every successor sits at the same
    // position, and *at most one digest accepted per position* already permits
    // only one of them to win. A mutation removing the cap changed no result,
    // which is how it was found.
    if (licence.position !== e.position) return { s, answer: { kind: 'nothing' } };
  }

  if (refuse) {
    const refusal: Refusal = {
      id: `R${s.refusals + 1}`,
      position: e.position,
      digest: e.digest,
      signed: true,
    };
    return {
      s: { ...s, refusals: s.refusals + 1, closed: { ...s.closed, [e.digest]: refusal } },
      answer: { kind: 'refusal', refusal },
    };
  }

  return {
    s: { ...s, accepted: { ...s.accepted, [e.position]: e.digest } },
    answer: { kind: 'head', position: e.position, digest: e.digest },
  };
};

// falsifies: f-992bc91-outbound-envelope-spool-undefined
describe('§7.4 — the spool survives the kill it exists for', () => {
  it('resubmits the identical bytes after a kill between minting and sending', () => {
    let c = client();
    const r = reserve(c);
    c = spoolAdd(r.c, mint(r.position, c.gen, null));

    // The page dies here. Everything below reads only what is durable.
    const recovered = pending(c);
    expect(recovered).toHaveLength(1);
    const resent = recovered[0]?.envelope;
    if (resent === undefined) throw new Error('the spool lost the only thing it is for');

    let s = service();
    const first = submit(s, resent);
    s = first.s;
    expect(decide(resent, first.answer)).toBe('accepted');
  });

  it('accepts one digest when a lost reply causes a resubmission', () => {
    let c = client();
    const r = reserve(c);
    const e = mint(r.position, c.gen, null);
    c = setState(spoolAdd(r.c, e), e.digest, 'sent');

    let s = service();
    s = submit(s, e).s; // accepted; the reply is lost
    expect(decide(e, { kind: 'nothing' })).toBe('resubmit');

    const again = submit(s, e); // the identical bytes, from the spool
    expect(decide(e, again.answer)).toBe('accepted');
    expect(Object.keys(again.s.accepted)).toHaveLength(1);
  });

  it('cannot reproduce the bytes without the spool, which is the finding', () => {
    const first = mint(1, 3, null);
    const second = mint(1, 3, null);
    // Re-enveloping the same delta produces different bytes at the same
    // position, and a service that accepted the first reads the second as a
    // second link there.
    expect(second.digest).not.toBe(first.digest);
    const s = submit(service(), first).s;
    expect(decide(second, submit(s, second).answer)).toBe('resubmit');
  });
});

// falsifies: f-992bc91-outbound-envelope-spool-undefined
describe('§7.4 — the position is reserved, and gaps are resolved rather than skipped', () => {
  it('gives two tabs different positions', () => {
    const shared = client();
    const a = reserve(shared);
    const b = reserve(a.c); // serialized by the same durable transaction
    expect(a.position).not.toBe(b.position);
    expect(b.position).toBe(a.position + 1);
  });

  it('counts a reservation abandoned before minting against the generation budget', () => {
    let c = client();
    c = reserve(c).c; // reserved, then a kill before mint
    const r = reserve(c);
    c = spoolAdd(r.c, mint(r.position, c.gen, null));
    // Two invocations were licensed and one envelope exists. SP 800-38D bounds
    // invocations, so the count that matters is the reservation.
    expect(c.reserved[c.gen]).toBe(2);
    expect(c.spool).toHaveLength(1);
    // And the raw position is not that count: it is 3 here, and would be wrong
    // the moment a generation rotates.
    expect(c.nextPosition).toBe(3);
  });

  it('does not renumber around a gap', () => {
    let c = client();
    const abandoned = reserve(c);
    c = abandoned.c;
    const next = reserve(c);
    // The chain links n to n-1, so the abandoned position must be occupied or
    // closed, never silently skipped by giving its number away.
    expect(next.position).toBe(abandoned.position + 1);
  });
});

// falsifies: f-745e332-envelope-refusal-carrier-missing
describe('§7.5 — the refusal, and the successor chain it licenses', () => {
  const firstAttempt = () => {
    let c = client();
    const r = reserve(c);
    const e = mint(r.position, c.gen, null);
    c = setState(spoolAdd(r.c, e), e.digest, 'sent');
    return { c, e };
  };

  it('licenses exactly one successor, which binds its parent', () => {
    const { e } = firstAttempt();
    let s = service();
    const refused = submit(s, e, true);
    s = refused.s;
    expect(decide(e, refused.answer)).toBe('re-mint');

    const refusal = (refused.answer as { kind: 'refusal'; refusal: Refusal }).refusal;
    const successor = mint(e.position, e.gen, refusal.id);
    const ok = submit(s, successor);
    expect(decide(successor, ok.answer)).toBe('accepted');
  });

  it('refuses a successor at a position its refusal does not name', () => {
    const { e } = firstAttempt();
    let s = service();
    const refused = submit(s, e, true);
    s = refused.s;
    const refusal = (refused.answer as { kind: 'refusal'; refusal: Refusal }).refusal;

    // A licence for position n does not license n+1, which would be skipping.
    // Position n+1 is untouched here, so the one-digest-per-position rule
    // cannot be what refuses this.
    const skipped = mint(e.position + 1, e.gen, refusal.id);
    expect(decide(skipped, submit(s, skipped).answer)).toBe('resubmit');
    expect(submit(s, skipped).s.accepted[e.position + 1]).toBeUndefined();
  });

  it('refuses a same-position refusal for a digest that is not mine', () => {
    const { e } = firstAttempt();
    // The generator publishes this as bytes; here it is the verdict. Without it
    // a verifier could read any signed refusal at its position as its own.
    expect(
      decide(e, {
        kind: 'refusal',
        refusal: { id: 'R9', position: e.position, digest: 'another-attempt', signed: true },
      }),
    ).toBe('resubmit');
  });

  it('refuses a successor naming a refusal nobody issued', () => {
    const { e } = firstAttempt();
    const s = submit(service(), e, true).s;
    const invented = mint(e.position, e.gen, 'R-never-issued');
    expect(decide(invented, submit(s, invented).answer)).toBe('resubmit');
  });

  it('never accepts a refused digest, however delayed it arrives', () => {
    const { e } = firstAttempt();
    let s = service();
    const refused = submit(s, e, true);
    s = refused.s;
    const refusal = (refused.answer as { kind: 'refusal'; refusal: Refusal }).refusal;
    s = submit(s, mint(e.position, e.gen, refusal.id)).s;

    // The original finally arrives at the service.
    const late = submit(s, e);
    expect(late.answer.kind).toBe('refusal');
    // Its position holds the successor's digest and not this one.
    expect(late.s.accepted[e.position]).not.toBe(e.digest);
  });

  it('lets the chain continue when a successor is itself refused', () => {
    // RC-4A's text caps the chain at attempt 1. That stalls a credential the
    // second time an epoch moves under it, so what is capped is the fork.
    const { e } = firstAttempt();
    let s = service();
    let answer = submit(s, e, true);
    s = answer.s;
    let parent = (answer.answer as { kind: 'refusal'; refusal: Refusal }).refusal.id;

    for (let i = 0; i < 2; i++) {
      const attempt = mint(e.position, e.gen, parent);
      answer = submit(s, attempt, true);
      s = answer.s;
      expect(decide(attempt, answer.answer)).toBe('re-mint');
      parent = (answer.answer as { kind: 'refusal'; refusal: Refusal }).refusal.id;
    }

    const finally_ = mint(e.position, e.gen, parent);
    expect(decide(finally_, submit(s, finally_).answer)).toBe('accepted');
  });

  it('treats an unsigned body and a refusal for another position as silence', () => {
    const { e } = firstAttempt();
    expect(decide(e, { kind: 'unsigned' })).toBe('resubmit');
    expect(
      decide(e, {
        kind: 'refusal',
        refusal: { id: 'R9', position: e.position + 1, digest: e.digest, signed: true },
      }),
    ).toBe('resubmit');
    expect(
      decide(e, {
        kind: 'refusal',
        refusal: { id: 'R9', position: e.position, digest: e.digest, signed: false },
      }),
    ).toBe('resubmit');
  });

  it('reads a head over a different digest at its own position as equivocation', () => {
    const { e } = firstAttempt();
    expect(decide(e, { kind: 'head', position: e.position, digest: 'somebody-else' })).toBe(
      'equivocation',
    );
  });
});

// falsifies: f-992bc91-outbound-envelope-spool-undefined
describe('§7.4 — retention, which is the same store', () => {
  const settled = () => {
    let c = client();
    let s = service();
    for (let i = 0; i < 6; i++) {
      const r = reserve(c);
      const e = mint(r.position, c.gen, null);
      c = spoolAdd(r.c, e);
      s = submit(s, e).s;
      c = setState(c, e.digest, 'accepted');
    }
    // Newest first: the second-newest is the floor.
    return { ...c, checkpoints: [5, 3] };
  };

  it('trims resolved records only below the second-newest checkpoint', () => {
    const kept = trim(settled());
    expect(kept.spool.map((r) => r.envelope.position)).toEqual([3, 4, 5, 6]);
  });

  it('never trims an unresolved record, whatever the floor', () => {
    let c = settled();
    const oldest = c.spool[0];
    if (oldest === undefined) throw new Error('no settled records to unsettle');
    c = setState(c, oldest.envelope.digest, 'sent');
    const kept = trim(c);
    expect(kept.spool.some((r) => r.envelope.position === 1)).toBe(true);
    expect(kept.spool.find((r) => r.envelope.position === 1)?.state).toBe('sent');
  });

  it('keeps everything while fewer than two checkpoints are admitted', () => {
    const c = { ...settled(), checkpoints: [5] };
    expect(trim(c).spool).toHaveLength(6);
  });
});
