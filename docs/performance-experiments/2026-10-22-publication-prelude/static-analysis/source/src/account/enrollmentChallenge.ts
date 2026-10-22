import type { AuthorityPin } from '../../account-protocol/authority.ts';
import {
  parseEnrollmentResult,
  verifyEnrollmentChallenge,
  type EnrollmentCandidate,
} from '../../account-protocol/enrollment.ts';

/** Only for an enrollment with no saved proof, receipt or admission. Never resets a comparison. */
export async function freshEnrollmentChallenge({
  pin,
  candidate,
  retryKey,
  begin,
  renew,
  now = Date.now,
}: {
  pin: AuthorityPin;
  candidate: EnrollmentCandidate;
  retryKey: string;
  begin: (retryKey: string) => Promise<unknown>;
  /** Persist the new retry key before returning it; failure must prevent the next request. */
  renew: () => Promise<string>;
  now?: () => number;
}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const reply = parseEnrollmentResult(await begin(retryKey));
    if (!reply.ok) throw Error('The service could not start the passkey step. Try again.');
    const challenge = reply.challenge;
    // Authenticate the historical challenge before its expiry can cause local renewal.
    await verifyEnrollmentChallenge(challenge, pin, candidate, challenge.context.expiresAt - 1);
    if (reply.receipt || !['challenge', 'expired'].includes(reply.stage))
      throw Error(
        'This enrollment has already advanced or stopped. Its saved attempt is required.',
      );
    const current = now();
    if (!Number.isSafeInteger(current) || current < 0) throw Error('Device clock is unavailable');
    if (current >= challenge.context.expiresAt && attempt === 0) {
      retryKey = await renew();
      continue;
    }
    await verifyEnrollmentChallenge(challenge, pin, candidate, current);
    if (reply.stage !== 'challenge')
      throw Error('The service reports this passkey step has stopped. Try again.');
    return challenge;
  }
  throw Error('The passkey step could not be renewed. Try again.');
}
