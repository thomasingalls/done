import type { InboundAuthorityReuse } from './inboundAuthorityReuse.ts';
import {
  historyCatalogMessage,
  historyCheckpointPageMessage,
} from '../account-protocol/historyExchange.ts';
import { recoverySuccessorMessage } from '../account-protocol/recoveryTransition.ts';
import { recoveryReadPageMessage } from '../account-protocol/recoveryRead.ts';
import {
  lostRecoveryChallengeMessage,
  lostRecoveryPreparedMessage,
} from '../account-protocol/lostDeviceRecovery.ts';
import { recoveryHeadAssertionMessage } from '../account-protocol/recoveryBootstrap.ts';
import type { LostRecoveryIssuer, LostRecoveryOperation } from './lostDeviceRecovery.ts';
import {
  parseRemovalDiscoveryResponse,
  removalDiscoveryResponseMessage,
} from '../account-protocol/removalDiscovery.ts';
import {
  removalPreparationMessage,
  parseRotationOutcome,
  rotationOutcomeMessage,
  parseRemovalPreparation,
} from '../account-protocol/rotation.ts';
import {
  membershipBootstrapMessage,
  parseMembershipBootstrapResponse,
  membershipDiscoveryResponseMessage,
  parseMembershipDiscoveryResponse,
} from '../account-protocol/membershipLocator.ts';
import type { MembershipLocatorIssuer } from './membershipLocator.ts';
import {
  parseMembershipRotationEpoch,
  membershipRotationMessage,
  parseMembershipCertificationEpoch,
  membershipCertificationMessage,
} from '../account-protocol/membership.ts';
import type { OperationAuthorization } from './authorization.ts';
import {
  parseMembershipAdmissionEpoch,
  membershipAdmissionMessage,
  parseMembershipCancellationEpoch,
  membershipCancellationMessage,
} from '../account-protocol/membership.ts';
import { ceremonyBootstrapMessage } from '../account-protocol/ceremonyRelay.ts';
import {
  parseCertificationEpoch,
  certificationEpochMessage,
} from '../account-protocol/contentDelivery.ts';
import { discoveryResponseMessage, parseDiscoveryResponse } from '../account-protocol/successor.ts';
import { successorMessage, parseSuccessorEpoch } from '../account-protocol/successor.ts';
import { digest } from '../account-protocol/recovery.ts';
import {
  enrollmentChallengeMessage,
  enrollmentReceiptMessage,
} from '../account-protocol/enrollment.ts';
import type { EnrollmentIssuer, EnrollmentOperation } from './enrollment.ts';
import { activationMessage } from '../account-protocol/activation.ts';
import type { ReadIssuer, InboundReadIssuer } from './delivery.ts';
import type { ReadPage } from '../account-protocol/deliveryTransport.ts';
import { bindingMessage } from '../account-protocol/slot.ts';
import { AcceptanceCustody } from './acceptance.ts';
import { assertEd25519SeedExport, ed25519PublicHex } from './keyEncoding.ts';
import {
  firstEpoch,
  epochHead,
  offerMessage,
  epochMessage,
  receiptMessage,
  type AdmissionOffer,
  type AdmissionReceipt,
} from '../account-protocol/admission.ts';
import type { PromotionIssuer } from './promotion.ts';
import { closed, pendingMessage, type PendingProof } from '../account-protocol/preparation.ts';
import type { AccountCore } from './core.ts';
/** Explicit private service root and acceptance-custody owner. Fixed-purpose issuance only. */
import { DatabaseSync } from 'node:sqlite';
import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
  sign,
  type KeyObject,
} from 'node:crypto';
import { openSync, closeSync, lstatSync } from 'node:fs';
import {
  parseAuthorityPin,
  pinBytes,
  authorityMessage,
  type AuthorityPin,
  type AuthorityProof,
} from '../account-protocol/authority.ts';
import { unhex, lp } from '../account-protocol/recovery.ts';
import { canonical } from './protocol.ts';

