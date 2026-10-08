/** Invitation/bootstrap composition over actual slot custody. No URL or relay label grants access. */
import { same } from '../../account-protocol/admission';
import { parseAuthorityPin, type AuthorityPin } from '../../account-protocol/authority';
import {
  parseMembershipInvitation,
  parseMembershipBootstrapRequest,
  membershipInvitationMessage,
  verifyMembershipInvitation,
  verifyMembershipChain,
  verifyMembershipBootstrapResponse,
} from '../../account-protocol/membershipLocator';
import {
  historyAuthority,
  historyPublisher,
  historyMembership,
} from '../../account-protocol/admissionHistory';
import { membershipState } from '../../account-protocol/membership';
import { hex, random } from '../crdt/custodyCrypto';
import type { MembershipVault } from './membershipVault';

export async function heldMembershipSource(owner: Pick<MembershipVault, 'source' | 'participant'>) {
  const source = owner.source;
  if (source.kind === 'pending' || !source.proofs)
    throw Error('Open a certified account before inviting another device');
  const base = source.kind === 'original' ? source.base : source.authority.base,
    result = await verifyMembershipChain(source.proofs, base),
    history = historyPublisher(result.history, owner.participant.id);
  if (history.signingKey !== owner.participant.sPub)
    throw Error('Inviter signing custody differs from membership');
  // Recipient identity includes its wrapping key; a signing credential alone cannot replace it.
  const latestCertificate = membershipState(historyMembership(result.history)).certificate;
  if (!latestCertificate.members.some((m) => same(m, owner.participant)))
    throw Error('Inviter wrapping custody differs from membership');
  return { base, proofs: result.proofs, history };
}
export async function prepareMembershipInvitation(
  owner: Pick<MembershipVault, 'source' | 'participant' | 'sign'>,
  retained?: unknown,
) {
  const held = await heldMembershipSource(owner);
  if (retained !== undefined) {
    const invitation = await verifyMembershipInvitation(retained, held.history);
    if (invitation.credentialId !== owner.participant.id)
      throw Error('Saved invitation belongs to another device');
    return { ...held, invitation };
  }
  const invitation = parseMembershipInvitation({
    v: 2,
    workspaceId: held.history.current.workspace,
    lineageId: held.history.current.lineage,
    credentialId: owner.participant.id,
    epoch: held.history.current.tip,
    head: held.history.current.head,
    nonce: hex(random(32)),
    signature: '00'.repeat(64),
  });
  invitation.signature = await owner.sign(await membershipInvitationMessage(invitation));
  await verifyMembershipInvitation(invitation, held.history);
  return { ...held, invitation };
}
/** Caller saves the invitation before requesting bootstrap so a cold resume uses the same route. */
export async function bootstrapMembershipInvitation(
  pinInput: AuthorityPin,
  invitationInput: unknown,
  request: (path: string, body: unknown) => Promise<unknown>,
  owner?: Pick<MembershipVault, 'source' | 'participant'>,
) {
  const pin = parseAuthorityPin(pinInput),
    invitation = parseMembershipInvitation(invitationInput),
    body = parseMembershipBootstrapRequest({
      v: 2,
      workspaceId: invitation.workspaceId,
      nonce: hex(random(32)),
      invitation,
    }),
    held = owner ? await heldMembershipSource(owner) : null;
  const result = await verifyMembershipBootstrapResponse(
    await request('/__account-setup/membership/bootstrap', body),
    body,
    pin,
  );
  if (held) {
    if (!same(result.response.base, held.base))
      throw Error('Bootstrap account differs from held custody');
    const history = historyPublisher(result.history, owner!.participant.id);
    historyAuthority(history, held.history.current);
    if (invitation.credentialId !== owner!.participant.id)
      throw Error('Invitation belongs to another device');
  }
  return { ...result, invitation };
}
export function membershipInvitationUrl(origin: string, input: unknown) {
  const invitation = parseMembershipInvitation(input),
    url = new URL('/private/account-enrollment.html', origin);
  if (url.origin !== origin) throw Error('Invalid invitation origin');
  url.searchParams.set('workspace', invitation.workspaceId);
  url.searchParams.set('invitation', btoa(JSON.stringify(invitation)));
  return url.href;
}
