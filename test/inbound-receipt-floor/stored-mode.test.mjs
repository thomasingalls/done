/** Saved-original core controls; complete binary/four-reader qualification follows integration. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'vite';
import { resolve } from 'node:path';
const control = process.env.STORED_MODE_CONTROL;
if (control && control !== 'live-only') throw Error('Unknown stored-mode control');
let seams = 0,
  omissions = 0;
const built = await build({
  configFile: false,
  logLevel: 'error',
  plugins: [
    {
      name: 'private-saved-originals-core',
      enforce: 'pre',
      transform(code, id) {
        if (!id.endsWith('/src/crdt/accountInbound.ts')) return;
        assert.equal(code.split('async function verify(').length, 2);
        seams++;
        if (control) {
          const anchor = "const storedMode = mode.kind !== 'live';";
          assert.equal(code.split(anchor).length, 2);
          code = code.replace(anchor, 'const storedMode = false;');
          omissions++;
        }
        return code + '\nexport { verify as savedOriginalsFixture };\n';
      },
    },
  ],
  build: {
    write: false,
    minify: false,
    target: 'esnext',
    lib: { entry: resolve('test/inbound-receipt-floor/stored-browser.ts'), formats: ['es'] },
    rollupOptions: { external: (id) => id.startsWith('node:') },
  },
});
assert.equal(seams, 1);
assert.equal(omissions, control ? 1 : 0);
const chunks = (Array.isArray(built) ? built[0] : built).output.filter((x) => x.type === 'chunk');
assert.equal(chunks.length, 1);
const h = await import(
  'data:text/javascript;base64,' + Buffer.from(chunks[0].code).toString('base64')
);
const expired = { ...h.live, now: () => 90000 };
const reason = (wanted) => (error) => error?.reason === wanted;
function fixture() {
  const entry = h.sources().entries[0];
  return { entry, packet: h.packet(entry), context: h.context(entry.publisher) };
}
test('aged saved originals verify without inventing a legacy comparison record', async () => {
  const x = fixture();
  const expected = await h.verifyInboundPage(x.context, x.packet.request, x.packet.page, h.live);
  const result = await h.savedOriginalsFixture(
    x.context,
    x.packet.request,
    x.packet.page,
    expired,
    { kind: 'stored' },
  );
  assert.equal(result.kind, 'received');
  assert.deepEqual(result, expected);
  assert.deepEqual(result.updates, x.entry.updates);
});
test('live expired requests stay refused and no network/lifetime field can select stored mode', async () => {
  const x = fixture();
  for (const lifetime of [expired, { ...expired, stored: true, mode: { kind: 'stored' } }])
    await assert.rejects(
      h.verifyInboundPage(x.context, x.packet.request, x.packet.page, lifetime),
      reason('expired'),
    );
  const page = JSON.parse(Buffer.from(x.packet.page).toString());
  page.push({ kind: 'stored' });
  await assert.rejects(h.verifyInboundPage(x.context, x.packet.request, h.json(page), h.live));
});
test('stored empty pages refuse even without an expected legacy record', async () => {
  const x = fixture();
  const empty = h.reframe(x.packet, {
    page: (p) => {
      p[3] = 0;
      p[4] = 0;
      p[5] = [];
    },
  });
  assert.deepEqual(await h.verifyInboundPage(x.context, empty.request, empty.page, h.live), {
    kind: 'empty',
    through: 0,
    position: 0,
  });
  await assert.rejects(
    h.savedOriginalsFixture(x.context, empty.request, empty.page, expired, { kind: 'stored' }),
    reason('record'),
  );
});
test('stored duplicates refuse even without an expected legacy record', async () => {
  const x = fixture(),
    prior = h.prior(x.context, x.entry);
  assert.equal(
    (await h.verifyInboundPage(prior, x.packet.request, x.packet.page, h.live)).kind,
    'duplicate',
  );
  await assert.rejects(
    h.savedOriginalsFixture(prior, x.packet.request, x.packet.page, expired, { kind: 'stored' }),
    reason('record'),
  );
});
test('stored mode retains signatures, current ownership and independently supplied prefix checks', async () => {
  const x = fixture(),
    broken = JSON.parse(Buffer.from(x.packet.page).toString());
  broken[6] = '00'.repeat(64);
  await assert.rejects(
    h.savedOriginalsFixture(x.context, x.packet.request, h.json(broken), expired, {
      kind: 'stored',
    }),
    reason('unverified'),
  );
  await assert.rejects(
    h.savedOriginalsFixture(
      { ...x.context, prefix: { position: 0, link: 'ff'.repeat(32), observedThrough: 0 } },
      x.packet.request,
      x.packet.page,
      expired,
      { kind: 'stored' },
    ),
    reason('prefix'),
  );
  await assert.rejects(
    h.savedOriginalsFixture(
      x.context,
      x.packet.request,
      x.packet.page,
      {
        ...expired,
        assertCurrent() {
          throw Error('declared closed owner');
        },
      },
      { kind: 'stored' },
    ),
    /declared closed owner/,
  );
});
test('public legacy stored replay still compares the exact record bytes after expiry', async () => {
  const x = fixture(),
    record = h.eventWire(x.entry, x.context, x.packet);
  const result = await h.verifyStoredInbound(x.context, record, expired);
  assert.equal(result.kind, 'received');
  assert.deepEqual(result.record, record);
  const changed = JSON.parse(Buffer.from(record).toString());
  changed[2] = 'ff'.repeat(32);
  await assert.rejects(
    h.verifyStoredInbound(x.context, h.json(changed), expired),
    reason('record'),
  );
});
