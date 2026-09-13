/** Explicit journal catalogue binding; other families are not credited by this adapter. */
import { carrierSelection, carrierStage, reconcileCarrier } from './carrier-adapter.mjs';
export const journalSelection = (root, args = []) => carrierSelection('journal', root, args);
export const journalStage = (root, args = [], id = 'journal:full') =>
  carrierStage('journal', root, args, id);
export const reconcileJournal = (selection, actual, context) =>
  reconcileCarrier('journal', selection, actual, context);
