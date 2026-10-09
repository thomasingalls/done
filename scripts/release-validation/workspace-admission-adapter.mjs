/** Explicit binding for the workspace command catalogue; no whole-workspace qualification. */
import { carrierSelection, carrierStage, reconcileCarrier } from './carrier-adapter.mjs';
export const workspaceAdmissionSelection = (root, args = []) =>
  carrierSelection('workspace-admission', root, args);
export const workspaceAdmissionStage = (root, args = [], id = 'workspace-admission:full') =>
  carrierStage('workspace-admission', root, args, id);
export const reconcileWorkspaceAdmission = (selection, actual, context) =>
  reconcileCarrier('workspace-admission', selection, actual, context);
