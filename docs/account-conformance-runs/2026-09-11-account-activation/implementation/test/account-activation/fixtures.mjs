import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  prepared,
  signing,
  manifestBytes,
  semanticBytes,
  hash,
} from '../account-admission/core-fixtures.mjs';
import { inputFor } from './oracle.mjs';
export const evidence = (name, data) => {
  if (process.env.ACCOUNT_REPORT_DIR) {
    mkdirSync(process.env.ACCOUNT_REPORT_DIR, { recursive: true });
    writeFileSync(
      join(process.env.ACCOUNT_REPORT_DIR, name + '.json'),
      JSON.stringify(data, null, 2) + '\n',
    );
  }
};
export async function ready(t, options) {
  const x = await prepared(t, options),
    offer = await x.begin(),
    completion = await x.completion(offer),
    input = inputFor(x, offer, completion);
  return Object.assign(x, {
    offer,
    baseCompletion: completion,
    input,
    challenge: () => x.authority.owner.challengePromotion(x.f.core, input),
    submit: (p) => x.authority.owner.finishPromotion(x.f.core, p),
  });
}
export function changedCompletion(x) {
  const c = structuredClone(x.baseCompletion);
  c.manifest.ds = c.admission.derivedDs = '010000';
  c.manifest.signature = signing(x.s.privateKey, manifestBytes(c.manifest));
  c.admission.manifestDigest = hash(manifestBytes(c.manifest));
  c.admission.signature = signing(x.s.privateKey, semanticBytes(c.admission));
  return c;
}
