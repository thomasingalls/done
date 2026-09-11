import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as E from '../../account-protocol/envelope.ts';
import * as S from '../../account-protocol/submission.ts';
import * as P from '../../account-protocol/positionDecision.ts';
import * as D from '../../account-protocol/deliveryTransport.ts';
import * as I from '../../account-protocol/inboundTransport.ts';
import { witnessMessage } from '../../account-service/deliveryWitness.ts';
import { b, hex } from './oracle.mjs';
export { E, S, P, D, I };
export const u = (h) => new Uint8Array(b(h));
export const envelope = (e) => ({
  ...e,
  nonce: u(e.nonce),
  digest: u(e.digest),
  ct: u(e.ct),
  sig: u(e.sig),
});
export const body = (f) => ({ ...f.body, updates: f.body.updates.map(u) });
export const submission = (s) => ({ ...s, envelope: u(s.envelope), signature: u(s.signature) });
export const page = (p) => ({
  ...p,
  entries: p.entries.map((e) => ({ envelope: u(e.envelope), proof: u(e.proof) })),
});
export const edPrivate = (seed) =>
  crypto.subtle.importKey('pkcs8', u('302e020100300506032b657004220420' + seed), 'Ed25519', false, [
    'sign',
  ]);
export const edPublic = (pub) =>
  crypto.subtle.importKey('raw', u(pub), 'Ed25519', false, ['verify']);
// Make two internal pure seams callable in a disposable copy. No function body or production export changes.
const url = new URL('../../account-service/delivery.ts', import.meta.url);
let source = readFileSync(url, 'utf8');
for (const name of ['extend', 'verifyLedgerWitness']) {
  const anchor = name === 'extend' ? 'function extend(' : 'async function verifyLedgerWitness(';
  if (source.split(anchor).length !== 2) throw Error('Internal seam moved: ' + name);
  source = source.replace(anchor, 'export ' + anchor);
}
source = source.replace(
  /from '(\.{1,2}\/[^']+)'/g,
  (_, p) => 'from ' + JSON.stringify(new URL(p, url).href),
);
export const ledger = await import(
  'data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(source)).toString('base64')
);
export async function actual(v, f) {
  const id = v.id;
  if (id === 'transport-envelope-body') return E.encodeEnvelopeBody(body(f));
  const m = /^transport-envelope-v([12])-(.*)$/.exec(id);
  if (m) {
    const e = envelope(f.envelopes[Number(m[1]) - 1]);
    if (m[2] === 'kdf') {
      const key = await crypto.subtle.importKey('raw', u(f.kg), 'HKDF', false, ['deriveBits']);
      return new Uint8Array(
        await crypto.subtle.deriveBits(
          { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(), info: E.envelopeKeyInfo(e) },
          key,
          256,
        ),
      );
    }
    if (m[2] === 'aad') {
      return E.envelopeAAD(e);
    }
    if (m[2] === 'signature') return E.envelopeSignatureMessage(e, e.nonce, e.digest);
    return E.encodeNetworkEnvelope(e);
  }
  if (id === 'transport-refusal') return P.refusalMessage(f.refusal);
  if (id === 'transport-refusal-id') return u(await P.refusalId(f.refusal));
  if (id === 'transport-accepted-link')
    return u(await P.acceptanceLink(f.subject, '00'.repeat(32)));
  if (id === 'transport-accepted-head') return P.headMessage(f.head);
  if (id.startsWith('transport-response-'))
    return P.encodePositionResponse(f.responses[id.endsWith('refused') ? 0 : 1]);
  if (id.startsWith('transport-submission-')) {
    const s = submission(f.submissions[id.includes('successor') ? 1 : 0]);
    return id.endsWith('-wire')
      ? S.encodeSubmission(s)
      : await S.signSubmission(s, await edPrivate(f.keys.member.seed));
  }
  if (id === 'transport-submit-carrier')
    return D.encodeSubmit(f.base.workspace, S.encodeSubmission(submission(f.submissions[0])));
  const r = /^transport-read-v([12])(-wire|-hash)?$/.exec(id);
  if (r) {
    const n = Number(r[1]),
      request = f.requests[n - 1],
      module = n === 1 ? D : I,
      wire = n === 1 ? D.encodeReadRequest(request) : I.encodeInboundRequest(request);
    return r[2] === '-hash'
      ? u(await D.requestHash(wire))
      : r[2] === '-wire'
        ? wire
        : n === 1
          ? module.readRequestMessage(request)
          : module.inboundRequestMessage(request);
  }
  const p = /^transport-page-v([12])-(full|empty)(-wire)?$/.exec(id);
  if (p) {
    const n = Number(p[1]),
      value = page(f.pages[n - 1][p[2] === 'full' ? 1 : 0]);
    return p[3]
      ? n === 1
        ? D.encodeReadPage(value)
        : I.encodeInboundPage(value)
      : n === 1
        ? D.readPageMessage(value)
        : I.inboundPageMessage(value);
  }
  if (id.startsWith('transport-service-chain-')) {
    const e = f.events[Number(id.at(-1)) - 1];
    return u(ledger.extend(e.previous, e.ordinal, u(e.submission), u(e.response)));
  }
  if (id === 'transport-service-witness') return witnessMessage(f.scope, f.witness);
  throw Error(id);
}
export async function assertActual(v, f, assert) {
  const a = await actual(v, f);
  if (v.id.startsWith('transport-submission-') && !v.id.endsWith('-wire'))
    assert.equal(
      hex(a),
      hex(S.encodeSubmission(submission(f.submissions[v.id.endsWith('successor') ? 1 : 0]))),
      v.id,
    );
  else
    assert.equal(
      hex(a),
      v.kind === 'kdf' || v.kind === 'digest' ? v.expected.resultHex : v.expected.messageHex,
      v.id,
    );
}
