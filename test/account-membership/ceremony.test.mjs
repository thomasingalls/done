import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, message, signed, hash } from './fixtures.mjs';
import { key } from '../account-first-authority/oracle.mjs';
import { commitment, derive } from '../account-ceremony/oracle.mjs';
import {
  verifyMembershipAnchor,
  verifyMembershipAdmission,
  membershipState,
} from '../../account-protocol/membership.ts';
import {
  verifyMembershipCeremonyContext,
  verifyCeremonyContext,
  parseCeremonyCommit,
  verifyCeremonyPair,
  prepareCeremonyReveal,
  deriveCeremonyExchange,
} from '../../account-protocol/ceremonyExchange.ts';

for (const approving of ['existing', 'new'])
  test(`either certified parent device can compare a continuation code: ${approving}`, async () => {
    const f = fixture();
    const anchor = await verifyMembershipAnchor(f.f.base, f.f.successor, f.certification, f.anchor);
    const admission = f.admit(membershipState(anchor));
    const parent = await verifyMembershipAdmission(admission, anchor),
      p = membershipState(parent);
    const a = approving === 'existing' ? f.context.existing : f.context.candidate;
    const candidate = admission.epoch.preparation.context.candidate;
    const c = {
      v: 2,
      pin: p.pin,
      accountId: p.accountId,
      principalId: p.principalId,
      workspaceId: p.workspaceId,
      lineageId: p.lineageId,
      epoch: p.epoch,
      head: p.head,
      certifiedSetDigest: p.certifiedSetDigest,
      recoveryStateDigest: p.certificate.recoveryStateDigest,
      existing: a,
      candidate: { id: candidate.credentialId, wPub: candidate.wPub, sPub: candidate.sPub },
      attemptId: 'b1'.repeat(32),
      createdAt: 1000,
      expiresAt: 601000,
    };
    const keys = { existing: f.keys[approving], new: key('27'.repeat(32)) },
      nonces = { existing: 'b2'.repeat(32), new: 'b3'.repeat(32) };
    const sign = (label, body) => ({
      ...body,
      signature: signed(keys[body.role], message(label, body)),
    });
    const commits = Object.fromEntries(
      ['existing', 'new'].map((role) => [
        role,
        sign('done/enrollment-ceremony-commitment/v2', {
          v: 2,
          kind: 'ceremony-commitment',
          context: c,
          role,
          commitment: commitment(role, nonces[role]),
        }),
      ]),
    );
    const authorities = Object.fromEntries(
      ['existing', 'new'].map((role) => [
        role,
        verifyMembershipCeremonyContext(
          c,
          parent,
          { role, ...c[role === 'existing' ? 'existing' : 'candidate'] },
          1000,
        ),
      ]),
    );
    const pairs = Object.fromEntries(
      await Promise.all(
        ['existing', 'new'].map(async (role) => [
          role,
          await verifyCeremonyPair(authorities[role], commits.existing, commits.new, 1000),
        ]),
      ),
    );
    const reveals = Object.fromEntries(
      await Promise.all(
        ['existing', 'new'].map(async (role) => {
          const { signature: _, ...body } = await prepareCeremonyReveal(
            pairs[role],
            nonces[role],
            1000,
          );
          assert.equal(body.v, 2);
          assert.equal(body.contextHash, hash(message('done/enrollment-ceremony-context/v2', c)));
          return [role, sign('done/enrollment-ceremony-reveal/v2', body)];
        }),
      ),
    );
    const opening = await deriveCeremonyExchange(
      pairs.existing,
      reveals.existing,
      reveals.new,
      1000,
    );
    assert.deepEqual(
      opening,
      derive({
        workspaceId: c.workspaceId,
        epoch: c.epoch,
        head: c.head,
        existingCredentialId: c.existing.id,
        newCredentialId: c.candidate.id,
        wPub: c.candidate.wPub,
        sPub: c.candidate.sPub,
        recoveryStateDigest: c.recoveryStateDigest,
        nonceExisting: nonces.existing,
        nonceNew: nonces.new,
      }),
    );
    assert.throws(() => parseCeremonyCommit({ ...commits.existing, v: 1 }));
    assert.throws(
      () => verifyMembershipCeremonyContext(c, { ...parent }, { role: 'existing', ...a }, 1000),
      /Unverified/,
    );
    assert.throws(
      () =>
        verifyMembershipCeremonyContext(
          { ...c, head: 'ef'.repeat(32) },
          parent,
          { role: 'existing', ...a },
          1000,
        ),
      /authority/,
    );
    assert.throws(
      () =>
        verifyMembershipCeremonyContext(
          { ...c, existing: { ...a, sPub: candidate.sPub } },
          parent,
          { role: 'existing', ...a },
          1000,
        ),
      /authority/,
    );
    assert.throws(
      () => verifyMembershipCeremonyContext(c, parent, { role: 'existing', ...a }, 601000),
      /expired/,
    );
    await assert.rejects(
      verifyCeremonyContext(c, f.f.base, f.f.successor, f.held, { role: 'existing', ...a }, 1000),
    );
    await assert.rejects(
      deriveCeremonyExchange(pairs.existing, { ...reveals.existing, v: 1 }, reveals.new, 1000),
      /pair changed/,
    );
    await assert.rejects(
      prepareCeremonyReveal({ ...pairs.existing }, nonces.existing, 1000),
      /Unverified/,
    );
  });
