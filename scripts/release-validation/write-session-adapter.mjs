/** Explicit binding for the Write-session catalogue; no whole-protocol qualification. */
import { carrierSelection, carrierStage, reconcileCarrier } from './carrier-adapter.mjs';
export const writeSessionSelection = (root, args = []) =>
  carrierSelection('write-session', root, args);
export const writeSessionStage = (root, args = [], id = 'write-session:full') =>
  carrierStage('write-session', root, args, id);
export const reconcileWriteSession = (selection, actual, context) =>
  reconcileCarrier('write-session', selection, actual, context);
