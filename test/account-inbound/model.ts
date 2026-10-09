/** Executable candidate contract, TEST ONLY. An atomic JS assignment is not IndexedDB evidence. */
import { createHash } from 'node:crypto';
import { decodeNetworkEnvelope, openNetworkEnvelope } from '../../account-protocol/envelope';
import {
  verifyPositionResponse,
  ZERO_REFUSAL,
  type Bytes,
} from '../../account-protocol/positionDecision';
import { Y, hasPendingUpdates, sameDocState } from '../../src/crdt/yjs';
import type { Authority, Packet } from './fixtures';
const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
const bytes = (s: string): Bytes => new Uint8Array(Buffer.from(s, 'hex'));
const hash = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');
const json = (v: unknown): Bytes => new TextEncoder().encode(JSON.stringify(v));
export const identity = (publisher: string, position: number) => publisher + ':' + position;
interface Event {
  publisher: string;
  position: number;
  previous: string;
  link: string;
  wire: string;
  proof: string;
  request: string;
  page: string;
  through: number;
  updates: Bytes[];
  kind: 'received' | 'conflict';
}
export interface Disk {
  fence: number;
  baselineId: string;
  events: Event[];
  content: Bytes[];
  witness: string;
}
interface Prepared {
  event: Event;
  before: string;
  authority: string;
  revision: number;
}
const witness = (events: Event[]) =>
  hash(JSON.stringify(events.map((e) => ({ ...e, updates: e.updates.map(hex) }))));
