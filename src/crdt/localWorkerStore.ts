/** Retained Local Worker carrier. No application doc or command/Undo owner is constructed here. */
import { accountWorkerRuntime } from './accountWorkerRuntime';
import { openLocalWorkerJournalSession } from './custody';
import {
  captureStartupAuthority,
  classifyUnderPermit,
  type StartupAuthority,
  type ClassifiedWorkspace,
} from './startupClassification';
import { startupRefusal } from './ownedStartup';
import type { WorkspaceOptions } from './admittedWorkspace';

export async function openOwnedLocalWorkerJournal(
  input: StartupAuthority,
  code: string,
  options: WorkspaceOptions,
) {
  const runtime = accountWorkerRuntime(input.slotId);
  if (runtime?.kind !== 'local') throw Error('Local Worker native lifetime required');
  const authority = captureStartupAuthority(input),
    signal = options.signal;
  let classified!: ClassifiedWorkspace,
    owned: Awaited<ReturnType<typeof openLocalWorkerJournalSession>> | undefined;
  try {
    owned = await openLocalWorkerJournalSession(
      {
        slotId: authority.slotId,
        workspaceId: authority.workspaceId,
        resolvePrincipal: async (task) => {
          classified = await classifyUnderPermit(task, {
            ...authority,
            resolveIdentity: async (task, slot) => {
              const identity = await authority.resolveIdentity(task, slot);
              if (identity.kind !== 'local') throw Error('Local classification required');
              return identity;
            },
          });
          return classified.scope.principalId;
        },
      },
      code,
      signal ? { signal } : {},
    );
    runtime.assertCurrent();
    if (signal?.aborted || owned.journal.state !== 'active')
      throw Error('Local Worker opening ended');
    return { kind: 'ready' as const, ...classified, ...owned };
  } catch (cause) {
    await owned?.journal.close();
    return startupRefusal(cause, signal);
  }
}
