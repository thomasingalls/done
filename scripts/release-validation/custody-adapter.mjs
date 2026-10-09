/** Explicit binding for the Custody catalogue; no whole-protocol qualification. */
import { carrierSelection, carrierStage, reconcileCarrier } from './carrier-adapter.mjs';
export const custodySelection = (root, args = []) => carrierSelection('custody', root, args);
export const custodyStage = (root, args = [], id = 'custody:full') =>
  carrierStage('custody', root, args, id);
export const reconcileCustody = (selection, actual, context) =>
  reconcileCarrier('custody', selection, actual, context);
