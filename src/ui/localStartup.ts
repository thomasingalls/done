import { defaultDeviceName } from '../lib/browser';
/** Application lifetime for one Local slot. Dispositions never authorize creation or replacement. */
import {
  beginLocalGenesis,
  inspectLocalStartup,
  listLocalWorkspaces,
  openLocalWorkspace,
  resumeLocalGenesis,
  type LocalGenesisEnrollment,
} from '../crdt/localGenesis';
import { startupRefusal } from '../crdt/ownedStartup';
import type { StartupDisposition } from '../crdt/startupState';
import type { AdmittedWorkspace } from '../crdt/admittedWorkspace';
import { automaticCode } from '../crdt/automaticOpening';
import { readLocalClaim } from '../crdt/localGenesisRecord';
import { openWriteSession } from '../crdt/writeSession';
import { protectLocalWorkspace } from '../crdt/localProtection';

// The first Local workspace has one explicit slot. No native database-name discovery or legacy fallback.
export const LOCAL_APP_SLOT = 'local';
export type LocalStartupState =
  | StartupDisposition
  | { readonly kind: 'checking' | 'working' | 'closing' }
  | { readonly kind: 'save-code'; readonly code: string }
  | { readonly kind: 'confirm-code'; readonly error: string | null }
  | {
      readonly kind: 'ready';
      readonly workspace: AdmittedWorkspace;
      readonly actorId: string;
      readonly automatic: boolean;
    };

