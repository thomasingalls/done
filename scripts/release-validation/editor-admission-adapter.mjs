/** Explicit binding for the Goals CodeMirror catalogue; no whole-editor qualification. */
import { carrierSelection, carrierStage, reconcileCarrier } from './carrier-adapter.mjs';
export const editorAdmissionSelection = (root, args = []) =>
  carrierSelection('editor-admission', root, args);
export const editorAdmissionStage = (root, args = [], id = 'editor-admission:full') =>
  carrierStage('editor-admission', root, args, id);
export const reconcileEditorAdmission = (selection, actual, context) =>
  reconcileCarrier('editor-admission', selection, actual, context);
