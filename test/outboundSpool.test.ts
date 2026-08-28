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
 * **The `S0-4` return (2026-08-28) amended the model at both findings' edges.**
 * The reservation stages its own durable spool row in the grant's transaction,
 * so a counted position always has an identity a recovery can occupy — the
 * abandoned position `FU-10` convicted is resolved by the model's own recovery
 * rule rather than by a counter gap nobody can close (the crash schedule itself
 * is in test/storageSchedule.test.ts, under the scheduler). And the refusal's
 * subject carries the refused envelope's own epoch while the verifier resolves
 * from the lineage's current certification — never from the answer — so the
 * delayed old-key re-mint `FU-06` convicted is silence both ways.
 *
 * **Why this is a test and not a vector.** The refusal's *bytes* are published —
 * `test/vectors/antireplay.json` carries the message, its signature, the
 * lineage's certification history and seventeen refusal negatives. What is here
 * is the part that is not a value: what survives a kill at each point, what a
 * service may answer twice, and whether a credential can still make progress
 * after two refusals. There is nothing to publish as bytes.
 *
 * **Signatures are modelled as a key token, deliberately.** Whether Ed25519
 * works is row 1's, and whether the refusal binds its nine fields is the
 * generator's. What this file must not do is re-prove either and call the
 * sequence tested — but *which key answered* is exactly what `FU-06` turns on,
 * so the token names the key and the client resolves the one it will accept.
 */

import { describe, expect, it } from 'vitest';

type SpoolState = 'reserved' | 'minted' | 'sent' | 'accepted' | 'closed';

interface Envelope {
  position: number;
  gen: number;
  /** The epoch this envelope references — fixed at mint, in the AAD and the signature. */
  epoch: number;
  /** Stands for the whole immutable byte string: nonce, ciphertext, signature. */
  digest: string;
  /** The refusal this attempt was licensed by; null for the first at a position. */
  parent: string | null;
}

/**
 * One spool row — §6.1's store at `kind: 'outbound'`, existing from the
 * reservation onward (`FU-10`): `envelope` is null exactly while `reserved`,
 * because the bytes do not exist yet.
 */
interface SpoolRecord {
  position: number;
  /** The generation whose budget counted this row's licence. */
  gen: number;
  state: SpoolState;
  envelope: Envelope | null;
}

interface Refusal {
  id: string;
  position: number;
  digest: string;
  /** The refused envelope's own referenced epoch — the fifth subject field (`FU-06`). */
  epoch: number;
  /** The key that signed it; a token here, bytes in the generator. */
  signedBy: string;
}

type Answer =
  | { kind: 'head'; position: number; digest: string }
  | { kind: 'refusal'; refusal: Refusal }
  | { kind: 'unsigned' }
  | { kind: 'nothing' };

type Verdict = 'accepted' | 're-mint' | 'resubmit' | 'equivocation';

// --- the client ----------------------------------------------------------------

interface Client {
  /** The durable spool: §6.1's store at `kind: 'outbound'`, rows from the reservation on. */
  spool: SpoolRecord[];
  /** `PositionCounter`. Not §6.1's `seq` — a different number with a different owner. */
  nextPosition: number;
  reserved: Record<number, number>;
  gen: number;
  /** The epoch in force from this client's authenticated lineage — its tip. */
  epoch: number;
  /** epoch -> the `K_accept` that epoch certifies: the lineage's certification history. */
  certified: Record<number, string>;
  /** The newest checkpoint positions this device has seen admitted, newest first. */
  checkpoints: number[];
}

const client = (): Client => ({
  spool: [],
  nextPosition: 1,
  reserved: {},
  gen: 3,
  epoch: 9,
  certified: { 8: 'K8', 9: 'K9' },
  checkpoints: [],
});