export const createLocalStartup = (automaticFirstRun = false) => {
  const lifetime = new AbortController();
  const listeners = new Set<() => void>();
  const editors = new Set<() => void>();
  const retireEditors = () => {
    for (const destroy of [...editors]) {
      try {
        destroy();
      } catch {
        /* A failed view teardown must not retain the storage owner. */
      }
    }
    editors.clear();
  };
  let state: LocalStartupState = { kind: 'checking' };
  let ceremony: LocalGenesisEnrollment | undefined;
  let workspace: AdmittedWorkspace | undefined;
  let unsubscribe: (() => void) | undefined;
  let operation: Promise<void> | undefined;
  let closing: Promise<void> | undefined;
  let closed = false;
  let liveCode = '';
  const publish = (next: LocalStartupState) => {
    state = next;
    for (const listener of listeners) listener();
  };
  const options = { signal: lifetime.signal };

  const close = (): Promise<void> => {
    if (closing) return closing;
    closed = true;
    liveCode = '';
    retireEditors();
    const pending = operation;
    // Install this before notifying subscribers; also drain any opener which resolves after abort.
    closing = Promise.resolve().then(async () => {
      await pending;
      const owned = workspace;
      workspace = undefined;
      await owned?.close();
    });
    unsubscribe?.();
    unsubscribe = undefined;
    ceremony?.cancel();
    ceremony = undefined;
    lifetime.abort();
    publish({ kind: 'closing' });
    return closing;
  };
  const run = (task: () => Promise<void>): Promise<void> => {
    if (closed || operation) return Promise.resolve();
    operation = Promise.resolve()
      .then(task)
      .catch((cause: unknown) => {
        if (!closed) publish(startupRefusal(cause, lifetime.signal));
      })
      .finally(() => {
        operation = undefined;
      });
    publish({ kind: 'working' });
    return operation;
  };
  const open = async (code: string, automatic = false) => {
    // Verify routing with the factor before choosing the local actor. The opener verifies it again.
    const routes = await listLocalWorkspaces(LOCAL_APP_SLOT, code, options);
    if (closed) return;
    if (routes.length !== 1 || !routes[0]) throw Error('Expected one verified Local workspace.');
    const principal = routes[0].principal;
    const result = await openLocalWorkspace(LOCAL_APP_SLOT, code, {
      ...options,
      // This Local-only label is scoped by the verified principal, not an Account/device credential.
      identity: {
        id: principal,
        actor: { kind: 'human', name: 'You', color: '#e0662f' },
        device: { id: `local:${principal}`, name: defaultDeviceName() },
      },
      validateReceive: () => {
        throw Error('Network delivery is not enabled for this Local session.');
      },
    });
    if (result.kind !== 'ready') {
      if (!closed) publish(result);
      return;
    }
    workspace = result.workspace;
    if (closed) return; // close() is waiting for this operation and will dispose the late owner.
    const owned = workspace;
    try {
      unsubscribe = owned.onStatus((status) => {
        if (
          closed ||
          (['active', 'blocked'].includes(status.state) &&
            status.pressure?.code !== 'repair-required')
        )
          return;
        // Retire visible plaintext immediately when the carrier loses its active lifetime.
        unsubscribe?.();
        unsubscribe = undefined;
        retireEditors();
        liveCode = '';
        publish(startupRefusal(status.pressure ?? { code: 'inactive' }));
        void owned.close().catch(() => {
          if (!closed) publish({ kind: 'unavailable', reason: 'local-close-failed' });
        });
      });
      liveCode = code;
      publish({ kind: 'ready', workspace: owned, actorId: principal, automatic });
    } catch (cause) {
      unsubscribe?.();
      unsubscribe = undefined;
      await owned.close();
      workspace = undefined;
      throw cause;
    }
  };

  return {
    registerEditor(destroy: () => void) {
      if (closed || state.kind !== 'ready') {
        destroy();
        return () => {};
      }
      editors.add(destroy);
      return () => {
        editors.delete(destroy);
      };
    },
    getSnapshot: () => state,
    visit(step: string): boolean {
      if (
        closed ||
        operation ||
        !ceremony?.displayCode ||
        !['fresh', 'save-code', 'confirm-code'].includes(state.kind)
      )
        return false;
      if (step === 'fresh') publish({ kind: 'fresh', reason: 'not-created' });
      else if (step === 'save-code') publish({ kind: 'save-code', code: ceremony.displayCode });
      else if (step === 'confirm-code') publish({ kind: 'confirm-code', error: null });
      else return false;
      return true;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    inspect: () =>
      state.kind !== 'checking'
        ? Promise.resolve()
        : run(async () => {
            let next = await inspectLocalStartup(LOCAL_APP_SLOT, options);
            if (closed) return;
            if (automaticFirstRun && next.kind === 'fresh') {
              const fresh = beginLocalGenesis(LOCAL_APP_SLOT, { ...options, automatic: true });
              const code = fresh.displayCode!;
              try {
                await fresh.confirm(code);
                if (!closed) await open(code, true);
                return;
              } catch (cause) {
                if (startupRefusal(cause).kind !== 'unlock-required') throw cause;
                next = await inspectLocalStartup(LOCAL_APP_SLOT, options);
              }
            }
            if (
              automaticFirstRun &&
              ['unlock-required', 'creation-pending'].includes(next.kind) &&
              next.reason !== 'local-protection-needs-unlock-code'
            ) {
              const session = await openWriteSession(LOCAL_APP_SLOT, options);
              let code: string | null;
              try {
                code = await session.run(async (task) => {
                  const claim = await readLocalClaim(task, LOCAL_APP_SLOT);
                  return claim ? automaticCode(task, claim) : null;
                });
              } finally {
                await session.close();
              }
              if (code) {
                if (next.kind === 'creation-pending')
                  await resumeLocalGenesis(LOCAL_APP_SLOT, code, options);
                if (!closed) await open(code, true);
                return;
              }
            }
            publish(next);
          }),
    begin() {
      if (closed || operation || state.kind !== 'fresh') return;
      try {
        ceremony ??= beginLocalGenesis(LOCAL_APP_SLOT, options);
        const code = ceremony.displayCode;
        if (!code) throw Error('Local ceremony could not start.');
        publish({ kind: 'save-code', code });
      } catch (cause) {
        publish(startupRefusal(cause));
      }
    },
    saved() {
      if (!closed && state.kind === 'save-code') publish({ kind: 'confirm-code', error: null });
    },
    confirm(input: string) {
      if (closed || operation || state.kind !== 'confirm-code' || !ceremony)
        return Promise.resolve();
      return run(async () => {
        try {
          await ceremony!.confirm(input);
          ceremony = undefined;
          if (!closed) await open(input);
        } catch (cause) {
          if (
            !closed &&
            ceremony?.displayCode &&
            (cause as { code?: string })?.code === 'confirmation-required'
          )
            publish({
              kind: 'confirm-code',
              error: 'That code does not match. Enter the code you saved.',
            });
          else {
            ceremony?.cancel();
            ceremony = undefined;
            throw cause;
          }
        } finally {
          input = '';
        }
      });
    },
    unlock(input: string) {
      if (
        closed ||
        operation ||
        !['unlock-required', 'unlock-failed', 'creation-pending'].includes(state.kind)
      )
        return Promise.resolve();
      return run(async () => {
        try {
          const current = await inspectLocalStartup(LOCAL_APP_SLOT, options);
          if (closed) return;
          if (current.reason === 'local-protection-needs-unlock-code')
            await protectLocalWorkspace(LOCAL_APP_SLOT, input, options);
          else if (current.kind === 'creation-pending')
            await resumeLocalGenesis(LOCAL_APP_SLOT, input, options);
          else if (current.kind !== 'unlock-required') {
            publish(current);
            return;
          }
          if (!closed) await open(input);
        } finally {
          input = '';
        }
      });
    },
    protect(input: string) {
      if (state.kind !== 'ready' || !state.automatic || operation || closed)
        return Promise.resolve();
      return run(async () => {
        retireEditors();
        unsubscribe?.();
        unsubscribe = undefined;
        await workspace?.whenDurable();
        await workspace?.close();
        workspace = undefined;
        liveCode = '';
        try {
          await protectLocalWorkspace(LOCAL_APP_SLOT, input, options);
          if (!closed) await open(input);
        } catch (cause) {
          const disposition = await inspectLocalStartup(LOCAL_APP_SLOT, options);
          if (!closed && disposition.reason === 'local-protection-needs-unlock-code')
            publish(disposition);
          else throw cause;
        } finally {
          input = '';
        }
      });
    },
    /** One live, verified handoff into explicit sync setup. Never stored or used on a cold visit. */
    takeSyncCode() {
      if (state.kind !== 'ready' || state.automatic || workspace?.status.state !== 'active')
        throw Error('Protect and open this workspace first');
      const code = liveCode;
      liveCode = '';
      return code;
    },
    close,
  };
};
export type LocalStartup = ReturnType<typeof createLocalStartup>;
