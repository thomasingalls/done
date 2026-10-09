/** Explicit binding for the retained-startup catalogue; no whole-startup qualification. */
import { carrierSelection, carrierStage, reconcileCarrier } from './carrier-adapter.mjs';
export const ownedStartupSelection = (root, args = []) =>
  carrierSelection('owned-startup', root, args);
export const ownedStartupStage = (root, args = [], id = 'owned-startup:full') =>
  carrierStage('owned-startup', root, args, id);
export const reconcileOwnedStartup = (selection, actual, context) =>
  reconcileCarrier('owned-startup', selection, actual, context);