/**
 * §7.4's rule: everything that is not a verified answer about my envelope is
 * silence. The verifier is resolved from the lineage's current certification —
 * never from the answer, and never merely from an epoch once held (`FU-06`) —
 * and the subject comparison covers the refused envelope's own epoch. A refusal
 * under a retired epoch's key fails the resolution; one naming another epoch
 * fails the subject; both are silence.
 */
const decide = (c: Client, mine: Envelope, answer: Answer): Verdict => {
  switch (answer.kind) {
    case 'head':
      if (answer.position !== mine.position) return 'resubmit';
      return answer.digest === mine.digest ? 'accepted' : 'equivocation';
    case 'refusal': {
      const r = answer.refusal;
      if (r.signedBy !== c.certified[c.epoch]) return 'resubmit';
      if (r.position !== mine.position) return 'resubmit';
      if (r.digest !== mine.digest) return 'resubmit';
      if (r.epoch !== mine.epoch) return 'resubmit';
      return 're-mint';
    }
    default:
      return 'resubmit';
  }
};

/**
 * One durable transaction: grant the position, count it against the generation,
 * and stage the spool row — the count and the identity commit together, so a
 * counted position with no durable identity cannot exist (`FU-10`).
 */
const reserve = (c: Client): { c: Client; position: number } => ({
  c: {
    ...c,
    nextPosition: c.nextPosition + 1,
    reserved: { ...c.reserved, [c.gen]: (c.reserved[c.gen] ?? 0) + 1 },
    spool: [
      ...c.spool,
      { position: c.nextPosition, gen: c.gen, state: 'reserved', envelope: null },
    ],
  },
  position: c.nextPosition,
});

let minted = 0;
/** Fresh bytes every time, which is exactly why they have to be kept. */
const freshBytes = (position: number): string => `E${position}#${++minted}`;

/**
 * The promote: fill the reserved row with freshly minted bytes, in the
 * promote's own transaction. When the generation moved between the grant and
 * the mint, the fresh licence is counted where the mint seals and the
 * abandoned licence stays counted where it was (`FU-09`'s rule, at this
 * counter).
 */
const mintAt = (c: Client, position: number, parent: string | null): { c: Client; e: Envelope } => {
  const row = c.spool.find((r) => r.position === position && r.state === 'reserved');
  if (row === undefined) throw new Error(`position ${position} has no reserved row to promote`);
  const e: Envelope = { position, gen: c.gen, epoch: c.epoch, digest: freshBytes(position), parent };
  const rotated = row.gen !== c.gen;
  return {
    c: {
      ...c,
      reserved: rotated ? { ...c.reserved, [c.gen]: (c.reserved[c.gen] ?? 0) + 1 } : c.reserved,
      spool: c.spool.map((r) =>
        r === row ? { ...r, gen: c.gen, state: 'minted', envelope: e } : r,
      ),
    },
    e,
  };
};

/**
 * A successor attempt at an already-granted position, licensed by a refusal:
 * its row is staged with its bytes in one transaction — the position needs no
 * second grant, and the original row keeps its own lifecycle beside it.
 */
const mintSuccessor = (
  c: Client,
  position: number,
  parent: string,
): { c: Client; e: Envelope } => {
  const e: Envelope = { position, gen: c.gen, epoch: c.epoch, digest: freshBytes(position), parent };
  return {
    c: { ...c, spool: [...c.spool, { position, gen: c.gen, state: 'minted', envelope: e }] },
    e,
  };
};

/**
 * The reload path (`FU-10`): every `reserved` row is occupied with a fresh
 * first attempt at its own position. The row itself is the licence to do so —
 * bytes are staged before the first network byte, so `reserved` is durable
 * proof nothing was ever sent — and occupation needs nothing the crash
 * destroyed. Rows at `minted` or beyond are NOT re-minted: they hold exact
 * bytes, and the spool's rule for those is resubmit.
 */
const recover = (c: Client): Client =>
  c.spool
    .filter((r) => r.state === 'reserved')
    .reduce((acc, r) => mintAt(acc, r.position, null).c, c);

