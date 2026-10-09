import assert from 'node:assert/strict';
import { parseSync } from '@babel/core';
export const targets = {
  '/src/crdt/inboundLedger.ts': {
    verifyInboundLedger: ['inbound.ledger', 'census.entries.length'],
    contentCoverage: ['inbound.reconstruct', 'content.length'],
    verifyInboundCoverage: [
      'inbound.coverage',
      "records.filter(r => r.kind === 'update' || r.kind === 'state').length",
    ],
  },
  '/src/crdt/deliveryRecord.ts': { verifyDelivery: ['delivery.verify', 'c.ledger.length'] },
  '/src/crdt/spoolRecord.ts': {
    verifySpool: ['spool.verify', 'state.positions.length'],
    verifySpoolWitness: ['spool.witness', 'state.events.length'],
  },
  '/src/crdt/contentStore.ts': {
    load: ['content.load', '0'],
    openSnapshot: ['content.open', 'snapshot.rows.length'],
  },
  '/src/crdt/accountSyncDriver.ts': { wake: ['sync.wake', "cause === 'local' ? 1 : 0"] },
  '/src/crdt/accountReceive.ts': { state: ['receive.state', '0'] },
  '/account-service/delivery.ts': {
    census: ['service.census', 's.rows.length'],
    authority: ['service.authority', 's.rows.length'],
    snapshotBytes: ['service.snapshot', 's?.rows.length ?? 0'],
  },
};
export function instrument(code, id, hits = {}) {
  const path = Object.keys(targets).find((p) => id.endsWith(p));
  if (!path) return code;
  const wanted = targets[path],
    found = new Set(),
    edits = [];
  const source = parseSync(code, {
    filename: id,
    configFile: false,
    babelrc: false,
    parserOpts: { sourceType: 'module', plugins: ['typescript'] },
  });
  function visit(n) {
    const name =
      (n.type === 'FunctionDeclaration' || n.type === 'VariableDeclarator') && n.id?.name;
    if (name && wanted[name]) {
      const fn = n.type === 'FunctionDeclaration' ? n : n.init;
      if (!fn || !['FunctionDeclaration', 'ArrowFunctionExpression'].includes(fn.type))
        throw Error('Unsupported function anchor');
      assert(!found.has(name), 'Non-unique anchor ' + name);
      found.add(name);
      const body = fn.body,
        [label, size] = wanted[name];
      const start = `const __livenessEnd = (globalThis as any).livenessProbe?.start(${JSON.stringify(label)}, ${size}); try {`;
      const end = '} finally { __livenessEnd?.(); }';
      if (body.type === 'BlockStatement') {
        edits.push([body.start + 1, body.start + 1, start], [body.end - 1, body.end - 1, end]);
      } else {
        assert(fn.async, 'Expression instrumentation expects async');
        edits.push([
          body.start,
          body.end,
          `{ ${start} return await (${code.slice(body.start, body.end)}); ${end} }`,
        ]);
      }
      hits[label] = (hits[label] ?? 0) + 1;
    }
    for (const v of Object.values(n)) {
      if (Array.isArray(v)) {
        for (const c of v) if (c?.type) visit(c);
      } else if (v?.type) visit(v);
    }
  }
  visit(source);
  assert.deepEqual(
    [...found].sort(),
    Object.keys(wanted).sort(),
    'Missing instrumentation anchor ' + path,
  );
  for (const [from, to, value] of edits.sort((a, b) => b[0] - a[0]))
    code = code.slice(0, from) + value + code.slice(to);
  return code;
}
export function clockSeam(code, id) {
  if (!id.endsWith('/src/crdt/accountReceive.ts')) return code;
  const anchor = 'if (r.expires <= Date.now())';
  assert.equal(code.split(anchor).length, 2);
  return code.replace(
    anchor,
    `if ((() => {
    const expired = r.expires <= Date.now() + ((globalThis as any).livenessCommitClockShift ?? 0);
    if (expired) (globalThis as any).livenessCommitExpiryObserved = true;
    return expired;
  })())`,
  );
}

/** Test-only differential oracle, enabled solely by the native verification control. */
export function verificationOracle(code, id) {
  if (!id.endsWith('/src/crdt/accountReceive.ts')) return code;
  const anchor = 'if (composed) verifySyncState(census.delivery, delivery, inbound);';
  assert.equal(code.split(anchor).length, 2);
  return code.replace(
    anchor,
    anchor +
      `
    if ((globalThis as any).livenessVerificationOracle) {
      await verifySpoolWitness(census.delivery.spool, counter, subtle);
      await verifySpool(census.delivery.spool, route, base.generationKey, publicKey, subtle);
      const fullDelivery = await verifyDelivery(census.delivery, route, base.authority, publicKey, subtle);
      const fullInbound = await verifyInboundLedger(census, records, base, lifetime(task));
      const render = (value: unknown) => JSON.stringify(value, (_k, v) => v instanceof Map ? [...v] : v);
      if (render([delivery, inbound]) !== render([fullDelivery, fullInbound])) throw Error('Incremental verification differs from full oracle');
      (globalThis as any).livenessOracleChecks = ((globalThis as any).livenessOracleChecks ?? 0) + 1;
    }
  `,
  );
}
