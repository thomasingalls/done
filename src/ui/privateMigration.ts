/** Operator-assisted development utility. Browser observations do not prove old-writer exclusion. */
import { createLegacyCoordinator, type MigrationInspection } from '../crdt/legacyCoordinator';
import { replayLegacyExport, type LegacyExportCapture } from '../crdt/legacyExport';
import { IMPORT_POLICY, type LegacyImportInput } from '../crdt/legacyImportPlan';
import { LOCAL_APP_SLOT } from './localStartup';

const MAX_PACKET = 64 * 1024 * 1024;
const MAX_BINDING = 16 * 1024;
const BINDING_KIND = 'done-private-migration-binding';
export interface SavedFile {
  readonly size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}
export interface PrivateMigrationState {
  readonly phase:
    | 'host'
    | 'files'
    | 'captured'
    | 'verified'
    | 'save-code'
    | 'confirm-code'
    | 'authenticated'
    | 'closed';
  readonly busy: boolean;
  readonly error: string;
  readonly inspection: MigrationInspection | null;
  readonly code: string | null;
  readonly entries: readonly { path: string; content: string }[];
}
const fail = (reason: string): never => {
  throw new Error(reason);
};
export const checkMigrationBrowser = async () => {
  if (!globalThis.isSecureContext || !navigator.locks || !crypto.subtle)
    fail('Use a secure development origin with Web Locks and WebCrypto.');
  if (
    navigator.serviceWorker &&
    (navigator.serviceWorker.controller ||
      (await navigator.serviceWorker.getRegistrations()).length)
  )
    fail(
      'A service worker is still present. Retire the old application worker before continuing; keep site data.',
    );
};