const setState = (c: Client, digest: string, state: SpoolState): Client => ({
  ...c,
  spool: c.spool.map((r) => (r.envelope?.digest === digest ? { ...r, state } : r)),
});

const pending = (c: Client): SpoolRecord[] =>
  c.spool.filter((r) => r.state === 'minted' || r.state === 'sent');

/**
 * Row 6's floor: a resolved record goes only below the **second-newest**
 * checkpoint, and an unresolved one — a `reserved` row included — never goes
 * at all.
 */
const trim = (c: Client): Client => {
  const floor = c.checkpoints[1];
  if (floor === undefined) return c;
  return {
    ...c,
    spool: c.spool.filter(
      (r) => (r.state !== 'accepted' && r.state !== 'closed') || r.position >= floor,
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
  /** The epoch in force at the service, and the `K_accept` it certifies. */
  epoch: number;
  kAccept: string;
}

const service = (): Service => ({ accepted: {}, closed: {}, refusals: 0, epoch: 9, kAccept: 'K9' });

/**
 * An epoch event that also rotates `K_accept` — the ordinary rotation whose
 * retired key `FU-06`'s negatives hold.
 */
const rotate = (s: Service): Service => ({ ...s, epoch: s.epoch + 1, kAccept: `K${s.epoch + 1}` });

/** The client learns the successor epoch through its authenticated lineage. */
const syncLineage = (c: Client, s: Service): Client => ({
  ...c,
  epoch: s.epoch,
  certified: { ...c.certified, [s.epoch]: s.kAccept },
});

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
  // behind it -- two links at one position. The re-answer is the same Refuse
  // message under the live key: refusal_id binds the message, not the
  // signature, so the licence survives an ordinary rotation (S0-4 return).
  const already = s.closed[e.digest];
  if (already !== undefined) {
    return { s, answer: { kind: 'refusal', refusal: { ...already, signedBy: s.kAccept } } };
  }

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
    // The refusal's epoch is the refused envelope's own -- the subject says
    // which envelope; the signature is the live key's (FU-06).
    const refusal: Refusal = {
      id: `R${s.refusals + 1}`,
      position: e.position,
      digest: e.digest,
      epoch: e.epoch,
      signedBy: s.kAccept,
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
    c = mintAt(r.c, r.position, null).c;

    // The page dies here. Everything below reads only what is durable.
    const recovered = pending(c);
    expect(recovered).toHaveLength(1);
    const resent = recovered[0]?.envelope;
    if (resent === undefined || resent === null) {
      throw new Error('the spool lost the only thing it is for');
    }

    let s = service();
    const first = submit(s, resent);
    s = first.s;
    expect(decide(c, resent, first.answer)).toBe('accepted');
  });

  it('accepts one digest when a lost reply causes a resubmission', () => {
    let c = client();
    const r = reserve(c);
    const m = mintAt(r.c, r.position, null);
    const e = m.e;
    c = setState(m.c, e.digest, 'sent');

    let s = service();
    s = submit(s, e).s; // accepted; the reply is lost
    expect(decide(c, e, { kind: 'nothing' })).toBe('resubmit');

    const again = submit(s, e); // the identical bytes, from the spool
    expect(decide(c, e, again.answer)).toBe('accepted');
    expect(Object.keys(again.s.accepted)).toHaveLength(1);
  });

  it('cannot reproduce the bytes without the spool, which is the finding', () => {
    const c = client();
    const first: Envelope = { position: 1, gen: 3, epoch: 9, digest: freshBytes(1), parent: null };
    const second: Envelope = { position: 1, gen: 3, epoch: 9, digest: freshBytes(1), parent: null };
    // Re-enveloping the same delta produces different bytes at the same
    // position, and a service that accepted the first reads the second as a
    // second link there.
    expect(second.digest).not.toBe(first.digest);
    const s = submit(service(), first).s;
    expect(decide(c, second, submit(s, second).answer)).toBe('resubmit');
  });
});