type Hook = (point: 'before-commit' | 'after-commit') => void;
const seedPrefix = Buffer.from('302e020100300506032b657004220420', 'hex');
const sealKey = (operatorKey: Uint8Array, pin: AuthorityPin, salt: string): Buffer => {
  if (!(operatorKey instanceof Uint8Array) || operatorKey.length !== 32)
    throw Error('Authority requires a 32-byte operator wrapping key');
  return Buffer.from(
    hkdfSync(
      'sha256',
      operatorKey,
      unhex(salt, 16),
      lp('done/service-authority-seal/v1', pin.serviceId, pin.origin, pin.rpId, pin.authRoot),
      32,
    ),
  );
};
function openFile(path: string, create: boolean): void {
  if (create) {
    // Exclusive creation means a failed/partial setup is never silently rekeyed.
    const fd = openSync(path, 'wx', 0o600);
    closeSync(fd);
  }
  const info = lstatSync(path);
  if (
    !info.isFile() ||
    (info.mode & 0o077) !== 0 ||
    (process.getuid && info.uid !== process.getuid())
  )
    throw Error('Authority database must be an owned private regular file');
}
function openDatabase(path: string, readOnly: boolean) {
  const db = new DatabaseSync(path, { readOnly });
  try {
    db.exec('PRAGMA busy_timeout=5000;');
    if (!readOnly) db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
interface SealedRoot {
  pin: string;
  salt: string;
  nonce: string;
  ct: string;
}
function unlock(row: SealedRoot, expected: AuthorityPin, operatorKey: Uint8Array): KeyObject {
  const pin = parseAuthorityPin(JSON.parse(row.pin));
  if (canonical(pin) !== canonical(expected)) throw Error('Authority pin changed');
  const key = sealKey(operatorKey, pin, row.salt);
  let raw: Buffer | undefined, encoded: Buffer | undefined;
  try {
    const ct = Buffer.from(unhex(row.ct, 48));
    const cipher = createDecipheriv('aes-256-gcm', key, unhex(row.nonce, 12));
    cipher.setAAD(pinBytes(pin));
    cipher.setAuthTag(ct.subarray(-16));
    raw = Buffer.concat([cipher.update(ct.subarray(0, -16)), cipher.final()]);
    if (raw.length !== 32) throw Error('Invalid authority scalar');
    encoded = Buffer.concat([seedPrefix, raw]);
    const signing = createPrivateKey({ key: encoded, format: 'der', type: 'pkcs8' });
    if (ed25519PublicHex(createPublicKey(signing)) !== pin.authRoot)
      throw Error('Authority private/public mismatch');
    return signing;
  } finally {
    key.fill(0);
    raw?.fill(0);
    encoded?.fill(0);
  }
}
export class PrivateAuthority {
  #pin: AuthorityPin;
  #key: KeyObject | null;
  #acceptance: AcceptanceCustody;
  private constructor(pin: AuthorityPin, key: KeyObject, operatorKey: Uint8Array) {
    this.#pin = pin;
    this.#key = key;
    this.#acceptance = new AcceptanceCustody(operatorKey, pin);
  }
  /** The operator owns the parent directory, external wrapping key and independent public pin distribution. */
  static initialize(
    path: string,
    policy: { origin: string; rpId: string },
    operatorKey: Uint8Array,
    hook: Hook = () => {},
  ): AuthorityPin {
    // Validate before creating a filesystem artifact.
    const probe = parseAuthorityPin({
      v: 1,
      ...policy,
      serviceId: '00'.repeat(16),
      authRoot: '00'.repeat(32),
    });
    if (!(operatorKey instanceof Uint8Array) || operatorKey.length !== 32)
      throw Error('Authority requires a 32-byte operator wrapping key');
    openFile(path, true);
    const db = openDatabase(path, false);
    let encoded: Buffer | undefined, key: Buffer | undefined;
    try {
      db.exec('BEGIN IMMEDIATE');
      const pair = generateKeyPairSync('ed25519');
      const pin: AuthorityPin = {
        ...probe,
        serviceId: randomBytes(16).toString('hex'),
        authRoot: ed25519PublicHex(pair.publicKey),
      };
      encoded = pair.privateKey.export({ format: 'der', type: 'pkcs8' });
      assertEd25519SeedExport(encoded);
      const salt = randomBytes(16).toString('hex'),
        nonce = randomBytes(12).toString('hex');
      key = sealKey(operatorKey, pin, salt);
      const cipher = createCipheriv('aes-256-gcm', key, Buffer.from(nonce, 'hex'));
      cipher.setAAD(pinBytes(pin));
      const ct = Buffer.concat([
        cipher.update(encoded.subarray(-32)),
        cipher.final(),
        cipher.getAuthTag(),
      ]).toString('hex');
      db.exec(
        'CREATE TABLE authority (id INTEGER PRIMARY KEY CHECK(id=1), pin TEXT NOT NULL, salt TEXT NOT NULL, nonce TEXT NOT NULL, ct TEXT NOT NULL); PRAGMA user_version=1;',
      );
      db.prepare('INSERT INTO authority VALUES (1,?,?,?,?)').run(canonical(pin), salt, nonce, ct);
      hook('before-commit');
      db.exec('COMMIT');
      hook('after-commit');
      return Object.freeze(pin);
    } catch (error) {
      if (db.isTransaction) db.exec('ROLLBACK');
      throw error;
    } finally {
      encoded?.fill(0);
      key?.fill(0);
      db.close();
    }
  }
  /** Read-only cold opening. Neither a missing root nor an unreadable root generates a replacement. */
  static open(path: string, expectedPin: AuthorityPin, operatorKey: Uint8Array): PrivateAuthority {
    const pin = parseAuthorityPin(expectedPin);
    openFile(path, false);
    const db = openDatabase(path, true);
    try {
      if (db.prepare('PRAGMA user_version').get()!.user_version !== 1)
        throw Error('Unsupported authority database');
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
      if (tables.length !== 1 || tables[0]!.name !== 'authority')
        throw Error('Unclassified authority database');
      const rows = db.prepare('SELECT * FROM authority').all();
      if (rows.length !== 1 || rows[0]!.id !== 1)
        throw Error('Authority root missing or ambiguous');
      return new PrivateAuthority(
        pin,
        unlock(rows[0] as unknown as SealedRoot, pin, operatorKey),
        operatorKey,
      );
    } finally {
      db.close();
    }
  }
  /** Cold-read the public pin for the trusted operator after a lost initialization response.
   * It is NOT a client trust-discovery endpoint. The wrapping factor authenticates its seal.
   */
  static recoverPin(path: string, operatorKey: Uint8Array): AuthorityPin {
    openFile(path, false);
    const db = openDatabase(path, true);
    let pin: AuthorityPin;
    try {
      pin = parseAuthorityPin(
        JSON.parse(db.prepare('SELECT pin FROM authority WHERE id=1').get()!.pin as string),
      );
    } finally {
      db.close();
    }
    const owner = PrivateAuthority.open(path, pin, operatorKey);
    owner.close();
    return Object.freeze(pin);
  }
  get pin(): Readonly<AuthorityPin> {
    return Object.freeze({ ...this.#pin });
  }
  prove(input: unknown): AuthorityProof {
    if (!this.#key) throw Error('Authority closed');
    const value = input as { nonce?: unknown } | undefined;
    if (
      !value ||
      typeof value !== 'object' ||
      Object.keys(value).join() !== 'nonce' ||
      typeof value.nonce !== 'string'
    )
      throw Error('Malformed authority request');
    const nonce = value.nonce;
    return {
      v: 1,
      pin: { ...this.#pin },
      nonce,
      signature: sign(null, authorityMessage(this.#pin, nonce), this.#key).toString('hex'),
    };
  }
  /** Resolve through the live service core; callers cannot supply the signed state. */
  pending(
    core: AccountCore,
    input: unknown,
    abandon = false,
  ): PendingProof | { ok: false; refusal: string } {
    if (!this.#key) throw Error('Authority closed');
    const r = closed(input, ['retryKey', 'accountId', 'nonce']);
    unhex(r['nonce'], 32);
    const result = core.pendingPreparation(
      { retryKey: r['retryKey'], accountId: r['accountId'] },
      abandon,
    );
    if (!result.ok) return result;
    if (result.state.draft && result.state.draft.authRoot !== this.#pin.authRoot)
      throw Error('Recovery root differs from service root');
    const nonce = r['nonce'] as string;
    return {
      v: 1,
      pin: { ...this.#pin },
      nonce,
      state: result.state,
      signature: sign(null, pendingMessage(this.#pin, nonce, result.state), this.#key).toString(
        'hex',
      ),
    };
  }
  #issuer(): PromotionIssuer {
    const signature = (message: Uint8Array) => {
      if (!this.#key) throw Error('Authority closed');
      return sign(null, message, this.#key).toString('hex');
    };
    return {
      pin: { ...this.#pin },
      bind: async (binding) => signature(bindingMessage(binding)),
      prepare: async (request) => {
        const { requestDigest } = await import('../account-protocol/admission.ts');
        const seal = this.#acceptance.create(await requestDigest(request));
        const epoch = await firstEpoch(request, this.#pin, seal.publicKey);
        const offer: AdmissionOffer = {
          v: 1,
          kind: 'promotion-offer',
          epoch,
          head: await epochHead(epoch),
          signature: '00'.repeat(64),
        };
        offer.signature = signature(await offerMessage(offer));
        return { offer, seal };
      },
      challenge: async (context) => ({
        v: 1,
        kind: 'promotion-activation-challenge',
        context,
        signature: signature(await activationMessage(context)),
      }),
      complete: async (offer, completion, activation) => {
        const receipt: AdmissionReceipt = {
          v: 2,
          kind: 'promotion-receipt',
          offer,
          completion,
          epochSignature: signature(await epochMessage(offer.epoch)),
          activation,
          signature: '00'.repeat(64),
        };
        receipt.signature = signature(await receiptMessage(receipt));
        return receipt;
      },
      check: (seal, id, pub) => this.#acceptance.check(seal, id, pub),
    };
  }
  beginPromotion(core: AccountCore, input: unknown) {
    return core.beginPromotion(input, this.#issuer());
  }
  challengePromotion(core: AccountCore, input: unknown) {
    return core.challengePromotion(input, this.#issuer());
  }
  finishPromotion(core: AccountCore, input: unknown) {
    return core.finishPromotion(input, this.#issuer());
  }
  promotionBinding(core: AccountCore, input: unknown) {
    return core.promotionBinding(input, this.#issuer());
  }
  commitRecovery(core: AccountCore, input: unknown) {
    return core.commitRecovery(input, this.#lostRecoveryIssuer());
  }
  #lostRecoveryIssuer(): LostRecoveryIssuer {
    const signature = (message: Uint8Array) => {
      if (!this.#key) throw Error('Authority closed');
      return sign(null, message, this.#key).toString('hex');
    };
    return {
      bind: async (binding) => signature(bindingMessage(binding)),
      pin: { ...this.#pin },
      check: (seal, id, pub) => this.#acceptance.check(seal, id, pub),
      witness: (seal, id, pub, scope, value) =>
        this.#acceptance.witness(seal, id, pub, scope, value),
      finalize: (seal, id, pub, value) => this.#acceptance.finalize(seal, id, pub, value),
      successor: async (epoch) => {
        const body = {
          v: 1 as const,
          kind: 'recovery-successor' as const,
          epoch,
          head: '00'.repeat(32),
          signature: '00'.repeat(64),
        };
        const message = await recoverySuccessorMessage(body);
        return { ...body, head: await digest(message), signature: signature(message) };
      },
      challenge: (context) => ({
        context,
        signature: signature(lostRecoveryChallengeMessage(context)),
      }),
      head: (body) => ({
        ...body,
        signature: signature(recoveryHeadAssertionMessage({ ...body, signature: '00'.repeat(64) })),
      }),
      page: async (body) => ({
        ...body,
        signature: signature(
          await recoveryReadPageMessage({ ...body, signature: '00'.repeat(64) }),
        ),
      }),
      prepared: async (body) => ({
        ...body,
        signature: signature(
          await lostRecoveryPreparedMessage({ ...body, signature: '00'.repeat(64) }),
        ),
      }),
    };
  }
  lostDeviceRecovery(core: AccountCore, operation: LostRecoveryOperation, input: unknown) {
    return core.lostDeviceRecovery(operation, input, this.#lostRecoveryIssuer());
  }
  readRecovery(core: AccountCore, input: unknown) {
    return core.readRecovery(input, this.#lostRecoveryIssuer());
  }
  #enrollmentIssuer(): EnrollmentIssuer {
    const signature = (message: Uint8Array) => {
      if (!this.#key) throw Error('Authority closed');
      return sign(null, message, this.#key).toString('hex');
    };
    return {
      pin: { ...this.#pin },
      check: (seal, id, pub) => this.#acceptance.check(seal, id, pub),
      challenge: (context) => ({
        v: context.v,
        kind: 'enrollment-preparation-challenge',
        context,
        signature: signature(enrollmentChallengeMessage(context)),
      }),
      receipt: (value) => ({ ...value, signature: signature(enrollmentReceiptMessage(value)) }),
    };
  }
  enrollment(core: AccountCore, operation: EnrollmentOperation, input: unknown) {
    return core.enrollment(operation, input, this.#enrollmentIssuer());
  }
  #membershipLocatorIssuer(authorize?: OperationAuthorization): MembershipLocatorIssuer {
    return {
      ...this.#deliveryIssuer(authorize),
      bootstrap: async (body) => {
        const response = parseMembershipBootstrapResponse({ ...body, signature: '00'.repeat(64) });
        const message = await membershipBootstrapMessage(response);
        if (!this.#key) throw Error('Authority closed');
        return { ...response, signature: sign(null, message, this.#key).toString('hex') };
      },
      discovery: async (body) => {
        const response = parseMembershipDiscoveryResponse({ ...body, signature: '00'.repeat(64) });
        const message = await membershipDiscoveryResponseMessage(response);
        if (!this.#key) throw Error('Authority closed');
        return { ...response, signature: sign(null, message, this.#key).toString('hex') };
      },
    };
  }
  membershipBootstrap(core: AccountCore, input: unknown) {
    return core.membershipBootstrap(input, this.#membershipLocatorIssuer());
  }
  discoverMembership(core: AccountCore, input: unknown, authorize?: OperationAuthorization) {
    return core.discoverMembership(input, this.#membershipLocatorIssuer(authorize));
  }
  ceremonyBootstrap(core: AccountCore, input: unknown) {
    return core.ceremonyBootstrap(input, {
      ...this.#deliveryIssuer(),
      bootstrap: async (body) => {
        const message = await ceremonyBootstrapMessage(body);
        if (!this.#key) throw Error('Authority closed');
        return sign(null, message, this.#key).toString('hex');
      },
    });
  }
  admitMembership(core: AccountCore, input: unknown, authorize?: OperationAuthorization) {
    return core.admitMembership(input, {
      ...this.#deliveryIssuer(authorize),
      admission: async (input) => {
        const epoch = parseMembershipAdmissionEpoch(input),
          message = await membershipAdmissionMessage(epoch);
        if (!this.#key) throw Error('Authority closed');
        return {
          v: 2,
          kind: 'membership-admission',
          epoch,
          head: await digest(message),
          signature: sign(null, message, this.#key).toString('hex'),
        };
      },
    });
  }
  relayCeremony(core: AccountCore, input: unknown, authorize?: OperationAuthorization) {
    return core.relayCeremony(input, this.#deliveryIssuer(authorize));
  }
  discoverRemoval(core: AccountCore, input: unknown, authorize?: OperationAuthorization) {
    return core.discoverRemoval(input, {
      ...this.#deliveryIssuer(authorize),
      discovery: async (input) => {
        const value = parseRemovalDiscoveryResponse({ ...input, signature: '00'.repeat(64) }),
          message = await removalDiscoveryResponseMessage(value);
        if (!this.#key) throw Error('Authority closed');
        return { ...value, signature: sign(null, message, this.#key).toString('hex') };
      },
    });
  }
  commitRotation(core: AccountCore, input: unknown, authorize?: OperationAuthorization) {
    return core.commitRotation(input, {
      ...this.#deliveryIssuer(authorize),
      outcome: async (input) => {
        const value = parseRotationOutcome({ ...input, signature: '00'.repeat(64) });
        const message = rotationOutcomeMessage(value);
        if (!this.#key) throw Error('Authority closed');
        return { ...value, signature: sign(null, message, this.#key).toString('hex') };
      },
      finalize: (seal, id, pub, value) => this.#acceptance.finalize(seal, id, pub, value),
      rotate: async (input) => {
        const epoch = parseMembershipRotationEpoch(input),
          message = await membershipRotationMessage(epoch);
        if (!this.#key) throw Error('Authority closed');
        return {
          v: 2,
          kind: 'membership-rotation',
          epoch,
          head: await digest(message),
          signature: sign(null, message, this.#key).toString('hex'),
        };
      },
    });
  }
  prepareRemoval(core: AccountCore, input: unknown, authorize?: OperationAuthorization) {
    return core.prepareRemoval(input, {
      ...this.#deliveryIssuer(authorize),
      prepare: async (input) => {
        const value = parseRemovalPreparation({ ...input, signature: '00'.repeat(64) });
        const bytes = await removalPreparationMessage(value);
        if (!this.#key) throw Error('Authority closed');
        return { ...value, signature: sign(null, bytes, this.#key).toString('hex') };
      },
    });
  }
  cancelMembership(core: AccountCore, input: unknown, authorize?: OperationAuthorization) {
    return core.cancelMembership(input, {
      ...this.#deliveryIssuer(authorize),
      cancel: async (input) => {
        const epoch = parseMembershipCancellationEpoch(input),
          message = await membershipCancellationMessage(epoch);
        if (!this.#key) throw Error('Authority closed');
        return {
          v: 2,
          kind: 'membership-cancellation',
          epoch,
          head: await digest(message),
          signature: sign(null, message, this.#key).toString('hex'),
        };
      },
    });
  }
  relayMembershipCeremony(core: AccountCore, input: unknown, authorize?: OperationAuthorization) {
    return core.relayMembershipCeremony(input, this.#deliveryIssuer(authorize));
  }
  transferMembership(core: AccountCore, input: unknown, authorize?: OperationAuthorization) {
    return core.transferMembership(input, {
      ...this.#deliveryIssuer(authorize),
      certify: async (input) => {
        const epoch = parseMembershipCertificationEpoch(input),
          message = await membershipCertificationMessage(epoch);
        if (!this.#key) throw Error('Authority closed');
        return {
          v: 2,
          kind: 'membership-certification',
          epoch,
          head: await digest(message),
          signature: sign(null, message, this.#key).toString('hex'),
        };
      },
    });
  }
  transferContent(core: AccountCore, input: unknown, authorize?: OperationAuthorization) {
    return core.transferContent(input, {
      ...this.#deliveryIssuer(authorize),
      certify: async (input) => {
        const epoch = parseCertificationEpoch(input),
          message = await certificationEpochMessage(epoch),
          head = await digest(message);
        if (!this.#key) throw Error('Authority closed');
        return {
          v: 1,
          kind: 'device-certification-successor',
          epoch,
          head,
          signature: sign(null, message, this.#key).toString('hex'),
        };
      },
    });
  }
  discoverAuthority(core: AccountCore, input: unknown, authorize?: OperationAuthorization) {
    return core.discoverAuthority(input, {
      ...this.#deliveryIssuer(authorize),
      discovery: async (value) => {
        const body = parseDiscoveryResponse({ ...value, signature: '00'.repeat(64) });
        const message = await discoveryResponseMessage(body);
        if (!this.#key) throw Error('Authority closed');
        return { ...body, signature: sign(null, message, this.#key).toString('hex') };
      },
    });
  }
  admitPrepared(core: AccountCore, input: unknown, authorize?: OperationAuthorization) {
    return core.admitPrepared(input, {
      ...this.#deliveryIssuer(authorize),
      ...this.#enrollmentIssuer(),
      successor: async (input) => {
        const epoch = parseSuccessorEpoch(input),
          message = await successorMessage(epoch),
          head = await digest(message);
        if (!this.#key) throw Error('Authority closed');
        return {
          v: 1,
          kind: 'device-admission-successor',
          epoch,
          head,
          signature: sign(null, message, this.#key).toString('hex'),
        };
      },
    });
  }
  beginGrant(core: AccountCore, accessToken: unknown, scope: unknown) {
    return core.grants.begin(accessToken, scope, this.#deliveryIssuer());
  }
  #deliveryIssuer(authorize?: OperationAuthorization): ReadIssuer & InboundReadIssuer {
    if (!this.#key) throw Error('Authority closed');
    return {
      pin: { ...this.#pin },
      check: (seal, id, pub) => this.#acceptance.check(seal, id, pub),
      authorize,
      issue: (seal, id, pub, response) => this.#acceptance.issue(seal, id, pub, response),
      witness: (seal, id, pub, scope, value) =>
        this.#acceptance.witness(seal, id, pub, scope, value),
      page: (seal: unknown, id: string, pub: string, value: ReadPage) =>
        this.#acceptance.page(seal, id, pub, value),
      inboundPage: (seal: unknown, id: string, pub: string, value: ReadPage) =>
        this.#acceptance.inboundPage(seal, id, pub, value),
    };
  }
  decideSubmission(core: AccountCore, input: unknown, authorize?: OperationAuthorization) {
    return core.decideSubmission(input, this.#deliveryIssuer(authorize));
  }
  readAccepted(core: AccountCore, input: unknown, authorize?: OperationAuthorization) {
    return core.readAccepted(input, this.#deliveryIssuer(authorize));
  }
  exchangeHistoryCheckpoint(core: AccountCore, input: unknown, authorize?: OperationAuthorization) {
    return core.exchangeHistoryCheckpoint(input, {
      ...this.#deliveryIssuer(authorize),
      pruneSign: async (bytes) => {
        if (!this.#key) throw Error('Authority closed');
        return sign(null, bytes, this.#key).toString('hex');
      },
      catalog: async (value) => {
        const message = await historyCatalogMessage(value);
        if (!this.#key) throw Error('Authority closed');
        return { ...value, signature: sign(null, message, this.#key).toString('hex') };
      },
      historyPage: async (value) => {
        const message = await historyCheckpointPageMessage(value);
        if (!this.#key) throw Error('Authority closed');
        return { ...value, signature: sign(null, message, this.#key).toString('hex') };
      },
    });
  }
  exchangeCheckpoint(core: AccountCore, input: unknown, authorize?: OperationAuthorization) {
    return core.exchangeCheckpoint(input, this.#deliveryIssuer(authorize));
  }
  readMembershipCheckpoint(core: AccountCore, input: unknown, authorize?: OperationAuthorization) {
    return core.readMembershipCheckpoint(input, this.#deliveryIssuer(authorize));
  }
  exchangeReplacementCheckpoint(
    core: AccountCore,
    input: unknown,
    authorize?: OperationAuthorization,
  ) {
    return core.exchangeReplacementCheckpoint(input, {
      ...this.#deliveryIssuer(authorize),
      bind: this.#issuer().bind,
    });
  }
  readInbound(
    core: AccountCore,
    input: unknown,
    authorize?: OperationAuthorization,
    reuse?: InboundAuthorityReuse,
  ) {
    return core.readInbound(input, this.#deliveryIssuer(authorize), reuse);
  }
  close(): void {
    this.#key = null;
    this.#acceptance.close();
  }
}
