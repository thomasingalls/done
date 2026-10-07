/** Fresh combined enrollment only; receipts are never exchanged for a new login. */
import type { AuthorityPin } from '../../account-protocol/authority';
import {
  enrollmentContextBytes,
  parseEnrollmentContext,
  parseEnrollmentResult,
  verifyEnrollmentReceipt,
  type EnrollmentContext,
  type EnrollmentReceipt,
} from '../../account-protocol/enrollment';
import {
  parseSessionIssuance,
  type SessionIssued,
  type SessionIssuanceResult,
} from '../../account-protocol/session';
import { digest } from '../../account-protocol/recovery';
import type { SessionTask } from '../crdt/writeSession';
import type { SessionVault } from './sessionVault';

export async function checkEnrollmentLogin(
  context: EnrollmentContext,
  retryKey: string,
  expected: { accountId: string; credentialId: string },
) {
  const c = parseEnrollmentContext(context);
  const bytes = Uint8Array.from(atob(retryKey.replaceAll('-', '+').replaceAll('_', '/')), (c) =>
    c.charCodeAt(0),
  );
  if (
    bytes.length !== 32 ||
    !c.login ||
    c.login.retryHash !== (await digest(bytes)) ||
    c.accountId !== expected.accountId ||
    c.passkeyId !== expected.credentialId
  )
    throw Error('The enrollment login challenge changed.');
}

export async function rememberEnrollmentLogin(
  vault: SessionVault,
  task: SessionTask,
  input: SessionIssuanceResult,
  expected: { accountId: string; credentialId: string },
  now = Date.now,
) {
  const held = await vault.load(task);
  // Never let an old enrollment proof overwrite sign-out, an unresolved login or another login.
  if (held === 'signed-out') throw Error('This login was signed out. Reconnect sync explicitly.');
  const result = parseSessionIssuance(held ?? input);
  if (
    !result.ok ||
    result.accountId !== expected.accountId ||
    result.credentialId !== expected.credentialId ||
    result.expiresAt <= now()
  )
    throw Error('Enrollment is saved, but its network login needs a fresh online check.');
  if (held === null) await vault.save(task, result);
  return result;
}

export async function completeEnrollmentLogin(options: {
  pin: AuthorityPin;
  context: EnrollmentContext;
  loginRetryKey: string;
  expected: { accountId: string; credentialId: string };
  signal: AbortSignal;
  finish: () => Promise<unknown>;
  remember: (result: SessionIssuanceResult) => Promise<SessionIssued>;
  persistReceipt: (receipt: EnrollmentReceipt) => Promise<void>;
  acknowledge: (login: SessionIssued) => Promise<unknown>;
}): Promise<EnrollmentReceipt> {
  const { signal } = options;
  signal.throwIfAborted();
  await checkEnrollmentLogin(options.context, options.loginRetryKey, options.expected);
  signal.throwIfAborted();
  const reply = parseEnrollmentResult(await options.finish());
  signal.throwIfAborted();
  if (
    !reply.ok ||
    !reply.receipt ||
    !reply.login ||
    !['prepared', 'admitted'].includes(reply.stage)
  )
    throw Error('Enrollment and login could not finish. Retry the saved attempt.');
  const receipt = await verifyEnrollmentReceipt(
    reply.receipt,
    options.pin,
    options.context.candidate,
  );
  if (enrollmentContextBytes(receipt.context) !== enrollmentContextBytes(options.context))
    throw Error('The saved enrollment challenge changed.');
  signal.throwIfAborted();
  const saved = await options.remember(reply.login);
  signal.throwIfAborted();
  await options.persistReceipt(receipt);
  signal.throwIfAborted();
  // Both client records must survive restart before retiring the server's exact-retry seal.
  try {
    await options.acknowledge(saved);
  } catch {
    /* Sealed login is already durable; later renewal can acknowledge again. */
  }
  signal.throwIfAborted();
  return receipt;
}
