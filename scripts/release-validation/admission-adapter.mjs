/** Explicit admission catalogue binding; other families are not credited by this adapter. */
import { carrierSelection, carrierStage, reconcileCarrier } from './carrier-adapter.mjs';
export const admissionSelection = (root, args = []) => carrierSelection('admission', root, args);
export const admissionStage = (root, args = [], id = 'admission:full') =>
  carrierStage('admission', root, args, id);
export const reconcileAdmission = (selection, actual, context) =>
  reconcileCarrier('admission', selection, actual, context);
