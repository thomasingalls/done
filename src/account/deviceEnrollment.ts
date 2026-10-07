import { hasJoinedAccount } from '../crdt/joinedAccount';
import { openOwnedSyncingAccountWorkspace } from '../crdt/accountReceive';
import type { AdmittedWorkspace } from '../crdt/admittedWorkspace';
/** Private two-device approval and certified key-installation coordinator. */
import { continueContentHandoff, type ContentHandoffState } from './contentHandoff';
import { openApprovedWriting, type ContentReaderState } from './contentReader';
import { assertSlotPasskey } from './assertSlotPasskey';
import {
  parseCertificationSuccessor,
  verifyCertificationSuccessor,
} from '../../account-protocol/contentDelivery';
import type { SetupConfig } from './firstDeviceSetup';
import { withCeremonyVault } from './ceremonyVault';
import { freshEnrollmentChallenge } from './enrollmentChallenge';
import { pendingDeviceSlot, rememberPendingDevice } from './deviceConnectionRoutes';
export { pendingDeviceSlot } from './deviceConnectionRoutes';
import { beginLocalGenesis, inspectLocalStartup, resumeLocalGenesis } from '../crdt/localGenesis';
import { random, hex } from '../crdt/custodyCrypto';
import { closed } from '../../account-protocol/preparation';
import { digest, unhex } from '../../account-protocol/recovery';
import {
  same,
  json,
  verifySignature,
  verifyReceipt,
  parseAdmissionRequest,
  parseReceipt,
} from '../../account-protocol/admission';
import { parseAuthorityPin } from '../../account-protocol/authority';
import {
  verifySuccessor,
  parseSuccessor,
  type SuccessorBase,
} from '../../account-protocol/successor';
import {
  ceremonyInvitationMessage,
  parseCeremonyInvitation,
  ceremonyBootstrapMessage,
  ceremonyRequestMessage,
  parseCeremonyRequest,
  type CeremonyAction,
  type CeremonyRequest,
} from '../../account-protocol/ceremonyRelay';
import {
  parseCeremonyCommit,
  verifyCeremonyContext,
  ceremonyCommitMessage,
  ceremonyRevealMessage,
  verifyCeremonyCommit,
  verifyCeremonyPair,
  verifyCeremonyReveal,
  prepareCeremonyReveal,
  deriveCeremonyExchange,
  ceremonyContextHash,
  type CeremonyContext,
  type CeremonyCommit,
  type CeremonyReveal,
} from '../../account-protocol/ceremonyExchange';
import {
  ceremonyCommitment,
  normalizeCeremonyCode,
  type CeremonyRole,
} from '../../account-protocol/ceremony';
import {
  parseEnrollmentCandidate,
  enrollmentOptions,
  enrollmentPossessionMessage,
  verifyEnrollmentReceipt,
  type EnrollmentCandidate,
  type EnrollmentReceipt,
} from '../../account-protocol/enrollment';
interface Progress {
  v: 1;
  role: CeremonyRole;
  workspaceId: string;
  baseHash: string;
  /** Optional for pre-chooser attempts; learned after verifying an original invitation. */
  invitation?: ReturnType<typeof parseCeremonyInvitation>;
  nonce: string;
  admissionHead: string | null;
  enrollment: {
    candidate: EnrollmentCandidate;
    retryKey: string;
    proof: unknown | null;
    receipt: EnrollmentReceipt | null;
  } | null;
  context: CeremonyContext | null;
  own: CeremonyCommit | null;
  peer: CeremonyCommit | null;
  reveal: CeremonyReveal | null;
  peerReveal: CeremonyReveal | null;
  decision: CeremonyRequest | null;
  cancellation: CeremonyRequest | null;
  content?: ContentHandoffState;
  reading?: ContentReaderState;
  terminal: 'expired' | 'restart-required' | 'cancelled' | null;
}
export interface EnrollmentView {
  kind:
    | 'locked'
    | 'invite'
    | 'enroll'
    | 'waiting'
    | 'compare'
    | 'display'
    | 'approved'
    | 'certified'
    | 'editing'
    | 'mismatch'
    | 'expired'
    | 'restart-required'
    | 'cancelled';
  link?: string;
  code?: string;
  message: string;
  editor?: { workspace: AdmittedWorkspace; actorId: string; accountId: string };
}
const capability = () =>
  btoa(String.fromCharCode(...random(32)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
export async function preparePendingDevice(workspace: string, signal: AbortSignal) {
  unhex(workspace, 16);
  const slot = pendingDeviceSlot(workspace) ?? 'enrollment-' + hex(random(16));
  if (!/^enrollment-[a-f0-9]{32}$/.test(slot)) throw Error('Saved enrollment route is invalid');
  if ((await inspectLocalStartup(slot, { signal })).kind !== 'fresh')
    throw Error('Resume the saved device attempt');
  rememberPendingDevice(workspace, slot);
  return { slot, enrollment: beginLocalGenesis(slot, { signal }) };
}
const messages: Record<EnrollmentView['kind'], string> = {
  locked: 'Unlock this device to continue.',
  invite: 'Open this link on the device you want to connect.',
  enroll: 'Use the account’s passkey to request enrollment.',
  waiting: 'Waiting for the other device. Keep both pages open.',
  compare:
    'Read the five-character code on the new device and enter it here. You have one comparison.',
  display: 'Type this code on your existing device.',
  approved: 'Device approved. Finishing content access with your other device.',
  editing: 'Your account workspace is open.',
  certified: 'Content access is installed and certified.',
  mismatch: 'The codes did not match. This device attempt is spent.',
  expired: 'This attempt expired. It cannot be restarted with the same device credential.',
  'restart-required': 'Account authority changed. This attempt cannot continue.',
  cancelled: 'This attempt was cancelled.',
};
export function createDeviceEnrollment(
  config: SetupConfig,
  slotId: string,
  code: string,
  role: CeremonyRole,
  workspaceInput?: string,
  invitationInput?: unknown,
) {
  const pin = parseAuthorityPin(config.pin),
    lifetime = new AbortController();
  if (pin.origin !== location.origin) throw Error('Development service differs from this page');
  let opened: Awaited<ReturnType<typeof openOwnedSyncingAccountWorkspace>> | undefined;
  const editors = new Set<() => void>();
  let running = false,
    last: EnrollmentView = { kind: 'locked', message: messages.locked };
  // The link is a signed invitation, not a freshness challenge. Keep it stable for
  // this unlocked owner; bootstrap still uses a fresh nonce and verifies authority.
  let existingInvitation: ReturnType<typeof parseCeremonyInvitation> | null = null;
  const view = (kind: EnrollmentView['kind'], extra: Partial<EnrollmentView> = {}) =>
    (last = { kind, message: messages[kind], ...extra });
  const guard = () => lifetime.signal.throwIfAborted();
  const request = async (route: string, body: unknown): Promise<any> => {
    guard();
    const response = await fetch('/__account-setup/' + route, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + config.token },
      body: JSON.stringify(body),
      signal: lifetime.signal,
    });
    if (Number(response.headers.get('content-length')) > 80 * 1024 * 1024)
      throw Error('Service response too large');
    const text = await response.text();
    guard();
    if (text.length > 80 * 1024 * 1024) throw Error('Service response too large');
    const result = JSON.parse(text);
    if (!response.ok || result?.ok === false)
      throw Error('The service could not complete this step. Retry to resume the saved attempt.');
    return result;
  };
  const bootstrap = async (workspaceId: string, invitation: unknown) => {
    const nonce = hex(random(32)),
      raw = closed(await request('ceremony/bootstrap', { workspaceId, nonce, invitation }), [
        'ok',
        'nonce',
        'base',
        'successor',
        'certification',
        'signature',
      ]);
    const b = closed(raw['base'], ['pin', 'request', 'receipt']);
    const base: SuccessorBase = {
      pin: parseAuthorityPin(b['pin']),
      request: parseAdmissionRequest(b['request']),
      receipt: parseReceipt(b['receipt']),
    };
    const successor = raw['successor'] === null ? null : parseSuccessor(raw['successor']);
    const certification =
      raw['certification'] === null ? null : parseCertificationSuccessor(raw['certification']);
    if (certification && !successor) throw Error('Certification without admission');
    if (
      raw['ok'] !== true ||
      raw['nonce'] !== nonce ||
      !same(base.pin, pin) ||
      base.request.candidate.workspaceId !== workspaceId
    )
      throw Error('Account target changed');
    await verifySignature(
      pin.authRoot,
      raw['signature'] as string,
      await ceremonyBootstrapMessage({ ok: true, nonce, base, successor, certification }),
    );
    await verifyReceipt(base.receipt, base.request, pin);
    if (successor) await verifySuccessor(successor, base, { epoch: 2, head: successor.head });
    if (certification) await verifyCertificationSuccessor(certification, base, successor!);
    guard();
    return { base, successor, certification };
  };
  const operate = async (input?: {
    typed?: string;
    enroll?: true;
    cancel?: true;
    read?: true;
  }): Promise<EnrollmentView> => {
    if (running) return last;
    running = true;
    try {
      if (role === 'new') {
        const startup = await inspectLocalStartup(slotId, { signal: lifetime.signal });
        if (startup.kind === 'creation-pending')
          await resumeLocalGenesis(slotId, code, { signal: lifetime.signal });
      }
      return await withCeremonyVault(slotId, code, lifetime.signal, async (owner) => {
        const marker = owner.marker;
        if (role === 'existing' && (!marker || marker.v < 4 || !marker.admission?.receipt))
          throw Error('Open an established account on this device first');
        const workspaceId = role === 'existing' ? marker!.source.workspaceId : workspaceInput!;
        unhex(workspaceId, 16);
        let p = (await owner.load()) as Progress | null;
        if (p && (p.v !== 1 || p.role !== role || p.workspaceId !== workspaceId))
          throw Error('Saved approval belongs to a different account');
        const receivedInvitation = invitationInput ?? p?.invitation;
        if (role === 'new' && !receivedInvitation)
          throw Error('Open the original invitation and unlock once to save its resume route.');
        let invitation =
          role === 'new'
            ? parseCeremonyInvitation(receivedInvitation)
            : (existingInvitation ?? {
                v: 1 as const,
                workspaceId,
                credentialId: owner.participant.id,
                nonce: hex(random(32)),
                signature: '00'.repeat(64),
              });
        if (invitation.workspaceId !== workspaceId) throw Error('Account target changed');
        if (role === 'existing') {
          if (
            invitation.workspaceId !== workspaceId ||
            invitation.credentialId !== owner.participant.id
          )
            throw Error('Account target changed');
          if (!existingInvitation)
            existingInvitation = invitation = {
              ...invitation,
              signature: await owner.sign(await ceremonyInvitationMessage(invitation)),
            };
        }
        const boot = await bootstrap(workspaceId, invitation),
          baseHash = await digest(json(boot.base));
        if (
          role === 'existing' &&
          (!same(marker!.pin, pin) ||
            !same(marker!.admission!.request, boot.base.request) ||
            !same(marker!.admission!.receipt, boot.base.receipt))
        )
          throw Error('Service returned a different account');
        if (p && p.baseHash !== baseHash)
          throw Error('Saved approval belongs to a different account');
        const save = async (check?: () => void) => {
          guard();
          await owner.save(p, check);
          guard();
        };
        if (!p) {
          // Missing state must never silently resume an already-admitted credential.
          if (role === 'new' && boot.successor)
            throw Error(
              'This account already has an admitted device attempt. Its saved custody is required.',
            );
          p = {
            v: 1,
            role,
            workspaceId,
            baseHash,
            ...(role === 'new' ? { invitation } : {}),
            nonce: hex(random(32)),
            admissionHead: null,
            enrollment:
              role === 'new'
                ? {
                    candidate: {
                      v: 1,
                      workspaceId,
                      lineageId: boot.base.receipt.offer.epoch.lineageId,
                      head: boot.base.receipt.offer.head,
                      credentialId: owner.participant.id,
                      wPub: owner.participant.wPub,
                      sPub: owner.participant.sPub,
                    },
                    retryKey: capability(),
                    proof: null,
                    receipt: null,
                  }
                : null,
            context: null,
            own: null,
            peer: null,
            reveal: null,
            peerReveal: null,
            decision: null,
            cancellation: null,
            terminal: null,
          };
          await save();
        } else if (role === 'new' && !p.invitation) {
          p.invitation = invitation;
          await save();
        }
        const signed = async (
          action: CeremonyAction,
          payload: unknown,
        ): Promise<CeremonyRequest> => {
          const r: CeremonyRequest = {
            v: 1,
            kind: 'ceremony-relay',
            workspaceId,
            credentialId: owner.participant.id,
            action,
            payload,
            signature: '00'.repeat(64),
          };
          return { ...r, signature: await owner.sign(await ceremonyRequestMessage(r)) };
        };
        const send = async (action: CeremonyAction, payload: unknown) =>
          request('ceremony/exchange', await signed(action, payload));
        if (p.terminal) {
          if (p.cancellation && p.context && Date.now() < p.context.expiresAt)
            await request('ceremony/exchange', p.cancellation);
          return view(p.terminal);
        }
        if (role === 'new' && !p.admissionHead) {
          const en = p.enrollment!;
          if (input?.enroll) {
            if (!en.receipt) {
              if (!en.proof) {
                const challenge = await freshEnrollmentChallenge({
                  pin,
                  candidate: en.candidate,
                  retryKey: en.retryKey,
                  begin: (retryKey) =>
                    request('enrollment/begin', { retryKey, candidate: en.candidate }),
                  renew: async () => {
                    en.retryKey = capability();
                    await save();
                    return en.retryKey;
                  },
                });
                const credential = (await navigator.credentials.get({
                  publicKey: PublicKeyCredential.parseRequestOptionsFromJSON(
                    await enrollmentOptions(challenge.context),
                  ),
                  signal: lifetime.signal,
                })) as PublicKeyCredential | null;
                guard();
                if (!credential) throw Error('Passkey cancelled');
                if (Date.now() >= challenge.context.expiresAt)
                  throw Error(
                    'The passkey step expired. Use the account passkey again to renew it.',
                  );
                en.proof = {
                  retryKey: en.retryKey,
                  attemptId: challenge.context.attemptId,
                  response: credential.toJSON(),
                  possession: await owner.sign(enrollmentPossessionMessage(challenge.context)),
                };
                await save();
              }
              const finished = await request('enrollment/finish', en.proof);
              en.receipt = await verifyEnrollmentReceipt(finished.receipt, pin, en.candidate);
              await save();
            }
            const admitted = await request('enrollment/admit', {
              retryKey: en.retryKey,
              attemptId: en.receipt.context.attemptId,
              receiptId: en.receipt.receiptId,
            });
            const checked = await verifySuccessor(admitted, boot.base, {
              epoch: 2,
              head: admitted.head,
            });
            if (
              !same(
                checked.epoch.preparation.context.candidate,
                parseEnrollmentCandidate(en.candidate),
              )
            )
              throw Error('Different credential admitted');
            p.admissionHead = checked.head;
            await save();
            return view('waiting');
          }
          return view('enroll');
        }
        const successor = boot.successor;
        if (!successor) {
          if (p.context || p.admissionHead) {
            p.terminal = 'restart-required';
            await save();
            return view(p.terminal);
          }
          return view('invite', {
            link:
              location.origin +
              '/private/account-enrollment.html?workspace=' +
              workspaceId +
              '&invitation=' +
              encodeURIComponent(btoa(JSON.stringify(invitation))),
          });
        }
        if (
          (p.admissionHead && p.admissionHead !== successor.head) ||
          (p.context && p.context.head !== successor.head)
        ) {
          p.terminal = 'restart-required';
          await save();
          return view(p.terminal);
        }
        let remote = await send('read', null);
        if (!p.context) {
          if (role === 'existing') {
            // An existing relay attempt with missing local state cannot mint another nonce/context.
            if (remote.existing)
              throw Error(
                'The relay has an attempt but this device’s matching saved state is missing.',
              );
            const e = successor.epoch,
              c = e.preparation.context.candidate,
              createdAt = Date.now();
            p.context = {
              v: 1,
              pin,
              accountId: e.accountId,
              principalId: e.principalId,
              workspaceId,
              lineageId: e.lineageId,
              epoch: 2,
              head: successor.head,
              certifiedSetDigest: e.certified.digest,
              recoveryStateDigest: e.certified.value.recoveryStateDigest,
              existing: e.certified.value.members[0],
              candidate: { id: c.credentialId, wPub: c.wPub, sPub: c.sPub },
              attemptId: hex(random(32)),
              createdAt,
              expiresAt: createdAt + 600000,
            };
          } else {
            if (!remote.existing) return view('waiting');
            p.context = parseCeremonyCommit(remote.existing).context;
          }
        }
        const context = p.context;
        const authority = await verifyCeremonyContext(
          context,
          boot.base,
          successor,
          { epoch: 2, head: successor.head },
          { role, ...owner.participant },
          Math.min(Date.now(), context.expiresAt - 1),
        );
        const finish = async (outcome: 'approved' | 'mismatch') => {
          if (outcome === 'mismatch') return view('mismatch');
          const kind = await continueContentHandoff(
            p!,
            owner,
            { ...boot, successor },
            () => save(),
            request,
          );
          if (kind !== 'certified' || !input?.read) return view(kind);
          const certification = p!.content!.certification!;
          const result = await openApprovedWriting(
            p!,
            owner,
            { base: boot.base, successor, certification },
            {
              assert: assertSlotPasskey(lifetime.signal),
              token: config.token,
              signal: lifetime.signal,
              save: () => save(),
              request,
            },
          );
          guard();
          if (result.kind === 'published')
            return view('certified', {
              message:
                'Your writing is available to the approved device. Open its writing there. You can return to your account here; further edits will use sync.',
            });
          if (result.kind === 'waiting')
            return view('certified', {
              message:
                'On your first device, choose “Make writing available”, then open your writing here.',
            });
          await owner.installWriting(
            { base: boot.base, successor, certification },
            p!.reading!,
            p!.content!.key!,
          );
          return view('certified', { message: 'Opening your writing…' });
        };
        // Relay labels are hints. Only a peer-signed cancellation/decision may be adopted.
        if (remote.cancellation) {
          const r = parseCeremonyRequest(remote.cancellation);
          const key =
            r.credentialId === context.existing.id
              ? context.existing.sPub
              : r.credentialId === context.candidate.id
                ? context.candidate.sPub
                : '';
          await verifySignature(key, r.signature, await ceremonyRequestMessage(r));
          if (
            r.action !== 'cancel' ||
            r.workspaceId !== workspaceId ||
            (r.payload as { contextHash: string }).contextHash !==
              (await ceremonyContextHash(context))
          )
            throw Error('Invalid cancellation');
          p.cancellation = r;
          p.terminal = 'cancelled';
          await save();
          return view('cancelled');
        }
        if (role === 'new' && remote.decision && p.own && p.peer && p.reveal) {
          const pair = await verifyCeremonyPair(authority, p.peer, p.own, context.createdAt);
          const peerReveal = await verifyCeremonyReveal(
            pair,
            remote.existingReveal,
            'existing',
            context.createdAt,
          );
          const opening = await deriveCeremonyExchange(
            pair,
            peerReveal,
            p.reveal,
            context.createdAt,
          );
          const d = parseCeremonyRequest(remote.decision),
            b = d.payload as {
              contextHash: string;
              transcriptHash: string;
              outcome: 'approved' | 'mismatch';
            };
          await verifySignature(
            context.existing.sPub,
            d.signature,
            await ceremonyRequestMessage(d),
          );
          if (
            d.action !== 'decide' ||
            d.workspaceId !== workspaceId ||
            d.credentialId !== context.existing.id ||
            b.contextHash !== pair.contextHash ||
            b.transcriptHash !== opening.transcriptHash
          )
            throw Error('Invalid approval');
          if (p.decision && !same(p.decision, d)) throw Error('Approval changed');
          if (!p.decision) {
            p.peerReveal = peerReveal;
            p.decision = d;
            await save();
          }
          return finish(b.outcome);
        }
        if (Date.now() >= context.expiresAt && !p.decision) {
          p.terminal = 'expired';
          await save();
          return view('expired');
        }
        const live = () => {
          guard();
          if (Date.now() < context.createdAt || Date.now() >= context.expiresAt)
            throw Error('This comparison expired. Refresh to retain its stopped state.');
        };
        if (!p.own) {
          live();
          const proposal: CeremonyCommit = {
            v: 1,
            kind: 'ceremony-commitment',
            context,
            role,
            commitment: await ceremonyCommitment(role, p.nonce),
            signature: '00'.repeat(64),
          };
          p.own = {
            ...proposal,
            signature: await owner.sign(await ceremonyCommitMessage(proposal)),
          };
          await save(live);
        }
        await verifyCeremonyCommit(authority, p.own, role, context.createdAt);
        // Stored decisions are returned verbatim and never admit another comparison.
        if (p.decision) {
          await verifySignature(
            context.existing.sPub,
            p.decision.signature,
            await ceremonyRequestMessage(p.decision),
          );
          if (remote.decision && !same(remote.decision, p.decision))
            throw Error('Service approval differs from the saved decision');
          if (!remote.decision) await request('ceremony/exchange', p.decision);
          return finish((p.decision.payload as { outcome: 'approved' | 'mismatch' }).outcome);
        }
        live();
        remote = await send('commit', p.own);
        const peer = role === 'existing' ? remote.candidate : remote.existing,
          peerRole = role === 'existing' ? 'new' : 'existing';
        if (peer) {
          const checked = await verifyCeremonyCommit(authority, peer, peerRole, Date.now());
          if (p.peer && !same(p.peer, checked))
            throw Error('The other device’s commitment changed.');
          if (!p.peer) {
            p.peer = checked;
            await save(live);
          }
        }
        if (!p.peer) return view('waiting');
        const pair = await verifyCeremonyPair(
          authority,
          role === 'existing' ? p.own : p.peer,
          role === 'new' ? p.own : p.peer,
          Date.now(),
        );
        if (input?.cancel) {
          p.terminal = 'cancelled';
          p.cancellation = await signed('cancel', { contextHash: pair.contextHash });
          await save(live);
          await request('ceremony/exchange', p.cancellation);
          return view('cancelled');
        }
        if (!p.reveal) {
          const proposal = await prepareCeremonyReveal(pair, p.nonce, Date.now());
          p.reveal = {
            ...proposal,
            signature: await owner.sign(await ceremonyRevealMessage(proposal)),
          };
          await save(live);
        }
        live();
        remote = await send('reveal', p.reveal);
        const peerReveal = role === 'existing' ? remote.newReveal : remote.existingReveal;
        if (peerReveal) {
          const checked = await verifyCeremonyReveal(pair, peerReveal, peerRole, Date.now());
          if (p.peerReveal && !same(p.peerReveal, checked))
            throw Error('The other device’s reveal changed.');
          if (!p.peerReveal) {
            p.peerReveal = checked;
            await save(live);
          }
        }
        if (!p.peerReveal) return view('waiting');
        const opening = await deriveCeremonyExchange(
          pair,
          role === 'existing' ? p.reveal : p.peerReveal,
          role === 'new' ? p.reveal : p.peerReveal,
          Date.now(),
        );
        if (remote.cancellation) {
          const r = parseCeremonyRequest(remote.cancellation);
          const key =
            r.credentialId === context.existing.id
              ? context.existing.sPub
              : r.credentialId === context.candidate.id
                ? context.candidate.sPub
                : '';
          await verifySignature(key, r.signature, await ceremonyRequestMessage(r));
          if (
            r.action !== 'cancel' ||
            (r.payload as { contextHash: string }).contextHash !== pair.contextHash
          )
            throw Error('Invalid cancellation');
          p.terminal = 'cancelled';
          await save();
          return view('cancelled');
        }
        if (role === 'new' && remote.decision) {
          const d = parseCeremonyRequest(remote.decision),
            b = d.payload as {
              contextHash: string;
              transcriptHash: string;
              outcome: 'approved' | 'mismatch';
            };
          await verifySignature(
            context.existing.sPub,
            d.signature,
            await ceremonyRequestMessage(d),
          );
          if (
            d.action !== 'decide' ||
            d.credentialId !== context.existing.id ||
            d.workspaceId !== workspaceId ||
            b.contextHash !== pair.contextHash ||
            b.transcriptHash !== opening.transcriptHash
          )
            throw Error('Invalid approval');
          p.decision = d;
          await save(live);
          return finish(b.outcome);
        }
        if (role === 'existing' && input?.typed !== undefined) {
          const normalized = normalizeCeremonyCode(input.typed);
          if (!normalized) throw Error('Enter the five characters shown on the new device.');
          const outcome = normalized === opening.sas ? 'approved' : 'mismatch';
          p.decision = await signed('decide', {
            contextHash: await ceremonyContextHash(context),
            transcriptHash: opening.transcriptHash,
            outcome,
          });
          await save(live);
          await request('ceremony/exchange', p.decision);
          return finish(outcome);
        }
        return role === 'new' ? view('display', { code: opening.sas }) : view('compare');
      });
    } finally {
      running = false;
    }
  };
  const openEditor = async () => {
    if (role !== 'new') return null;
    if (opened) return last;
    const joined = await hasJoinedAccount(slotId, code, lifetime.signal);
    if (!joined) return null;
    if (workspaceInput !== joined.workspaceId)
      throw Error('Saved workspace differs from this connection');
    opened = await openOwnedSyncingAccountWorkspace(
      {
        slotId,
        code,
        pin,
        assertPasskey: assertSlotPasskey(lifetime.signal),
        signal: lifetime.signal,
        identity: {
          id: joined.principalId,
          actor: { kind: 'human', name: 'You', color: '#e0662f' },
          device: { id: 'joined:' + slotId, name: 'This device' },
        },
      },
      config.token,
      true,
    );
    guard();
    code = '';
    return view('editing', {
      editor: {
        workspace: opened.workspace,
        actorId: joined.principalId,
        accountId: opened.accountId,
      },
    });
  };
  return {
    refresh: async () => (await openEditor()) ?? operate(),
    enroll: () => operate({ enroll: true }),
    compare: (typed: string) => operate({ typed }),
    cancel: () => operate({ cancel: true }),
    openWriting: async () => {
      const result = await operate({ read: true });
      return (await openEditor()) ?? result;
    },
    registerEditor(destroy: () => void) {
      guard();
      editors.add(destroy);
      return () => {
        editors.delete(destroy);
      };
    },
    close: async () => {
      lifetime.abort();
      for (const destroy of [...editors]) {
        try {
          destroy();
        } catch {
          /* Continue closing storage if a view fails to retire. */
        }
      }
      editors.clear();
      await opened?.workspace.close();
      opened = undefined;
      code = '';
      last = { kind: 'locked', message: messages.locked };
    },
    get busy() {
      return running;
    },
  };
}
