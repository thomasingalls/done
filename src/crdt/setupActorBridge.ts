/** Display-name effects on the actual canonical Window workspace, admitted synchronously. */
import { displayName } from '../account/setupProgress';
import {
  requireWindowAccountMirrorController,
  type createWindowAccountMirrorController,
} from './windowAccountMirror';
import type { WindowAccountCohort } from './accountWorkerCohort';
import { workspaceQueueFields } from './workerWorkspaceQueues';
export function createWindowSetupActorBridge(
  controller: Awaited<ReturnType<typeof createWindowAccountMirrorController>>,
  cohort: WindowAccountCohort,
  actorId: string,
) {
  const current = () => {
    requireWindowAccountMirrorController(controller, cohort);
    cohort.write(() => {});
  };
  current();
  const fields = (input: unknown, names: string[]) => {
    current();
    workspaceQueueFields(input, names);
    if ((input as { actorId: string }).actorId !== actorId) throw Error('Setup actor changed');
  };
  return Object.freeze({
    actorName(input: unknown) {
      fields(input, ['actorId']);
      return controller.workspace.read().actors.find((actor) => actor.id === actorId)?.name;
    },
    async rename(input: unknown) {
      fields(input, ['actorId', 'name']);
      const raw = (input as { name: unknown }).name,
        name = displayName(raw);
      if (!name || name !== raw) throw Error('Invalid setup name');
      await controller.workspace.command({ kind: 'actor', patch: { name } }).accepted;
      current();
      await controller.workspace.whenDurable();
      current();
    },
  });
}
