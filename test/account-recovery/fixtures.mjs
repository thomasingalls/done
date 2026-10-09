import { generateRecovery, confirmRecovery } from '../../src/account/recovery.ts';
import { fixture, registered, fresh } from '../account-core/fixtures.mjs';
export { fixture, registered, fresh };
export const scope = {
  principalId: 'local-principal',
  workspaceId: 'local-workspace',
  lineageId: 'never-admitted',
  authRoot: 'ab'.repeat(32),
};
export async function prepared(t, instrumentation = {}, alg = -8) {
  const f = fixture(t, instrumentation),
    account = await registered(f, alg);
  const generated = await generateRecovery(scope);
  const input = { retryKey: account.retryKey, draft: generated.draft };
  const view = await f.core.beginRecovery(input);
  if (view.stage !== 'recovery-ceremony') throw Error(JSON.stringify(view));
  const proof = {
    retryKey: account.retryKey,
    recoveryId: view.recoveryId,
    recoveryProof: await confirmRecovery(
      generated.draft,
      generated.code,
      view.options.challenge,
      view.draftDigest,
    ),
    response: account.key.assert(view),
  };
  return { f, account, generated, input, view, proof };
}
