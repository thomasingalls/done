/** Explicit original Page adapter retained for compatibility controls until worker activation. */
import {
  beginLocalGenesis,
  inspectLocalStartup,
  listLocalWorkspaces,
  openLocalWorkspace,
  resumeLocalGenesis,
} from '../crdt/localGenesis';
import { automaticCode } from '../crdt/automaticOpening';
import { readLocalClaim } from '../crdt/localGenesisRecord';
import { openWriteSession } from '../crdt/writeSession';
import { protectLocalWorkspace } from '../crdt/localProtection';
import type { LocalStartupRuntimeFactory } from './localStartupPort';
export const createPageLocalStartupRuntime: LocalStartupRuntimeFactory = (slotId, options) => ({
  inspect: () => inspectLocalStartup(slotId, options),
  begin: (automatic = false) => beginLocalGenesis(slotId, { ...options, automatic }),
  list: (code) => listLocalWorkspaces(slotId, code, options),
  resume: (code) => resumeLocalGenesis(slotId, code, options),
  protect: (code) => protectLocalWorkspace(slotId, code, options),
  async automaticCode() {
    const session = await openWriteSession(slotId, options);
    try {
      return await session.run(async (task) => {
        const claim = await readLocalClaim(task, slotId);
        return claim ? automaticCode(task, claim) : null;
      });
    } finally {
      await session.close();
    }
  },
  open: (code, identity) =>
    openLocalWorkspace(slotId, code, {
      ...options,
      identity,
      validateReceive: () => {
        throw Error('Network delivery is not enabled for this Local session.');
      },
    }),
  close: async () => {},
});
