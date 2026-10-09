// Independent byte reconstruction. No production encoders, parsers or KDF imports.
import { createHmac, hkdfSync } from 'node:crypto';
export const hex = (b) => Buffer.from(b).toString('hex');
export const bytes = (s) => new Uint8Array(Buffer.from(s, 'hex'));
export const json = (v) => Buffer.from(JSON.stringify(v), 'utf8');
export const lp = (...parts) =>
  Buffer.concat(
    parts.map((p) => {
      const b = Buffer.from(p, 'utf8'),
        n = Buffer.alloc(2);
      n.writeUInt16BE(b.length);
      return Buffer.concat([n, b]);
    }),
  );
export const scope = {
  slotId: 'counter-slot-🙂',
  principalId: 'pr-counter',
  workspaceId: 'ws-counter',
  storeId: 'ab'.repeat(16),
  rootId: 'cd'.repeat(16),
};
export const kg = '31'.repeat(32),
  intent = 'ef'.repeat(16);
export const tuple = (s) => [s.slotId, s.principalId, s.workspaceId, s.storeId, s.rootId];
export const keyInfo = (s) =>
  lp('done/content-metadata/v1', s.slotId, s.principalId, s.workspaceId, s.storeId);
export const key = (s, input = kg) =>
  Buffer.from(hkdfSync('sha256', Buffer.from(input, 'hex'), Buffer.alloc(0), keyInfo(s), 32));
export const witnessValues = (s, w) => [
  'done/content-witness/v1',
  ...tuple(s),
  w.v,
  w.state,
  w.intent,
];
export const counterValues = (s, c) => [
  'done/content-counter/v' + c.v,
  ...tuple(s),
  c.v,
  c.store_id,
  c.intent,
  c.active_gen,
  c.next_seq,
  Object.keys(c.reserved)
    .sort((a, b) => Number(a) - Number(b))
    .map((g) => [g, c.reserved[g]]),
  ...(c.v === 2 ? [[c.spool.events, c.spool.hash]] : []),
];
export const mac = (k, b) => createHmac('sha256', k).update(b).digest();
export const initial = (v = 1) => ({
  v,
  store_id: scope.storeId,
  intent,
  active_gen: 1,
  next_seq: 1,
  reserved: { 1: 0 },
  ...(v === 2 ? { spool: { events: 0, hash: '00'.repeat(32) } } : {}),
  mac: '00'.repeat(32),
});
export function fixtures() {
  const multi = { ...initial(), active_gen: 12, next_seq: 18, reserved: { 12: 4, 2: 7, 10: 6 } };
  const high = {
    ...initial(2),
    active_gen: 4294967296,
    next_seq: 4294967296,
    reserved: { 1: 4294967294, 4294967296: 1 },
    spool: { events: 3, hash: '55'.repeat(32) },
  };
  return [
    {
      id: 'content-witness-creating',
      family: 'witness',
      value: { v: 1, state: 'creating', intent, mac: '00'.repeat(32) },
    },
    {
      id: 'content-witness-ready',
      family: 'witness',
      value: { v: 1, state: 'ready', intent, mac: '00'.repeat(32) },
    },
    { id: 'content-counter-v1-empty', family: 'counter', value: initial() },
    { id: 'content-counter-v1-multigen', family: 'counter', value: multi },
    { id: 'content-counter-v2-empty', family: 'counter', value: initial(2) },
    {
      id: 'content-counter-v2-ledger',
      family: 'counter',
      value: {
        ...initial(2),
        next_seq: 8,
        reserved: { 1: 7 },
        spool: { events: 4, hash: 'a1'.repeat(32) },
      },
    },
    { id: 'content-counter-v2-high-gen', family: 'counter', value: high },
  ];
}
export const values = (f, s = scope, v = f.value) =>
  f.family === 'counter' ? counterValues(s, v) : witnessValues(s, v);
export function leaves(v, p = []) {
  if (v && typeof v === 'object')
    return Object.entries(v).flatMap(([k, x]) => leaves(x, [...p, k]));
  return [p];
}
export function change(v, path) {
  const copy = structuredClone(v);
  let o = copy;
  for (const k of path.slice(0, -1)) o = o[k];
  const k = path.at(-1);
  o[k] = typeof o[k] === 'number' ? o[k] + 1 : o[k] + 'x';
  return copy;
}
export function corpus() {
  const vectors = fixtures().map((f) => {
    const a = values(f),
      message = json(a),
      k = key(scope);
    const negatives = leaves({ scope, value: { ...f.value, mac: undefined } })
      .filter((p) => p.at(-1) !== 'mac')
      .map((path) => ({ path, input: change({ scope, value: f.value }, path) }));
    return {
      ...f,
      kind: 'mac',
      signer: null,
      input: { scope, kg, value: f.value },
      expected: { messageHex: hex(message), resultHex: hex(mac(k, message)) },
      negatives,
      encodedBindingControls: leaves(a).map((path) => {
        const b = change(a, path),
          omitted = structuredClone(a),
          other = structuredClone(b);
        for (const v of [omitted, other]) {
          let o = v;
          for (const x of path.slice(0, -1)) o = o[x];
          o.splice(Number(path.at(-1)), 1);
        }
        return {
          path,
          changedHex: hex(json(b)),
          omittedHex: hex(json(omitted)),
          changedOmittedHex: hex(json(other)),
        };
      }),
    };
  });
  vectors.unshift({
    id: 'content-metadata-key',
    kind: 'kdf',
    signer: null,
    input: { scope, kg, saltHex: '' },
    expected: { messageHex: hex(keyInfo(scope)), resultHex: hex(key(scope)) },
    negatives: [
      ...['slotId', 'principalId', 'workspaceId', 'storeId'].map((field) => ({
        field,
        scope: { ...scope, [field]: scope[field] + 'x' },
        resultHex: hex(key({ ...scope, [field]: scope[field] + 'x' })),
      })),
      { field: 'kg', scope, kg: '32'.repeat(32), resultHex: hex(key(scope, '32'.repeat(32))) },
    ],
  });
  return { v: 1, generatedBy: 'scripts/account-counter-contract/vectors.mjs', vectors };
}
