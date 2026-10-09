/** Private first Account editor. All capabilities remain attached to one exclusive slot lifetime. */
import { captureAccountOptions, type AccountStartupOptions } from './accountStartup';
import { openAccountJournalSession } from './accountJournal';
import { createAdmissionOwner } from './admissionQueue';
import { createAdmittedWorkspace, type WorkspaceOptions } from './admittedWorkspace';

export interface AccountWorkspaceOptions extends AccountStartupOptions {
  identity: WorkspaceOptions['identity'];
  today?: WorkspaceOptions['today'];
}
export async function openOwnedAccountWorkspace(input: AccountWorkspaceOptions) {
  const options = {
    ...captureAccountOptions(input),
    identity: structuredClone(input.identity),
    today: input.today,
  };
  const refuseReceive = () => {
    throw Error('Account relay receiver is not configured');
  };
  const { account, carrier, devices } = await openAccountJournalSession(
    options,
    options.identity.id,
  );
  try {
    const workspace = await createAdmittedWorkspace(
      (config) => createAdmissionOwner(carrier, config),
      {
        identity: options.identity,
        validateReceive: refuseReceive,
        ...(options.today ? { today: options.today } : {}),
        ...(options.signal ? { signal: options.signal } : {}),
      },
    );
    if (options.signal?.aborted || workspace.status.state !== 'active') {
      await workspace.close();
      throw Error('Account opening was cancelled');
    }
    return Object.freeze({
      ...account,
      kind: 'ready' as const,
      devices,
      workspace,
      compactContent: async () => {
        await workspace.whenDurable();
        return carrier.compactContent();
      },
    });
  } catch (cause) {
    await carrier.close();
    throw cause;
  }
}
