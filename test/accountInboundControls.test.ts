import { createHash } from 'node:crypto';
// @vitest-environment node
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { build } from 'vite';
import * as actual from '../src/crdt/accountInbound';
import { decodeInboundRecord } from '../src/crdt/inboundRecord';
import { A, B, entry, packet, sources, ZERO } from './account-inbound/fixtures';
import { context, eventWire, hex, json, live } from './account-inbound-codecs/oracle';
const changes: Record<string, [string, string][]> = {
  'page-signature': [["if (!pageVerified) fail('unverified');", 'void pageVerified;']],
  'request-binding': [
    [
      "if (p.request !== hex(new Uint8Array(await subtle.digest('SHA-256', request)))) fail('request');",
      'void request;',
    ],
  ],
  'prefix-proof': [
    [
      'const proof = await verifyPositionResponse(entry.proof, subject(entry.envelope), a, subtle);',
      'const proof = decodePositionResponse(entry.proof);',
    ],
  ],
  actor: [["if (!actorAllowed) fail('actor');", 'void actorAllowed;']],
  'record-binding': [
    [
      "if (expectedRecord && hex(record) !== hex(expectedRecord)) fail('record');",
      'void expectedRecord;',
    ],
  ],
  'batch-count': [["if (!fits) fail('size');", 'void fits;']],
  'buffer-copy': [['return bytes.slice();', 'return bytes;']],
  'late-close': [
    ["current();\n    if (kind === 'conflict')", "void 0;\n    if (kind === 'conflict')"],
  ],
};
const digest = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
async function refusal(op: Promise<unknown>) {
  let reason: string | undefined;
  try {
    await op;
  } catch (e) {
    reason = String(e);
  }
  expect(reason).toBeDefined();
  return reason!;
}
async function mutant(mode: string) {
  let hits = 0,
    before = '',
    after = '';
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    plugins: [
      {
        name: 'inbound-real-control',
        enforce: 'pre',
        transform(code, id) {
          if (!id.endsWith('/src/crdt/accountInbound.ts')) return;
          before = digest(code);
          for (const [from, to] of changes[mode]!) {
            expect(code.split(from)).toHaveLength(2);
            code = code.replace(from, to);
            hits++;
          }
          if (mode === 'prefix-proof')
            code =
              "import { decodePositionResponse } from '../../account-protocol/positionDecision';\n" +
              code;
          after = digest(code);
          return code;
        },
      },
    ],
    build: {
      write: false,
      minify: false,
      target: 'esnext',
      lib: { entry: resolve('src/crdt/accountInbound.ts'), formats: ['es'] },
    },
  });
  expect(hits).toBe(changes[mode]!.length);
  const output = Array.isArray(result) ? result[0]! : result;
  if (!('output' in output)) throw Error('Unexpected build watcher');
  const chunk = output.output.find((o) => o.type === 'chunk');
  if (!chunk || chunk.type !== 'chunk') throw Error('Missing bundle');
  const module = (await import(
    /* @vite-ignore */ 'data:text/javascript;base64,' + Buffer.from(chunk.code).toString('base64')
  )) as typeof actual;
  return { module, mutation: { before, after, hits, bundle: digest(chunk.code) } };
}
afterEach(() => vi.restoreAllMocks());
for (const mode of Object.keys(changes))
  it(`actual ${mode} removal produces the prohibited outcome`, async () => {
    const { module: changed, mutation } = await mutant(mode),
      f = sources();
    let e = f.entries[0]!,
      q = packet(e);
    const c = context();
    if (mode === 'page-signature') {
      const v = JSON.parse(Buffer.from(q.page).toString());
      v[6] = '00'.repeat(64);
      q.page = json(v);
    }
    if (mode === 'request-binding') q = { request: q.request, page: packet(e, 1, 2).page };
    if (mode === 'prefix-proof') {
      c.prefix = { position: 1, link: e.link, observedThrough: 1 };
      e = entry(f.entries[1]!, 2, 'ab'.repeat(32));
      q = packet(e);
    }
    if (mode === 'actor') {
      e = entry(e, 1, ZERO, { actor: B });
      q = packet(e);
    }
    if (mode === 'batch-count') {
      e = entry(
        { publisher: A, updates: Array.from({ length: 256 }, () => new Uint8Array([0, 0])) },
        1,
      );
      q = packet(e);
    }
    let outcome: string;
    let observation: unknown;
    if (mode === 'record-binding') {
      const v = JSON.parse(Buffer.from(eventWire(e)).toString());
      v[2] = 'ab'.repeat(32);
      const bytes = json(v);
      const normalError = await refusal(actual.verifyStoredInbound(c, bytes, live));
      expect(normalError).toContain('record');
      const bad = await changed.verifyStoredInbound(c, bytes, live);
      expect(bad.kind).toBe('received');
      observation = {
        normalError,
        mutantKind: bad.kind,
        storedBaseline: v[2],
        heldBaseline: c.baseline.id,
      };
      outcome = 'Wrong baseline metadata accepted on stored replay.';
    } else if (mode === 'buffer-copy') {
      const run = async (module: typeof actual) => {
        const wire = structuredClone(q),
          original = wire.request.slice(),
          pending = module.verifyInboundPage(c, wire.request, wire.page, live);
        wire.request[wire.request.length - 4] =
          wire.request[wire.request.length - 4] === 48 ? 49 : 48;
        const result = await pending;
        if (result.kind !== 'received') throw Error();
        return { record: result.record, original };
      };
      const correct = await run(actual),
        bad = await run(changed);
      expect(decodeInboundRecord(correct.record).request).toEqual(correct.original);
      expect(decodeInboundRecord(bad.record).request).not.toEqual(bad.original);
      const coldError = await refusal(actual.verifyStoredInbound(c, bad.record, live));
      observation = {
        normalRequest: hex(correct.original),
        normalRetained: hex(decodeInboundRecord(correct.record).request),
        mutantRequest: hex(bad.original),
        mutantRetained: hex(decodeInboundRecord(bad.record).request),
        coldError,
      };
      outcome = 'Retained caller-mutated request differs from verified bytes.';
    } else if (mode === 'late-close') {
      let closed = false;
      const decrypt = crypto.subtle.decrypt.bind(crypto.subtle);
      vi.spyOn(crypto.subtle, 'decrypt').mockImplementation(async (...args) => {
        const result = await decrypt(...args);
        closed = true;
        return result;
      });
      const lifetime = {
        assertCurrent() {
          if (closed) throw Error('closed');
        },
        now: () => 1000,
      };
      const normalError = await refusal(actual.verifyInboundPage(c, q.request, q.page, lifetime));
      expect(normalError).toContain('closed');
      closed = false;
      const bad = await changed.verifyInboundPage(c, q.request, q.page, lifetime);
      expect(bad.kind).toBe('received');
      expect(closed).toBe(true);
      observation = { normalError, mutantKind: bad.kind, closed };
      outcome = 'Received result returned after the last decrypt completed into a closed lifetime.';
    } else {
      const normalError = await refusal(actual.verifyInboundPage(c, q.request, q.page, live));
      const result = await changed.verifyInboundPage(c, q.request, q.page, live);
      expect(result.kind).toBe('received');
      if (result.kind !== 'received') throw Error();
      observation = {
        normalError,
        mutantKind: result.kind,
        actor: result.actor,
        updates: result.updates.length,
        prefix: c.prefix,
        record: digest(result.record),
      };
      outcome =
        mode === 'batch-count'
          ? '256 updates admitted, requiring 257 local records.'
          : mode === 'prefix-proof'
            ? 'Unheld accepted prefix accepted.'
            : mode === 'actor'
              ? 'A different actor accepted.'
              : mode === 'request-binding'
                ? 'Page for a different request accepted.'
                : 'Unsigned page extent accepted.';
    }
    if (process.env['ACCOUNT_REPORT_DIR'])
      writeFileSync(
        join(process.env['ACCOUNT_REPORT_DIR'], 'control-' + mode + '.json'),
        JSON.stringify(
          {
            mode,
            changes: changes[mode],
            mutation,
            observation,
            request: hex(q.request),
            page: hex(q.page),
            outcome,
          },
          null,
          2,
        ) + '\n',
      );
    // Keep hex framing independently observable without depending on a mutant encoder.
    expect(hex(q.request).length).toBeGreaterThan(0);
  }, 30000);
