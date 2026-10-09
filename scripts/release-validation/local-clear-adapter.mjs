/** Explicit binding for the Local clear catalogue; no whole-protocol qualification. */
import { carrierSelection, carrierStage, reconcileCarrier } from './carrier-adapter.mjs';
export const localClearSelection = (root, args = []) => carrierSelection('local-clear', root, args);
export const localClearStage = (root, args = [], id = 'local-clear:full') =>
  carrierStage('local-clear', root, args, id);
export const reconcileLocalClear = (selection, actual, context) =>
  reconcileCarrier('local-clear', selection, actual, context);
