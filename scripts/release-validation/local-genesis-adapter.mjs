/** Explicit binding for the Local-genesis catalogue; no whole-genesis qualification. */
import { carrierSelection, carrierStage, reconcileCarrier } from './carrier-adapter.mjs';
export const localGenesisSelection = (root, args = []) =>
  carrierSelection('local-genesis', root, args);
export const localGenesisStage = (root, args = [], id = 'local-genesis:full') =>
  carrierStage('local-genesis', root, args, id);
export const reconcileLocalGenesis = (selection, actual, context) =>
  reconcileCarrier('local-genesis', selection, actual, context);