// falsifies: f-992bc91-outbound-envelope-spool-undefined
describe('§7.4 — the position is reserved with its identity, and gaps are occupied rather than skipped', () => {
  it('gives two tabs different positions, each with its own staged row', () => {
    const shared = client();
    const a = reserve(shared);
    const b = reserve(a.c); // serialized by the same durable transaction
    expect(a.position).not.toBe(b.position);
    expect(b.position).toBe(a.position + 1);
    // The grant and the identity commit together (FU-10): both positions are
    // durable rows before either envelope exists.
    expect(b.c.spool.map((r) => [r.position, r.state])).toEqual([
      [a.position, 'reserved'],
      [b.position, 'reserved'],
    ]);
  });

  it('counts a reservation abandoned before minting against the generation budget', () => {
    let c = client();
    c = reserve(c).c; // reserved, then a kill before mint
    const r = reserve(c);
    c = mintAt(r.c, r.position, null).c;
    // Two invocations were licensed and one envelope exists. SP 800-38D bounds
    // invocations, so the count that matters is the reservation.
    expect(c.reserved[c.gen]).toBe(2);
    expect(c.spool.filter((r2) => r2.envelope !== null)).toHaveLength(1);
    // And the raw position is not that count: it is 3 here, and would be wrong
    // the moment a generation rotates.
    expect(c.nextPosition).toBe(3);
    // The abandoned licence is not a bare number any more: its row is durable,
    // which is what recovery reads (FU-10).
    expect(c.spool.find((r2) => r2.state === 'reserved')?.position).toBe(1);
  });

  it('does not renumber around a gap', () => {
    let c = client();
    const abandoned = reserve(c);
    c = abandoned.c;
    const next = reserve(c);
    // The chain links n to n-1, so the abandoned position must be occupied,
    // never silently skipped by giving its number away.
    expect(next.position).toBe(abandoned.position + 1);
  });

  it('occupies an abandoned reservation at recovery, and the chain advances through it', () => {
    let c = client();
    const abandoned = reserve(c);
    c = abandoned.c; // the page dies before the mint; the row survives (FU-10)
    const next = reserve(c);
    const m = mintAt(next.c, next.position, null);
    c = m.c;

    // Recovery reads the reserved row and occupies it: fresh bytes, first
    // attempt, parent zeros — the row itself is durable proof nothing was
    // ever sent, so no licence is owed. Before the return neither stated
    // branch was executable: there was no reservation object to bind and no
    // digest a refusal could close (ST-05).
    c = recover(c);
    const occupied = c.spool.find((r) => r.position === abandoned.position);
    if (occupied === undefined || occupied.envelope === null) {
      throw new Error('recovery left the abandoned position unidentified, which is the finding');
    }
    expect(occupied.state).toBe('minted');
    expect(occupied.envelope.parent).toBeNull();

    // Both submit in position order and both are accepted: the chain advances
    // through the once-abandoned position rather than stalling at it.
    let s = service();
    const first = submit(s, occupied.envelope);
    s = first.s;
    expect(decide(c, occupied.envelope, first.answer)).toBe('accepted');
    const second = submit(s, m.e);
    expect(decide(c, m.e, second.answer)).toBe('accepted');
    expect(Object.keys(second.s.accepted).map(Number).sort()).toEqual([
      abandoned.position,
      next.position,
    ]);
  });

  it('counts a recovery mint under the generation it seals under, keeping the abandoned licence', () => {
    let c = client();
    c = reserve(c).c; // licence counted under gen 3, then a kill before mint
    c = { ...c, gen: 4 }; // the marker moved before recovery ran
    c = recover(c);
    // The fresh mint seals under the current generation and is counted there,
    // in the promote's own transaction; the abandoned licence stays counted
    // where it was (FU-09's rule, at this counter).
    expect(c.reserved[3]).toBe(1);
    expect(c.reserved[4]).toBe(1);
    expect(c.spool.find((r) => r.position === 1)?.envelope?.gen).toBe(4);
  });

  it('re-mints only what was never minted — a row with bytes resubmits them exactly', () => {
    let c = client();
    const r = reserve(c);
    const m = mintAt(r.c, r.position, null);
    c = m.c; // killed after the promote
    const before = m.e.digest;
    c = recover(c);
    // Recovery is not a re-mint license: the row holds exact bytes, and the
    // spool's rule for those is resubmit (falsifier 23).
    expect(c.spool.find((row) => row.position === r.position)?.envelope?.digest).toBe(before);
  });
});

