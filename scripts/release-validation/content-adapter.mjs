/** Explicit content catalogue binding; other families are not credited by this adapter. */
import { carrierSelection, carrierStage, reconcileCarrier } from './carrier-adapter.mjs';
export const contentSelection = (root, args = []) => carrierSelection('content', root, args);
export const contentStage = (root, args = [], id = 'content:full') =>
  carrierStage('content', root, args, id);
export const reconcileContent = (selection, actual, context) =>
  reconcileCarrier('content', selection, actual, context);
