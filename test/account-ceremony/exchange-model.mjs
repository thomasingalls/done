/** Specification model, not an IndexedDB owner. Atomic saves are assumptions to test natively in C. */
import assert from 'node:assert/strict';
import * as protocol from '../../account-protocol/ceremonyExchange.ts';
import { unsigned } from './exchange-oracle.mjs';
const copy = structuredClone;
export const happy = [
  'prepare-own',
  'save-own',
  'publish-own',
  'receive-peer',
  'prepare-pair',
  'save-pair',
  'prepare-reveal',
  'save-reveal',
  'publish-reveal',
  'receive-reveal',
  'finish',
];
export const events = [
  ...happy,
  'crash',
  'bad-commit',
  'other-commit',
  'bad-reveal',
  'unsigned-stale',
  'epoch-change',
  'expire',
  'cancel',
  'restart-same',
];
export class ExchangeModel {
  constructor(fixture, role, { omitPairPersistence = false } = {}) {
    this.x = fixture;
    this.role = role;
    this.peer = role === 'existing' ? 'new' : 'existing';
    this.now = fixture.now;
    this.omitPairPersistence = omitPairPersistence;
    this.durable = {
      context: copy(fixture.context),
      nonce: fixture.nonces[role],
      own: null,
      peer: null,
      pair: null,
      reveal: null,
      peerReveal: null,
      terminal: null,
    };
    this.memory = {};
    this.sent = [];
    this.result = null;
  }
  async authority() {
    return (this.memory.authority ??= await protocol.verifyCeremonyContext(
      this.durable.context,
      this.x.f.base,
      this.x.f.successor,
      this.x.held,
      this.x.local(this.role),
      this.now,
    ));
  }
  async retainedPair() {
    const raw = this.durable.pair;
    if (!raw) return this.omitPairPersistence ? this.memory.pair : null;
    return protocol.verifyCeremonyPair(await this.authority(), raw.existing, raw.new, this.now);
  }
  async step(event) {
    if (event === 'crash') {
      this.memory = {};
      this.result = null;
      return;
    }
    if (event === 'unsigned-stale' || event === 'restart-same') return;
    if (this.durable.terminal) return;
    if (['epoch-change', 'expire', 'cancel'].includes(event)) {
      if (event === 'expire') this.now = this.durable.context.expiresAt;
      this.durable.terminal = event === 'cancel' ? 'spent' : 'restart-required';
      this.memory = {};
      this.result = null;
      return;
    }
    const d = this.durable,
      x = this.x;
    try {
      switch (event) {
        case 'prepare-own':
          await this.authority();
          this.memory.own = x.commit(this.role, d.context, d.nonce);
          break;
        case 'save-own':
          if (
            this.memory.own &&
            (!d.own || JSON.stringify(d.own) === JSON.stringify(this.memory.own))
          )
            d.own = copy(this.memory.own);
          break;
        case 'publish-own':
          if (d.own) this.sent.push({ kind: 'commit', wire: copy(d.own) });
          break;
        case 'receive-peer':
        case 'bad-commit':
        case 'other-commit': {
          if (!d.own) break;
          const input =
            event === 'bad-commit'
              ? x.signCommit(unsigned(x.commits[this.peer]), x.f.keys.authority)
              : event === 'other-commit'
                ? x.commit(this.peer, d.context, 'ff'.repeat(32))
                : x.commits[this.peer];
          const checked = await protocol.verifyCeremonyCommit(
            await this.authority(),
            input,
            this.peer,
            this.now,
          );
          if (!d.peer || JSON.stringify(d.peer) === JSON.stringify(checked)) d.peer = copy(checked);
          break;
        }
        case 'prepare-pair': {
          if (!d.own || !d.peer) break;
          const raw =
            this.role === 'existing'
              ? { existing: d.own, new: d.peer }
              : { existing: d.peer, new: d.own };
          this.memory.pair = await protocol.verifyCeremonyPair(
            await this.authority(),
            raw.existing,
            raw.new,
            this.now,
          );
          break;
        }
        case 'save-pair':
          if (this.memory.pair)
            d.pair = copy({ existing: this.memory.pair.existing, new: this.memory.pair.candidate });
          break;
        case 'prepare-reveal': {
          const p = await this.retainedPair();
          if (!p) break;
          const body = await protocol.prepareCeremonyReveal(p, d.nonce, this.now);
          this.memory.reveal = x.signReveal(unsigned(body));
          break;
        }
        case 'save-reveal':
          if (this.memory.reveal && (d.pair || this.omitPairPersistence))
            d.reveal = copy(this.memory.reveal);
          break;
        case 'publish-reveal':
          if (d.reveal && (d.pair || this.omitPairPersistence))
            this.sent.push({ kind: 'reveal', wire: copy(d.reveal), pair: copy(d.pair) });
          break;
        case 'receive-reveal':
        case 'bad-reveal': {
          const p = await this.retainedPair();
          if (!p) break;
          const input =
            event === 'bad-reveal'
              ? x.reveal(this.peer, undefined, undefined, 'ee'.repeat(32))
              : x.reveals[this.peer];
          d.peerReveal = copy(await protocol.verifyCeremonyReveal(p, input, this.peer, this.now));
          break;
        }
        case 'finish': {
          const p = await this.retainedPair();
          if (!p || !d.reveal || !d.peerReveal) break;
          this.result = await protocol.deriveCeremonyExchange(
            p,
            this.role === 'existing' ? d.reveal : d.peerReveal,
            this.role === 'existing' ? d.peerReveal : d.reveal,
            this.now,
          );
          break;
        }
        default:
          throw Error('Unknown model event');
      }
    } catch (error) {
      // Untrusted input/lost ordering may refuse. It cannot erase retained state or reset the attempt.
      if (error.message === 'Unknown model event') throw error;
    }
  }
  invariant() {
    const d = this.durable;
    assert.deepEqual(d.context, this.x.context);
    assert.equal(d.nonce, this.x.nonces[this.role]);
    for (const sent of this.sent.filter((s) => s.kind === 'reveal')) {
      assert(sent.pair, 'Nonce left before the signed pair was durable');
      assert.deepEqual(sent.wire.contextHash, this.x.contextHash(d.context));
      assert.equal(sent.pair.existing.role, 'existing');
      assert.equal(sent.pair.new.role, 'new');
    }
    const released = this.sent
      .filter((s) => s.kind === 'reveal')
      .map((s) => JSON.stringify(s.wire));
    assert(new Set(released).size <= 1, 'A retry changed the reveal');
    if (this.result) {
      assert(d.pair && d.reveal && d.peerReveal && !d.terminal);
      assert.deepEqual(this.result, this.x.result);
    }
  }
}
