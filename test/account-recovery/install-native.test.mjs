import { createHash, sign } from 'node:crypto';
import { lp } from '../account-enrollment/fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { build } from 'vite';
import { client, sourceFixture } from './source-fixtures.mjs';
const compiled = await build({
  configFile: false,
  logLevel: 'error',
  build: {
    write: false,
    minify: false,
    lib: {
      entry: resolve('test/account-recovery/install-entry.ts'),
      name: 'RecoveryInstall',
      formats: ['iife'],
    },
  },
});
const script = (Array.isArray(compiled) ? compiled[0] : compiled).output.find(
  (o) => o.type === 'chunk',
).code;
test(
  'recovery native installation resumes after partial activation, then edits and cold-opens with the new key only',
  { timeout: 60000 },
  async (t) => {
    const x = await sourceFixture(t),
      prepared = await client.prepareRecoveryCommit(x.input);
    t.after(() => prepared.key.fill(0));
    const committed = await x.authority.owner.commitRecovery(x.f.core, prepared.request);
    assert.equal(committed.stage, 'committed', JSON.stringify(committed));
    const p = x.reader.verified.prepared;
    const authority = {
      base: p.base,
      successor: null,
      certification: null,
      continuations: [committed.successor],
    };
    const reading = {
      v: 1,
      kind: 'recovery-reading',
      epoch: committed.successor.epoch.epoch,
      head: committed.successor.head,
      checkpoint: prepared.request.checkpoint,
      successor: committed.successor,
      binding: p.binding,
    };
    const dir = mkdtempSync(join(tmpdir(), 'done-recovery-install-'));
    const server = createServer((_q, r) =>
      r
        .writeHead(200, { 'Content-Type': 'text/html' })
        .end('<!doctype html><title>Disposable recovery installation</title>'),
    );
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(4999, '127.0.0.1', resolve);
    });
    let browser;
    t.after(async () => {
      await browser?.close();
      await new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      });
      rmSync(dir, { recursive: true, force: true });
    });
    const launch = () =>
      chromium.launchPersistentContext(dir, {
        headless: true,
        ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
      });
    const pageFor = async () => {
      const page = await browser.newPage();
      await page.goto(x.authority.pin.origin);
      await page.addScriptTag({ content: script });
      await page.exposeFunction('fixturePasskey', (challenge) => {
        const response = x.account.key.assert({
          options: { challenge: Buffer.from(challenge).toString('base64url') },
        });
        return {
          credentialId: response.id,
          ...Object.fromEntries(
            ['authenticatorData', 'clientDataJSON', 'signature'].map((k) => [
              k,
              [...Buffer.from(response.response[k], 'base64url')],
            ]),
          ),
        };
      });
      return page;
    };
    browser = await launch();
    let page = await pageFor();
    const key = (k) => k.export({ format: 'der', type: 'pkcs8' }).toString('hex');
    const local = await page.evaluate((keys) => RecoveryInstall.seed(keys), {
      id: x.reader.input.candidate.credentialId,
      wPub: x.reader.input.candidate.wPub,
      sPub: x.reader.input.candidate.sPub,
      wrapping: key(x.reader.nodeWrapping),
      signing: key(x.reader.nodeSigner),
    });
    // The native install verifier must reject a substituted ciphertext before writing its marker.
    const bad = structuredClone(reading);
    bad.checkpoint.ct = '00'.repeat(bad.checkpoint.ct.length / 2);
    await assert.rejects(
      page.evaluate(
        ({ local, authority, reading }) =>
          RecoveryInstall.install(local.slotId, local.code, authority, reading),
        { local, authority, reading: bad },
      ),
    );
    assert.equal(
      (await page.evaluate((l) => RecoveryInstall.state(l.slotId, l.code), local)).v,
      undefined,
    );
    await page.evaluate(
      ({ local, authority, reading }) =>
        RecoveryInstall.install(local.slotId, local.code, authority, reading),
      { local, authority, reading },
    );
    assert.equal(
      await page.evaluate((l) => RecoveryInstall.oldOwnerRefuses(l.slotId, l.code), local),
      true,
    );
    // Interrupt after content initialization, before slot index selection, using the existing native seam.
    assert.deepEqual(
      await page.evaluate(
        ({ local, pin }) => RecoveryInstall.activate(local.slotId, local.code, pin, true),
        { local, pin: x.authority.pin },
      ),
      { interrupted: true },
    );
    assert.equal(
      (await page.evaluate((l) => RecoveryInstall.state(l.slotId, l.code), local)).phase,
      'installing',
    );
    await browser.close();
    browser = await launch();
    page = await pageFor();
    const active = await page.evaluate(
      ({ local, pin }) => RecoveryInstall.activate(local.slotId, local.code, pin),
      { local, pin: x.authority.pin },
    );
    assert.equal(active.phase, 'active');
    assert.equal(active.v, 3);
    assert.equal(active.epoch, 2);
    const args = { local, pin: x.authority.pin, principal: p.base.request.candidate.principalId };
    const opened = await page.evaluate(
      ({ local, pin, principal }) =>
        RecoveryInstall.openEditor(local.slotId, local.code, pin, principal),
      args,
    );
    assert.equal(opened, 'before loss\n');
    assert.equal(
      await page.evaluate(() => RecoveryInstall.edit('after recovery\n')),
      'before loss\nafter recovery\n',
    );
    await page.evaluate(() => RecoveryInstall.closeEditor());
    await browser.close();
    browser = await launch();
    page = await pageFor();
    assert.equal(
      await page.evaluate(
        ({ local, pin, principal }) =>
          RecoveryInstall.openEditor(local.slotId, local.code, pin, principal),
        args,
      ),
      'before loss\nafter recovery\n',
    );
    const entry = x.candidate();
    entry.input.candidate.head = committed.successor.head;
    const begun = await x.enroll('begin', entry.input),
      c = begun.challenge.context;
    const preparedNext = await x.enroll('finish', {
      retryKey: entry.input.retryKey,
      attemptId: c.attemptId,
      response: x.account.key.assert({
        options: {
          challenge: createHash('sha256')
            .update(lp('done/enrollment-preparation-assertion/v2', JSON.stringify(c)))
            .digest('base64url'),
        },
      }),
      possession: sign(
        null,
        lp('done/enrollment-preparation-possession/v2', JSON.stringify(c)),
        entry.key,
      ).toString('hex'),
    });
    assert.equal(preparedNext.stage, 'prepared', JSON.stringify(preparedNext));
    const next = await x.authority.owner.admitMembership(x.f.core, {
      retryKey: entry.input.retryKey,
      attemptId: c.attemptId,
      receiptId: preparedNext.receipt.receiptId,
    });
    assert.equal(next.kind, 'membership-admission', JSON.stringify(next));
    const proofs = {
      successor: null,
      certification: null,
      continuations: [committed.successor, next],
    };
    const adopted = await page.evaluate((proofs) => RecoveryInstall.adopt(proofs), proofs);
    assert.equal(adopted.epoch, 3);
    await page.evaluate(() => RecoveryInstall.closeEditor());
    const replacement = await page.evaluate(
      ({ local, authority, candidate }) =>
        RecoveryInstall.prepareReplacement(local.slotId, local.code, authority, candidate),
      { local, authority: { base: p.base, ...proofs }, candidate: c.candidate.credentialId },
    );
    const history = await client.verifyMembershipChain(proofs, p.base);
    const doc = await client.openReplacementCheckpoint(
      replacement,
      prepared.key,
      client.historyMembership(history.history),
    );
    assert.equal(doc.getText('master').toString(), 'before loss\nafter recovery\n');
    doc.destroy();
    await browser.close();
    browser = await launch();
    page = await pageFor();
    assert.equal(
      await page.evaluate(
        ({ local, pin, principal }) =>
          RecoveryInstall.openEditor(local.slotId, local.code, pin, principal),
        args,
      ),
      'before loss\nafter recovery\n',
    );
    await page.evaluate(() => RecoveryInstall.closeEditor());
  },
);
