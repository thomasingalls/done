// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createPrivateKey, sign } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { verifyInboundPage, type InboundContext } from '../src/crdt/accountInbound';
import {
  decodeInboundPage,
  encodeInboundPage,
  inboundPageMessage,
} from '../account-protocol/inboundTransport';
import { Y } from '../src/crdt/yjs';
const corpus = JSON.parse(readFileSync('test/vectors/account-transport.json', 'utf8'));
const f = corpus.fixture;
const bytes = (hex: string): Uint8Array<ArrayBuffer> => new Uint8Array(Buffer.from(hex, 'hex'));
const wire = (id: string): Uint8Array<ArrayBuffer> =>
  bytes(corpus.vectors.find((v: { id: string }) => v.id === id).expected.messageHex);
const context = (): InboundContext => ({
  baseline: { kind: 'promotion-genesis', id: 'aa'.repeat(32) },
  service: { id: f.base.serviceId, origin: f.base.origin },
  authority: {
    workspace: f.base.workspace,
    lineage: f.base.lineage,
    head: f.base.head,
    tip: 1,
    acceptanceKey: f.keys.acceptance.publicKey,
  },
  creatingCredential: f.base.credential,
  reader: { id: f.base.reader, publicKey: f.keys.reader.publicKey, active: true },
  publisher: {
    id: f.base.credential,
    publicKey: f.keys.member.publicKey,
    principal: f.base.credential,
    active: true,
    system: false,
  },
  generation: 1,
  generationKey: bytes(f.kg),
  prefix: { position: 0, link: '00'.repeat(32), observedThrough: 0 },
});
const request = wire('transport-read-v2-wire');
const lifetime = { assertCurrent() {}, now: () => 1000 };
describe('fixed v2 transport corpus across the actual inbound verifier', () => {
  it('verifies signed empty and full pages, producing the two fixed Yjs text updates', async () => {
    expect(
      await verifyInboundPage(context(), request, wire('transport-page-v2-empty-wire'), lifetime),
    ).toEqual({ kind: 'empty', through: 0, position: 0 });
    const result = await verifyInboundPage(
      context(),
      request,
      wire('transport-page-v2-full-wire'),
      lifetime,
    );
    expect(result.kind).toBe('received');
    if (result.kind !== 'received') throw Error();
    expect(result.updates.map((u) => Buffer.from(u).toString('hex'))).toEqual(f.body.updates);
    const doc = new Y.Doc();
    try {
      for (const update of result.updates) Y.applyUpdate(doc, update);
      expect(doc.getText('text').toString()).toBe('AB');
    } finally {
      doc.destroy();
    }
  });
  it('a valid page signature cannot replace membership, local prefix, expected request or expiry', async () => {
    const page = wire('transport-page-v2-full-wire');
    const c = context();
    c.publisher.active = false;
    await expect(verifyInboundPage(c, request, page, lifetime)).rejects.toThrow();
    const stale = context();
    stale.prefix.observedThrough = 2;
    await expect(verifyInboundPage(stale, request, page, lifetime)).rejects.toThrow();
    await expect(
      verifyInboundPage(context(), request, page, { ...lifetime, now: () => 31000 }),
    ).rejects.toThrow();
    await expect(
      verifyInboundPage(context(), wire('transport-read-v1-wire'), page, lifetime),
    ).rejects.toThrow();
    const wrong = context();
    wrong.reader.publicKey = f.keys.member.publicKey;
    await expect(verifyInboundPage(wrong, request, page, lifetime)).rejects.toThrow();
  });
  it('omitting the page extent from production signature verification rescues a false through claim', async () => {
    const page = decodeInboundPage(wire('transport-page-v2-full-wire'));
    page.through = 2;
    const unsigned = JSON.parse(Buffer.from(inboundPageMessage(page)).toString()) as unknown[];
    unsigned.splice(3, 1);
    const key = createPrivateKey({
      key: Buffer.from('302e020100300506032b657004220420' + f.keys.acceptance.seed, 'hex'),
      type: 'pkcs8',
      format: 'der',
    });
    page.signature = sign(null, Buffer.from(JSON.stringify(unsigned)), key).toString('hex');
    const changed = encodeInboundPage(page);
    await expect(verifyInboundPage(context(), request, changed, lifetime)).rejects.toThrow();
    const original = crypto.subtle.verify.bind(crypto.subtle);
    const mock = vi
      .spyOn(crypto.subtle, 'verify')
      .mockImplementation(async (algorithm, key, signature, data) => {
        const input = new Uint8Array(
          data instanceof ArrayBuffer ? data : data.buffer,
          data instanceof ArrayBuffer ? 0 : data.byteOffset,
          data instanceof ArrayBuffer ? data.byteLength : data.byteLength,
        );
        if (input[0] === 91) {
          const values = JSON.parse(Buffer.from(input).toString()) as unknown[];
          if (values[0] === 'done/private-read-page/v2') {
            values.splice(3, 1);
            return original(
              algorithm,
              key,
              signature,
              new TextEncoder().encode(JSON.stringify(values)),
            );
          }
        }
        return original(algorithm, key, signature, data);
      });
    try {
      expect(await verifyInboundPage(context(), request, changed, lifetime)).toMatchObject({
        kind: 'received',
        through: 2,
      });
    } finally {
      mock.mockRestore();
    }
  });
});
