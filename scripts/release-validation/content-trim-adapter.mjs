/** Explicit binding for the Content trim catalogue; no whole-protocol qualification. */
import { carrierSelection, carrierStage, reconcileCarrier } from './carrier-adapter.mjs';
export const contentTrimSelection = (root, args = []) =>
  carrierSelection('content-trim', root, args);
export const contentTrimStage = (root, args = [], id = 'content-trim:full') =>
  carrierStage('content-trim', root, args, id);
export const reconcileContentTrim = (selection, actual, context) =>
  reconcileCarrier('content-trim', selection, actual, context);