// falsifies: f-745e332-envelope-refusal-carrier-missing
describe('§7.5 — the refusal, its five-field subject, and the successor chain it licenses', () => {
  const firstAttempt = () => {
    let c = client();
    const r = reserve(c);
    const m = mintAt(r.c, r.position, null);
    c = setState(m.c, m.e.digest, 'sent');
    return { c, e: m.e };
  };

  it('licenses exactly one successor, which binds its parent', () => {
    const { c, e } = firstAttempt();
    let s = service();
    const refused = submit(s, e, true);
    s = refused.s;
    expect(decide(c, e, refused.answer)).toBe('re-mint');

    const refusal = (refused.answer as { kind: 'refusal'; refusal: Refusal }).refusal;
    const successor = mintSuccessor(setState(c, e.digest, 'closed'), e.position, refusal.id);
    const ok = submit(s, successor.e);
    expect(decide(successor.c, successor.e, ok.answer)).toBe('accepted');
  });

  it('refuses a successor at a position its refusal does not name', () => {
    const { c, e } = firstAttempt();
    let s = service();
    const refused = submit(s, e, true);
    s = refused.s;
    const refusal = (refused.answer as { kind: 'refusal'; refusal: Refusal }).refusal;

    // A licence for position n does not license n+1, which would be skipping.
    // Position n+1 is untouched here, so the one-digest-per-position rule
    // cannot be what refuses this.
    const skipped: Envelope = {
      position: e.position + 1,
      gen: e.gen,
      epoch: e.epoch,
      digest: freshBytes(e.position + 1),
      parent: refusal.id,
    };
    expect(decide(c, skipped, submit(s, skipped).answer)).toBe('resubmit');
    expect(submit(s, skipped).s.accepted[e.position + 1]).toBeUndefined();
  });

  it('refuses a same-position refusal for a digest that is not mine', () => {
    const { c, e } = firstAttempt();
    // The generator publishes this as bytes; here it is the verdict. Without it
    // a verifier could read any signed refusal at its position as its own.
    expect(
      decide(c, e, {
        kind: 'refusal',
        refusal: {
          id: 'R9',
          position: e.position,
          digest: 'another-attempt',
          epoch: e.epoch,
          signedBy: 'K9',
        },
      }),
    ).toBe('resubmit');
  });

  it('treats a genuinely signed refusal naming another epoch as silence', () => {
    const { c, e } = firstAttempt();
    // The live key really signed it, and it is not about this envelope: same
    // position, same digest, another epoch. The fifth subject field is what
    // refuses it (FU-06, falsifier 24) — before the return nothing compared
    // the epoch, so this licensed a re-mint.
    expect(
      decide(c, e, {
        kind: 'refusal',
        refusal: {
          id: 'R9',
          position: e.position,
          digest: e.digest,
          epoch: e.epoch - 1,
          signedBy: 'K9',
        },
      }),
    ).toBe('resubmit');
  });

  it("treats a refusal under a retired epoch's key as silence", () => {
    const { c, e } = firstAttempt();
    // A-03's delayed old-key compromise: epoch 8 certified K8 and the rotation
    // at 9 retired it. A perfect subject under that once-certified key
    // licenses nothing, because the verifier resolves from the lineage's
    // current certification — and "an epoch it holds", the pre-return rule,
    // accepted exactly this (falsifier 25).
    expect(c.certified[8]).toBe('K8'); // genuinely certified, once
    expect(
      decide(c, e, {
        kind: 'refusal',
        refusal: {
          id: 'R9',
          position: e.position,
          digest: e.digest,
          epoch: e.epoch,
          signedBy: 'K8',
        },
      }),
    ).toBe('resubmit');
  });

  it('holds a refusal signed ahead of its lineage until the lineage catches up', () => {
    const attempt = firstAttempt();
    let c = attempt.c;
    const e = attempt.e;
    let s = rotate(service()); // the service is at epoch 10 under K10
    const refused = submit(s, e, true);
    s = refused.s;

    // The answer is genuine and ahead of the client's tip: silence, resubmit
    // (falsifier 26). Nothing is lost — the spool holds the bytes.
    expect(decide(c, e, refused.answer)).toBe('resubmit');

    // The lineage catches up, and the same answer verifies. The licence works
    // exactly when the re-mint is possible, because the successor references
    // the current epoch the same catch-up supplies.
    c = syncLineage(c, s);
    expect(decide(c, e, refused.answer)).toBe('re-mint');
  });

  it('refuses a successor naming a refusal nobody issued', () => {
    const { c, e } = firstAttempt();
    const s = submit(service(), e, true).s;
    const invented: Envelope = {
      position: e.position,
      gen: e.gen,
      epoch: e.epoch,
      digest: freshBytes(e.position),
      parent: 'R-never-issued',
    };
    expect(decide(c, invented, submit(s, invented).answer)).toBe('resubmit');
  });

  it('never accepts a refused digest, and re-answers with the same message under the live key', () => {
    const attempt = firstAttempt();
    let c = attempt.c;
    const e = attempt.e;
    let s = service();
    const refused = submit(s, e, true);
    s = refused.s;
    const refusal = (refused.answer as { kind: 'refusal'; refusal: Refusal }).refusal;
    const successor = mintSuccessor(setState(c, e.digest, 'closed'), e.position, refusal.id);
    c = successor.c;
    s = submit(s, successor.e).s;

    // K_accept rotates — an ordinary epoch event — and then the original
    // finally arrives at the service.
    s = rotate(s);
    c = syncLineage(c, s);
    const late = submit(s, e);
    if (late.answer.kind !== 'refusal') throw new Error('a closed digest must re-answer with its refusal');
    // The same Refuse message — same id, same subject epoch — under the live
    // key: refusal_id binds the message and not the signature, so the licence
    // survives the rotation and the current client verifies it.
    expect(late.answer.refusal.id).toBe(refusal.id);
    expect(late.answer.refusal.epoch).toBe(e.epoch);
    expect(late.answer.refusal.signedBy).toBe(s.kAccept);
    expect(decide(c, e, late.answer)).toBe('re-mint');
    // Its position holds the successor's digest and not this one.
    expect(late.s.accepted[e.position]).not.toBe(e.digest);
  });

  it('lets the chain continue when a successor is itself refused', () => {
    // RC-4A's text caps the chain at attempt 1. That stalls a credential the
    // second time an epoch moves under it, so what is capped is the fork.
    const attempt = firstAttempt();
    let c = attempt.c;
    const e = attempt.e;
    let s = service();
    let answer = submit(s, e, true);
    s = answer.s;
    let parent = (answer.answer as { kind: 'refusal'; refusal: Refusal }).refusal.id;

    let at = e;
    for (let i = 0; i < 2; i++) {
      const next = mintSuccessor(setState(c, at.digest, 'closed'), e.position, parent);
      c = next.c;
      at = next.e;
      answer = submit(s, at, true);
      s = answer.s;
      expect(decide(c, at, answer.answer)).toBe('re-mint');
      parent = (answer.answer as { kind: 'refusal'; refusal: Refusal }).refusal.id;
    }

    const finally_ = mintSuccessor(setState(c, at.digest, 'closed'), e.position, parent);
    expect(decide(finally_.c, finally_.e, submit(s, finally_.e).answer)).toBe('accepted');
  });

  it('continues the chain across two epoch moves, re-minting under the current epoch each time', () => {
    // The liveness case that killed RC-4A's cap, now with the epochs real: an
    // envelope in flight across a rotation is refused stale, its successor
    // crosses the next rotation and is refused again, and the third attempt
    // lands. Each refusal names the epoch its envelope referenced; each
    // verifies under the certification in force after the catch-up the re-mint
    // needs anyway.
    let c = client();
    let s = service();
    const r = reserve(c);
    const m = mintAt(r.c, r.position, null);
    c = setState(m.c, m.e.digest, 'sent');
    let at = m.e;
    expect(at.epoch).toBe(9);

    for (let i = 0; i < 2; i++) {
      s = rotate(s); // the epoch moves under the in-flight attempt
      const refused = submit(s, at, true);
      s = refused.s;
      c = syncLineage(c, s);
      expect(decide(c, at, refused.answer)).toBe('re-mint');
      const licence = (refused.answer as { kind: 'refusal'; refusal: Refusal }).refusal;
      expect(licence.epoch).toBe(at.epoch); // the subject is the refused envelope's own epoch
      const next = mintSuccessor(setState(c, at.digest, 'closed'), at.position, licence.id);
      c = next.c;
      at = next.e;
      expect(at.epoch).toBe(s.epoch); // the re-mint references the current epoch
    }

    expect(decide(c, at, submit(s, at).answer)).toBe('accepted');
  });

  it('treats an unsigned body and a refusal for another position as silence', () => {
    const { c, e } = firstAttempt();
    expect(decide(c, e, { kind: 'unsigned' })).toBe('resubmit');
    expect(
      decide(c, e, {
        kind: 'refusal',
        refusal: {
          id: 'R9',
          position: e.position + 1,
          digest: e.digest,
          epoch: e.epoch,
          signedBy: 'K9',
        },
      }),
    ).toBe('resubmit');
    expect(
      decide(c, e, {
        kind: 'refusal',
        refusal: {
          id: 'R9',
          position: e.position,
          digest: e.digest,
          epoch: e.epoch,
          signedBy: 'K-uncertified',
        },
      }),
    ).toBe('resubmit');
  });

  it('reads a head over a different digest at its own position as equivocation', () => {
    const { c, e } = firstAttempt();
    expect(decide(c, e, { kind: 'head', position: e.position, digest: 'somebody-else' })).toBe(
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
      const m = mintAt(r.c, r.position, null);
      c = m.c;
      s = submit(s, m.e).s;
      c = setState(c, m.e.digest, 'accepted');
    }
    // Newest first: the second-newest is the floor.
    return { ...c, checkpoints: [5, 3] };
  };

  it('trims resolved records only below the second-newest checkpoint', () => {
    const kept = trim(settled());
    expect(kept.spool.map((r) => r.position)).toEqual([3, 4, 5, 6]);
  });

  it('never trims an unresolved record, whatever the floor — a reserved row included', () => {
    let c = settled();
    const oldest = c.spool[0];
    if (oldest === undefined || oldest.envelope === null) {
      throw new Error('no settled records to unsettle');
    }
    c = setState(c, oldest.envelope.digest, 'sent');
    // And an abandoned reservation below the floor is unresolved too: it is
    // never trimmed, because trimming it would silently skip the position.
    c = { ...c, spool: [{ position: 0, gen: c.gen, state: 'reserved' as const, envelope: null }, ...c.spool] };
    const kept = trim(c);
    expect(kept.spool.some((r) => r.position === 1)).toBe(true);
    expect(kept.spool.find((r) => r.position === 1)?.state).toBe('sent');
    expect(kept.spool.find((r) => r.position === 0)?.state).toBe('reserved');
  });

  it('keeps everything while fewer than two checkpoints are admitted', () => {
    const c = { ...settled(), checkpoints: [5] };
    expect(trim(c).spool).toHaveLength(6);
  });
});