export const createPrivateMigration = (
  dependencies: {
    coordinator?: ReturnType<typeof createLegacyCoordinator>;
    checkBrowser?: () => Promise<void>;
    origin?: string;
  } = {},
) => {
  const owner = dependencies.coordinator ?? createLegacyCoordinator(LOCAL_APP_SLOT);
  const checkBrowser = dependencies.checkBrowser ?? checkMigrationBrowser;
  const origin = dependencies.origin ?? location.origin;
  let state: PrivateMigrationState = {
    phase: 'host',
    busy: false,
    error: '',
    inspection: null,
    code: null,
    entries: [],
  };
  const listeners = new Set<() => void>();
  let stopped = false,
    operation: Promise<void> | undefined,
    closing: Promise<void> | undefined;
  let capture: LegacyExportCapture | undefined, input: LegacyImportInput | undefined;
  let ceremony: ReturnType<typeof owner.enroll> | undefined, factor: string | undefined;
  const guard = () => {
    if (stopped) fail('Migration page is closed.');
  };
  const publish = (patch: Partial<PrivateMigrationState>) => {
    if (stopped) return;
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };
  const eraseCapture = () => {
    capture?.recovery.fill(0);
    capture?.markdown.fill(0);
    capture = undefined;
  };
  const run = (task: () => Promise<void>): Promise<void> => {
    if (stopped || operation) return Promise.resolve();
    operation = Promise.resolve()
      .then(async () => {
        await checkBrowser();
        guard();
        await task();
      })
      .catch((cause: unknown) => {
        const error = cause as { reason?: string; code?: string; message?: string };
        publish({
          error: String(
            error.reason ?? error.code ?? error.message ?? 'Migration operation failed.',
          ).slice(0, 240),
        });
      })
      .finally(() => {
        operation = undefined;
        publish({ busy: false });
      });
    publish({ busy: true, error: '' });
    return operation;
  };
  const inspect = async () => {
    const inspection = await owner.inspect(factor, input);
    guard();
    publish({ inspection });
    return inspection;
  };
  const close = (): Promise<void> => {
    if (closing) return closing;
    stopped = true;
    const pending = operation;
    closing = Promise.resolve().then(async () => {
      await Promise.allSettled([pending, owner.close()]);
      eraseCapture();
      input?.recovery.fill(0);
      input = undefined;
      factor = undefined;
    });
    ceremony?.cancel();
    ceremony = undefined;
    state = { phase: 'closed', busy: false, error: '', inspection: null, code: null, entries: [] };
    for (const listener of listeners) listener();
    return closing;
  };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    close,
    acknowledgeHost() {
      if (state.phase !== 'host') return Promise.resolve();
      return run(async () => {
        await inspect();
        publish({ phase: 'files' });
      });
    },
    capture() {
      if (state.phase !== 'files' || state.inspection?.kind !== 'unused') return Promise.resolve();
      return run(async () => {
        const result = await owner.capture();
        if (stopped) {
          result.recovery.fill(0);
          result.markdown.fill(0);
          return;
        }
        eraseCapture();
        capture = result;
        publish({ phase: 'captured' });
      });
    },
    download(which: 'recovery' | 'binding' | 'markdown') {
      guard();
      if (!capture || state.phase !== 'captured') return fail('Capture is unavailable.');
      if (which === 'binding')
        return new TextEncoder().encode(
          JSON.stringify(
            {
              kind: BINDING_KIND,
              v: 1,
              policy: IMPORT_POLICY,
              sourceOrigin: origin,
              sourceDigest: capture.sourceDigest,
              recoveryDigest: capture.recoveryDigest,
            },
            null,
            2,
          ) + '\n',
        );
      return capture[which].slice();
    },
    load(packet: SavedFile, binding: SavedFile) {
      if (!['files', 'verified', 'authenticated'].includes(state.phase)) return Promise.resolve();
      return run(async () => {
        factor = undefined;
        input?.recovery.fill(0);
        input = undefined;
        publish({ phase: 'files', entries: [], code: null });
        if (packet.size > MAX_PACKET || binding.size > MAX_BINDING)
          fail('Recovery file is too large.');
        let bytes: Uint8Array<ArrayBuffer> | undefined;
        let bindingBytes: Uint8Array<ArrayBuffer> | undefined;
        try {
          bytes = new Uint8Array(await packet.arrayBuffer());
          guard();
          bindingBytes = new Uint8Array(await binding.arrayBuffer());
          guard();
          if (bytes.length > MAX_PACKET || bindingBytes.length > MAX_BINDING)
            fail('Recovery file is too large.');
          const saved = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bindingBytes));
          if (
            !saved ||
            Object.keys(saved).sort().join(',') !==
              'kind,policy,recoveryDigest,sourceDigest,sourceOrigin,v' ||
            saved.kind !== BINDING_KIND ||
            saved.v !== 1 ||
            saved.policy !== IMPORT_POLICY ||
            saved.sourceOrigin !== origin ||
            !/^[a-f0-9]{64}$/.test(saved.sourceDigest) ||
            !/^[a-f0-9]{64}$/.test(saved.recoveryDigest)
          )
            fail('Saved binding does not match this source origin and policy.');
          const replay = await replayLegacyExport(bytes, saved.recoveryDigest);
          guard();
          if (replay.origin !== saved.sourceOrigin || replay.sourceDigest !== saved.sourceDigest)
            fail('Recovery packet and saved binding disagree.');
          const candidate: LegacyImportInput = {
            recovery: bytes,
            recoveryDigest: saved.recoveryDigest,
            sourceDigest: saved.sourceDigest,
            sourceOrigin: saved.sourceOrigin,
            policy: IMPORT_POLICY,
          };
          const inspection = await owner.inspect(undefined, candidate);
          guard();
          input = candidate;
          bytes = undefined;
          publish({ phase: 'verified', inspection, entries: replay.entries });
        } finally {
          bytes?.fill(0);
          bindingBytes?.fill(0);
        }
      });
    },
    enroll() {
      if (state.phase !== 'verified' || !input || state.inspection?.kind !== 'unused')
        return Promise.resolve();
      return run(async () => {
        if ((await inspect()).kind !== 'unused')
          fail('A retained migration must be resumed with its original code.');
        ceremony = owner.enroll(input!, 8);
        publish({ phase: 'save-code', code: ceremony.displayCode });
      });
    },
    savedCode() {
      if (!operation && state.phase === 'save-code') publish({ phase: 'confirm-code', code: null });
    },
    confirm(code: string) {
      if (state.phase !== 'confirm-code' || !ceremony || !input) return Promise.resolve();
      return run(async () => {
        try {
          await ceremony!.confirm(code);
          guard();
          factor = code;
          await inspect();
          publish({ phase: 'authenticated' });
        } catch (error) {
          // An aborted confirmation can leave durable intent. Reinspect, never mint a replacement.
          factor = undefined;
          await inspect();
          publish({ phase: 'verified' });
          throw error;
        } finally {
          ceremony?.cancel();
          ceremony = undefined;
          code = '';
        }
      });
    },
    unlock(code: string) {
      if (state.phase !== 'verified' || !input) return Promise.resolve();
      return run(async () => {
        try {
          const inspection = await owner.inspect(code, input);
          guard();
          if (inspection.kind !== 'import' && inspection.kind !== 'selected')
            fail('No retained migration can be unlocked here.');
          factor = code;
          publish({ phase: 'authenticated', inspection });
        } finally {
          code = '';
        }
      });
    },
    advance(action: 'import' | 'select' | 'cleanup') {
      if (state.phase !== 'authenticated' || !factor || !input) return Promise.resolve();
      return run(async () => {
        try {
          await owner.advance(action, factor!, input, { maxSlices: 8 });
        } finally {
          if (!stopped) await inspect();
        }
      });
    },
  };
};
export type PrivateMigration = ReturnType<typeof createPrivateMigration>;
