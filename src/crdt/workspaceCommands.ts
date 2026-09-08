/** Semantic application commands. No caller receives the document passed to these adapters. */
import { EditorState, EditorSelection, type Transaction } from '@codemirror/state';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { indentUnit } from '@codemirror/language';
import { Y, type YDoc, type YText, type YUndoManager } from './yjs';
import {
  registerWorkspaceActor,
  updateActor,
  type WorkspaceActorIdentity,
  type Origin,
} from './actors';
import { openTree, readSchemaVersion, SCHEMA_VERSION, setRolloverHour } from './doc';
import { cardAt, cardLocation, cardText, cardsMap, repairCardMemberships } from './days';
import {
  compose,
  moveCard,
  reorderCard,
  removeCard,
  splitCard,
  mergeCardBackwards,
  copyFromMaster,
  fileCardTo,
  fileCardToGoals,
  removeUnfiledCard,
  moveAllNextTo,
  moveAllNextToMaster,
  type Ref,
  type Workspace,
} from './moves';
import { isFrozen } from './freeze';
import { textCommands } from '../editor/admittedCommands';
import type { TextAction, TextSelection } from '../editor/admittedText';
import type { ISODate } from '../lib/date';

export type TextTarget =
  | { readonly kind: 'master' }
  | { readonly kind: 'card'; readonly id: string };
export type WorkspaceCommand =
  | { readonly kind: 'compose'; readonly to: Ref; readonly text: string }
  | { readonly kind: 'move'; readonly id: string; readonly to: Ref; readonly index?: number }
  | { readonly kind: 'reorder'; readonly id: string; readonly index: number }
  | { readonly kind: 'remove'; readonly id: string }
  | { readonly kind: 'split'; readonly id: string; readonly at: number; readonly tailFrom?: number }
  | { readonly kind: 'merge'; readonly id: string }
  | { readonly kind: 'copy'; readonly to: Ref; readonly lines: readonly string[] }
  | { readonly kind: 'file'; readonly id: string; readonly to: Ref | 'master' }
  | { readonly kind: 'bulk'; readonly from: ISODate; readonly to: Ref | 'master' }
  | { readonly kind: 'settings'; readonly rolloverHour: number }
  | { readonly kind: 'actor'; readonly patch: { readonly name?: string; readonly color?: string } }
  | { readonly kind: 'repair' | 'undo' | 'redo' };
export type RelativeSelection = {
  ranges: { anchor: Y.RelativePosition; head: Y.RelativePosition }[];
  main: number;
};
export type WorkspaceIntent = {
  readonly group: number;
  readonly command:
    | WorkspaceCommand
    | { kind: 'initialize' }
    | { kind: 'text'; target: TextTarget; action: TextAction; selection?: RelativeSelection };
  readonly split?: { at: Y.RelativePosition; tail: Y.RelativePosition };
};
export type CommandValue = boolean | number | string | null | { readonly id: string };
export interface CommandContext {
  readonly identity: WorkspaceActorIdentity;
  readonly human: Origin;
  readonly system: Origin;
  readonly today: ISODate;
}
export const targetKey = (target: TextTarget): string =>
  target.kind === 'master' ? 'master' : 'card:' + target.id;
export const targetText = (doc: YDoc, target: TextTarget): YText => {
  if (target.kind === 'master') return doc.getText('master');
  const card = cardAt(doc, target.id);
  if (!card) throw Error('This card no longer exists.');
  return cardText(card);
};
export const editableTarget = (doc: YDoc, target: TextTarget, today: ISODate): boolean => {
  if (target.kind === 'master') return true;
  const location = cardLocation(doc, target.id);
  return Boolean(cardAt(doc, target.id) && location && !isFrozen(location.date, today));
};
export const relativeSelection = (text: YText, selection: TextSelection): RelativeSelection => {
  const value = EditorSelection.fromJSON(selection);
  const position = (n: number) => {
    if (n < 0 || n > text.length) throw Error('Selection lies outside accepted text.');
    return Y.createRelativePositionFromTypeIndex(text, n);
  };
  return {
    ranges: value.ranges.map((r) => ({ anchor: position(r.anchor), head: position(r.head) })),
    main: value.mainIndex,
  };
};
export const resolveSelection = (
  doc: YDoc,
  text: YText,
  selection?: RelativeSelection,
): EditorSelection => {
  const position = (p: Y.RelativePosition) => {
    const at = Y.createAbsolutePositionFromRelativePosition(p, doc);
    if (!at || at.type !== text) throw Error('The text selection no longer resolves.');
    return at.index;
  };
  return selection
    ? EditorSelection.create(
        selection.ranges.map((r) => EditorSelection.range(position(r.anchor), position(r.head))),
        selection.main,
      )
    : EditorSelection.single(0);
};