export class CandidateReceiver {
  disk: Disk;
  doc: InstanceType<typeof Y.Doc>;
  prepared: Prepared | null = null;
  revision = 0;
  closed = false;
  readonly captures: Bytes[] = [];
  constructor(
    readonly baseline: Bytes,
    readonly baselineId: string,
    readonly authority: Authority,
    readonly kg: Bytes,
  ) {
    this.disk = { fence: 9, baselineId, events: [], content: [], witness: witness([]) };
    this.doc = this.replay([]);
  }
  replay(updates: Bytes[]) {
    const doc = new Y.Doc({ gc: false });
    try {
      Y.applyUpdate(doc, this.baseline);
      for (const u of updates) Y.applyUpdate(doc, u);
      return doc;
    } catch (error) {
      doc.destroy();
      throw error;
    }
  }
  get cursor(): Record<string, number> {
    const value: Record<string, number> = {};
    for (const e of this.disk.events) if (e.kind === 'received') value[e.publisher] = e.position;
    return value;
  }
  get blocked() {
    return this.disk.events.some((e) => e.kind === 'conflict');
  }
  snapshot() {
    return hash(JSON.stringify(this.disk));
  }
  async prepare(
    packet: Packet,
    expectedRequest: Bytes,
    now = 1000,
  ): Promise<'received' | 'duplicate' | 'conflict'> {
    if (this.closed || this.blocked || this.prepared) throw Error('Unavailable lifetime');
    if (packet.request.length > 4096 || packet.page.length > 10 * 1024 * 1024)
      throw Error('Transport size');
    // Own all byte strings before the first crypto await, including retained evidence.
    packet = { request: packet.request.slice(), page: packet.page.slice() };
    expectedRequest = expectedRequest.slice();
    const before = this.snapshot(),
      revision = this.revision,
      authority = JSON.stringify(this.authority);
    const r = JSON.parse(new TextDecoder().decode(packet.request)),
      p = JSON.parse(new TextDecoder().decode(packet.page));
    if (
      hex(packet.request) !== hex(expectedRequest) ||
      hex(json(r)) !== hex(packet.request) ||
      hex(json(p)) !== hex(packet.page) ||
      r.length !== 15 ||
      p.length !== 7 ||
      r[0] !== 'done/private-read/v2' ||
      r[1] !== 2 ||
      p[0] !== 'done/private-read-page/v2' ||
      p[1] !== 2
    )
      throw Error('Request binding');
    const a = this.authority,
      reader = a.members[r[5]],
      publisher = a.members[r[6]];
    if (
      r[2] !== a.serviceId ||
      r[3] !== a.origin ||
      r[4] !== a.workspace ||
      r[5] !== a.reader ||
      r[7] !== a.lineage ||
      r[8] !== a.head ||
      r[9] !== a.tip ||
      !reader?.active ||
      !publisher?.active
    )
      throw Error('Membership or scope');
    if (
      r[13] <= now ||
      r[13] > now + 60000 ||
      r[11] !== 1 ||
      p[2] !== hash(packet.request) ||
      p[5].length !== 1 ||
      p[4] !== r[10] + 1 ||
      p[3] < p[4]
    )
      throw Error('Page extent or expiry');
    const verify = async (key: string, sig: string, message: Bytes) => {
      const pub = await crypto.subtle.importKey('raw', bytes(key), 'Ed25519', false, ['verify']);
      if (!(await crypto.subtle.verify('Ed25519', pub, bytes(sig), message)))
        throw Error('Signature');
    };
    await verify(reader.publicKey, r[14], json(r.slice(0, -1)));
    await verify(a.acceptanceKey, p[6], json(p.slice(0, -1)));
    const wire = bytes(p[5][0][0]),
      proof = bytes(p[5][0][1]),
      e = decodeNetworkEnvelope(wire);
    const position = p[4],
      cursor = this.cursor[r[6]] ?? 0;
    if (e.seq !== position || e.credential_id !== r[6] || position > cursor + 1)
      throw Error('Missing prefix');
    if (
      p[3] <
      Math.max(0, ...this.disk.events.filter((v) => v.publisher === r[6]).map((v) => v.through))
    )
      throw Error('Regressed advertised head');
    const previous =
      position === 1
        ? ZERO_REFUSAL
        : this.disk.events.find(
            (v) => v.publisher === r[6] && v.position === position - 1 && v.kind === 'received',
          )?.link;
    if (!previous) throw Error('Missing baseline');
    const evidence = await verifyPositionResponse(
      proof,
      {
        workspace: a.workspace,
        credential: r[6],
        position,
        digest: hex(e.digest),
        epoch: e.epoch,
        previous,
        parent: ZERO_REFUSAL,
      },
      a,
    );
    if (evidence.kind !== 'accepted' || evidence.head.final)
      throw Error('Unproved or unsupported acceptance');
    const pub = await crypto.subtle.importKey('raw', bytes(publisher.publicKey), 'Ed25519', false, [
      'verify',
    ]);
    const body = await openNetworkEnvelope(
      wire,
      { v: 2, workspace_id: a.workspace, credential_id: r[6], epoch: a.tip, gen: a.generation },
      pub,
      this.kg,
    );
    if (
      !(
        (body.actor_kind === 'human' && body.actor_id === publisher.principal) ||
        (body.actor_kind === 'system' && body.actor_id === 'system')
      )
    )
      throw Error('Actor binding');
    if (
      wire.length > 512 * 1024 ||
      body.updates.length > 255 ||
      body.updates.reduce((n, u) => n + u.length, 0) > 512 * 1024
    )
      throw Error('Unsupported receive size');
    for (const u of body.updates) Y.decodeUpdate(u);
    const prior = this.disk.events.find(
      (v) => v.publisher === r[6] && v.position === position && v.kind === 'received',
    );
    const current = () => {
      if (
        this.closed ||
        this.revision !== revision ||
        this.snapshot() !== before ||
        JSON.stringify(this.authority) !== authority
      )
        throw Error('Stale validation');
    };
    current();
    if (prior && prior.wire === hex(wire)) return 'duplicate';
    const event: Event = {
      publisher: r[6],
      position,
      previous,
      link: evidence.head.link,
      wire: hex(wire),
      proof: hex(proof),
      request: hex(packet.request),
      page: hex(packet.page),
      through: p[3],
      updates: body.updates.map((u) => u.slice()),
      kind: prior ? 'conflict' : 'received',
    };
    if (
      json({ ...event, updates: undefined }).length +
        body.updates.reduce((n, u) => n + u.length, 0) >
      4 * 1024 * 1024
    )
      throw Error('Local batch size');
    // Validation is detached. No input is visible and no cursor changes here.
    const candidate = this.replay([...this.disk.content, ...body.updates]);
    candidate.destroy();
    current();
    this.prepared = { event, before, authority, revision };
    return event.kind;
  }
  commit(cut: 'none' | 'before' | 'after' = 'none') {
    const p = this.prepared;
    if (
      !p ||
      this.closed ||
      this.revision !== p.revision ||
      this.snapshot() !== p.before ||
      JSON.stringify(this.authority) !== p.authority
    )
      throw Error('Stale commit');
    this.prepared = null;
    if (cut === 'before') {
      this.close();
      return;
    }
    const events = [...this.disk.events, structuredClone(p.event)];
    // The sole modeled durability point: evidence, original content, progress and witness together.
    this.disk = {
      ...this.disk,
      events,
      content:
        p.event.kind === 'received'
          ? [...this.disk.content, ...p.event.updates.map((u) => u.slice())]
          : this.disk.content,
      witness: witness(events),
    };
    if (cut === 'after') {
      this.close();
      return;
    }
    if (p.event.kind === 'received')
      for (const u of p.event.updates) Y.applyUpdate(this.doc, u, 'received');
  }
  close() {
    this.closed = true;
    this.prepared = null;
    this.revision++;
  }
  restart() {
    if (
      this.disk.fence !== 9 ||
      this.disk.baselineId !== this.baselineId ||
      this.disk.witness !== witness(this.disk.events)
    )
      throw Error('Unreadable receiver');
    const fromEvidence = this.replay(
        this.disk.events.filter((e) => e.kind === 'received').flatMap((e) => e.updates),
      ),
      fromContent = this.replay(this.disk.content);
    try {
      if (!sameDocState(fromEvidence, fromContent))
        throw Error('Content does not cover received evidence');
    } catch (error) {
      fromContent.destroy();
      throw error;
    } finally {
      fromEvidence.destroy();
    }
    this.doc.destroy();
    this.doc = fromContent;
    this.closed = false;
    this.prepared = null;
    this.revision++;
  }
  compact() {
    const doc = this.replay(this.disk.content);
    try {
      if (hasPendingUpdates(doc)) return false;
      this.disk = { ...this.disk, content: [new Uint8Array(Y.encodeStateAsUpdate(doc))] };
      return true;
    } finally {
      doc.destroy();
    }
  }
  dispose() {
    this.close();
    this.doc.destroy();
  }
}
