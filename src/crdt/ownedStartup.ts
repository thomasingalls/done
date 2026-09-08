/** Own retained-workspace startup from scoped classification through admitted initialization. */
import { openWriteSession } from './writeSession';
import {
  openAdmittedWorkspace,
  type AdmittedWorkspace,
  type WorkspaceOptions,
} from './admittedWorkspace';
import {
  classifyUnderPermit,
  captureStartupAuthority,
  type StartupAuthority,
  type ClassifiedWorkspace,
} from './startupClassification';
import { StartupError, type StartupDisposition } from './startupState';
export type { StartupAuthority, StartupIdentity } from './startupClassification';
export type { StartupDisposition, StartupKind } from './startupState';

export const startupRefusal = (cause: unknown, signal?: AbortSignal): StartupDisposition => {
  if (signal?.aborted || (cause instanceof DOMException && cause.name === 'AbortError'))
    return Object.freeze({ kind: 'cancelled', reason: 'startup-cancelled' });
  if (cause instanceof StartupError) return cause.disposition;
  const code = (cause as { code?: unknown } | null)?.code;
  if (code === 'cancelled' || code === 'inactive' || code === 'inactive-session')
    return Object.freeze({ kind: 'cancelled', reason: 'startup-session-ended' });
  if (code === 'unsupported')
    return Object.freeze({ kind: 'unsupported', reason: 'writer-lifetime-unavailable' });
  if (code === 'unlock-failed' || code === 'confirmation-required')
    return Object.freeze({ kind: 'unlock-failed', reason: 'factor-wrong-or-seal-damaged' });
  if (code === 'migration-required')
    return Object.freeze({ kind: 'migration-required', reason: 'custody-migration-required' });
  if (code === 'creation-pending')
    return Object.freeze({ kind: 'creation-pending', reason: 'retained-creation-incomplete' });
  if (['repair-required', 'missing-custody', 'missing-content'].includes(String(code)))
    return Object.freeze({
      kind: 'repair-required',
      reason: 'persisted-material-unreadable-or-missing',
    });
  return Object.freeze({ kind: 'unavailable', reason: 'startup-did-not-complete' });
};

/** Read-only, unauthenticated preflight for presentation. Open always rereads under its own lifetime. */
export const inspectWorkspaceStartup = async (
  input: StartupAuthority,
  options: { signal?: AbortSignal } = {},
): Promise<StartupDisposition> => {
  const authority = captureStartupAuthority(input);
  const captured = { ...options };
  let session;
  try {
    session = await openWriteSession(authority.slotId, captured);
    await session.run((task) => classifyUnderPermit(task, authority));
    return Object.freeze({
      kind: 'unlock-required',
      reason: 'retained-carriers-need-authenticated-replay',
    });
  } catch (cause) {
    return startupRefusal(cause, captured.signal);
  } finally {
    await session?.close();
  }
};

export type WorkspaceStartupResult =
  | StartupDisposition
  | ({
      readonly kind: 'ready';
      readonly workspace: AdmittedWorkspace;
    } & ClassifiedWorkspace);

export const openOwnedWorkspace = async (
  input: StartupAuthority,
  code: string,
  options: WorkspaceOptions,
): Promise<WorkspaceStartupResult> => {
  const authority = captureStartupAuthority(input);
  const captured = { ...options, identity: structuredClone(options.identity) };
  let classified!: ClassifiedWorkspace;
  try {
    const workspace = await openAdmittedWorkspace(
      {
        slotId: authority.slotId,
        workspaceId: authority.workspaceId,
        // This executes inside the carrier's one shared lifetime, before any custody read or key selection.
        resolvePrincipal: async (task) => {
          classified = await classifyUnderPermit(task, authority);
          return classified.scope.principalId;
        },
      },
      code,
      captured,
    );
    if (captured.signal?.aborted || workspace.status.state !== 'active') {
      await workspace.close();
      return Object.freeze({ kind: 'cancelled', reason: 'startup-session-ended' });
    }
    return Object.freeze({ kind: 'ready', ...classified, workspace });
  } catch (cause) {
    return startupRefusal(cause, captured.signal);
  }
};