export const runWorkspaceCommand = (
  history: YUndoManager,
  intent: WorkspaceIntent,
  context: CommandContext,
  selections: Map<string, RelativeSelection>,
): { value: CommandValue; remaining?: WorkspaceIntent } => {
  const doc = history.doc,
    command = intent.command;
  const workspace: Workspace = {
    doc,
    origin: context.human,
    systemOrigin: context.system,
    author: context.identity.id,
    today: context.today,
    undo: history,
  };
  if (command.kind === 'initialize') {
    if (readSchemaVersion(doc.getMap('meta')) > SCHEMA_VERSION)
      throw Error('Unsupported workspace schema.');
    registerWorkspaceActor(doc, context.identity);
    openTree(doc, context.system);
    return { value: repairCardMemberships(doc, context.system) };
  }
  // Repair is its own system transaction, including before a later queued human command.
  repairCardMemberships(doc, context.system);
  const from = 'id' in command ? cardLocation(doc, command.id) : null;
  let value: CommandValue = false;
  switch (command.kind) {
    case 'text': {
      if (!editableTarget(doc, command.target, context.today)) return { value: false };
      const text = targetText(doc, command.target),
        key = targetKey(command.target);
      const selection = resolveSelection(doc, text, command.selection ?? selections.get(key));
      const state = EditorState.create({
        doc: text.toString(),
        selection,
        extensions: [
          markdown({ base: markdownLanguage, addKeymap: false }),
          indentUnit.of('  '),
          EditorState.allowMultipleSelections.of(true),
        ],
      });
      let transaction: Transaction | undefined,
        rest = '';
      if (command.action.name === 'insert') {
        let end = Math.min(1000, command.action.text.length);
        if (
          end < command.action.text.length &&
          /[\uD800-\uDBFF]/u.test(command.action.text[end - 1]!)
        )
          end--;
        rest = command.action.text.slice(end);
        transaction = state.update(state.replaceSelection(command.action.text.slice(0, end)));
      } else {
        if (command.action.name === 'undo' || command.action.name === 'redo')
          throw Error('Undo is workspace-scoped.');
        textCommands[command.action.name]({
          state,
          dispatch: (tr) => {
            transaction = tr;
          },
        });
      }
      if (transaction) {
        const edits: { from: number; to: number; insert: string }[] = [];
        transaction.changes.iterChanges((from, to, _a, _b, inserted) =>
          edits.push({ from, to, insert: inserted.toString() }),
        );
        doc.transact(() => {
          for (const edit of edits.reverse()) {
            if (edit.to > edit.from) text.delete(edit.from, edit.to - edit.from);
            if (edit.insert) text.insert(edit.from, edit.insert);
          }
        }, context.human);
        selections.set(key, relativeSelection(text, transaction.newSelection.toJSON()));
        value = !transaction.changes.empty;
      }
      return {
        value,
        ...(rest
          ? {
              remaining: {
                group: intent.group,
                command: {
                  kind: 'text' as const,
                  target: command.target,
                  action: { name: 'insert' as const, text: rest },
                },
              },
            }
          : {}),
      };
    }
    case 'undo':
      value = history.undo() !== null;
      break;
    case 'redo':
      value = history.redo() !== null;
      break;
    case 'compose': {
      const old = new Set(cardsMap(doc).keys());
      value = compose(workspace, command.to, command.text);
      if (value) {
        const id = [...cardsMap(doc).keys()].find((id) => !old.has(id))!;
        value = { id };
      }
      break;
    }
    case 'move':
      value = from ? moveCard(workspace, from, command.id, command.to, command.index) : false;
      break;
    case 'reorder':
      value = from ? reorderCard(workspace, from, command.id, command.index) : false;
      break;
    case 'remove':
      value = from
        ? removeCard(workspace, from, command.id)
        : removeUnfiledCard(workspace, command.id);
      break;
    case 'split': {
      if (!from || !intent.split) break;
      const text = targetText(doc, { kind: 'card', id: command.id });
      const at = resolveSelection(doc, text, {
        ranges: [{ anchor: intent.split.at, head: intent.split.tail }],
        main: 0,
      }).main;
      value = splitCard(workspace, from, command.id, at.anchor, at.head);
      break;
    }
    case 'merge':
      value = from ? mergeCardBackwards(workspace, from, command.id) : null;
      break;
    case 'copy':
      value = copyFromMaster(workspace, command.to, command.lines);
      break;
    case 'file':
      value =
        command.to === 'master'
          ? fileCardToGoals(workspace, doc.getText('master'), command.id)
          : fileCardTo(workspace, command.id, command.to);
      break;
    case 'bulk': {
      const system = { ...workspace, origin: context.system };
      value =
        command.to === 'master'
          ? moveAllNextToMaster(system, doc.getText('master'), command.from)
          : moveAllNextTo(system, command.from, command.to);
      break;
    }
    case 'settings':
      value = setRolloverHour(doc, doc.getMap('meta'), context.human, command.rolloverHour);
      break;
    case 'actor':
      value = updateActor(doc, context.human, context.identity.id, command.patch) !== null;
      break;
    case 'repair':
      value = repairCardMemberships(doc, context.system);
      break;
  }
  repairCardMemberships(doc, context.system);
  return { value };
};
