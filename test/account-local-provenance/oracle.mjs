// Independent reconstruction of retained Local claim authentication. No production codec imports.
import { hkdfSync, createHmac } from 'node:crypto';
import * as c from '../account-local-custody/oracle.mjs';
export { bytes, hex, lp, root, code, codeDisplay } from '../account-local-custody/oracle.mjs';
export const scope = {
  slotId: 'claim-slot',
  principalId: '61'.repeat(16),
  workspaceId: '72'.repeat(16),
};
export const infoFields = (r) => [
  'done/local-genesis-metadata/v1',
  r.slot_id,
  r.principal_id,
  r.workspace_id,
  r.root_id,
];
export const key = (r, fields = infoFields(r), root = c.root) =>
  new Uint8Array(hkdfSync('sha256', c.bytes(root), Buffer.alloc(0), c.lp(...fields), 32));
export const mac = (k, b) => createHmac('sha256', k).update(b).digest();
export function initial() {
  const r = c.recordFixture();
  Object.assign(r, {
    slot_id: scope.slotId,
    principal_id: scope.principalId,
    workspace_id: scope.workspaceId,
  });
  const s = r.seals[0];
  s.ct = c.hex(
    c.aes(
      c.factorKey(scope, c.hex(Buffer.from(c.code)), s),
      c.bytes(s.nonce),
      c.lp(...c.factorFields(scope, s)),
      c.bytes(c.root),
    ),
  );
  r.mac = c.hex(c.mac(c.metadataKey(r), c.json(c.metadataValues(r))));
  return r;
}
export const imported = () => ({
  policy: 'markdown-system-v1',
  recoveryDigest: '81'.repeat(32),
  sourceOrigin: 'https://legacy.example',
  sourceDigest: '82'.repeat(32),
  planDigest: '83'.repeat(32),
  createdAt: '2026-09-11T00:00:00.000Z',
  selectionMac: '84'.repeat(32),
});
export const cleanup = (v = 2) => ({
  v,
  intentId: '91'.repeat(16),
  databaseDigest: '92'.repeat(32),
  entries: [
    { key: 'done.actor', digest: '93'.repeat(32) },
    { key: 'done.pending-update.done.writer.0', digest: '94'.repeat(32) },
  ],
  next: 3,
});
export const selectionValues = (r) =>
  r.imported
    ? [
        'done/local-import-selection/v1',
        r.initial.mac,
        r.stage,
        [
          r.imported.policy,
          r.imported.recoveryDigest,
          r.imported.sourceOrigin,
          r.imported.sourceDigest,
          r.imported.planDigest,
          r.imported.createdAt,
          r.imported.selectionMac,
        ],
      ]
    : ['done/local-genesis-progress/v1', r.initial.mac, r.stage];
export const selectionBytes = (v) =>
  c.lp(...v.map((x) => (Array.isArray(x) ? JSON.stringify(x) : x)));
export const cleanupTuple = (r) => [
  r.v,
  r.intentId,
  r.databaseDigest,
  r.entries.map((e) => [e.key, e.digest]),
  r.next,
];
export const payloadValues = (r) =>
  r.sourceCleanup
    ? [
        `done/local-import-cleanup/v${r.sourceCleanup.v}`,
        c.hex(selectionBytes(selectionValues(r))),
        cleanupTuple(r.sourceCleanup),
      ]
    : selectionValues(r);
export const encode = (r, v = payloadValues(r)) =>
  r.sourceCleanup
    ? r.sourceCleanup.v === 1
      ? selectionBytes(v)
      : Buffer.from(JSON.stringify(v.map((x) => (Array.isArray(x) ? JSON.stringify(x) : x))))
    : selectionBytes(v);
export const sign = (r) => ({ ...r, mac: c.hex(mac(key(r.initial), encode(r))) });
export function fixtures() {
  const first = initial();
  const fresh = ['custody', 'content', 'ready'].map((stage) => ({
    name: 'fresh-' + stage,
    v: 1,
    initial: first,
    stage,
  }));
  const selected = { v: 1, initial: first, stage: 'ready', imported: imported() };
  return [
    ...fresh,
    { name: 'imported', ...selected },
    ...[1, 2].map((v) => ({ name: 'cleanup-v' + v, ...selected, sourceCleanup: cleanup(v) })),
    {
      name: 'cleanup-v2-empty',
      ...selected,
      sourceCleanup: { ...cleanup(), databaseDigest: null, entries: [], next: 1 },
    },
  ].map(({ name, ...r }) => ({ name, claim: sign(r) }));
}
export const leaves = (v, path = []) =>
  Array.isArray(v) && v.length
    ? v.flatMap((x, i) => leaves(x, [...path, i]))
    : [{ path, value: v }];
export const changed = (v) =>
  typeof v === 'number' ? v + 1 : v === null ? 'changed' : Array.isArray(v) ? ['changed'] : v + 'x';
export function edit(v, path, value, omit = false) {
  const copy = structuredClone(v);
  let x = copy;
  for (const k of path.slice(0, -1)) x = x[k];
  if (omit) x.splice(path.at(-1), 1);
  else x[path.at(-1)] = value;
  return copy;
}
export function corpus() {
  const r = initial(),
    fields = infoFields(r);
  return {
    v: 1,
    vectors: [
      {
        id: 'local-claim-key',
        kind: 'kdf',
        signer: null,
        input: { initial: r, root: c.root },
        expected: { messageHex: c.hex(c.lp(...fields)), resultHex: c.hex(key(r)) },
        negatives: fields.map((_, i) => {
          const v = [...fields];
          v[i] += 'x';
          return { field: i, messageHex: c.hex(c.lp(...v)), resultHex: c.hex(key(r, v)) };
        }),
      },
      ...fixtures().map(({ name, claim }) => {
        const values = payloadValues(claim),
          k = key(claim.initial),
          enc = (v) => encode(claim, v);
        return {
          id: 'local-claim-' + name,
          kind: 'mac',
          signer: null,
          input: claim,
          expected: { messageHex: c.hex(enc(values)), resultHex: claim.mac },
          negatives: leaves(values).map(({ path, value }) => ({
            path,
            value: changed(value),
            messageHex: c.hex(enc(edit(values, path, changed(value)))),
            resultHex: c.hex(mac(k, enc(edit(values, path, changed(value))))),
          })),
          encodedBindingControls: leaves(values).map(({ path, value }) => {
            const a = enc(edit(values, path, null, true)),
              b = enc(edit(edit(values, path, changed(value)), path, null, true));
            return {
              path,
              omittedHex: c.hex(a),
              changedOmittedHex: c.hex(b),
              resultHex: c.hex(mac(k, a)),
            };
          }),
        };
      }),
    ],
  };
}
