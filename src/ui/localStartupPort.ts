/** UI orchestration port. It carries observations/commands, never a storage permit or private key. */
import type {
  LocalGenesisEnrollment,
  listLocalWorkspaces,
  resumeLocalGenesis,
} from '../crdt/localGenesis';
import type { StartupDisposition } from '../crdt/startupState';
import type { AdmittedWorkspace, WorkspaceOptions } from '../crdt/admittedWorkspace';
export interface LocalStartupRuntime {
  inspect(): Promise<StartupDisposition>;
  begin(automatic?: boolean): LocalGenesisEnrollment | Promise<LocalGenesisEnrollment>;
  list(code: string): ReturnType<typeof listLocalWorkspaces>;
  automaticCode(): Promise<string | null>;
  resume(code: string): ReturnType<typeof resumeLocalGenesis>;
  protect(code: string): Promise<void>;
  open(
    code: string,
    identity: WorkspaceOptions['identity'],
  ): Promise<StartupDisposition | { kind: 'ready'; workspace: AdmittedWorkspace }>;
  close(): Promise<void>;
}
export type LocalStartupRuntimeFactory = (
  slotId: string,
  options: { signal: AbortSignal },
) => LocalStartupRuntime;
