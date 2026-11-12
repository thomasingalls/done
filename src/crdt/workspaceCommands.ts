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
import {
  cardAt,
  cardLocation,
  cardText,
  cardGoalsContext,
  cardsMap,
  repairCardMemberships,
  type GoalsContext,
} from './days';
import {
  compose,
  doneForNow,
  moveCard,
  reorderCard,
  removeCard,
  splitCard,
  mergeCardBackwards,
  copyFromMaster,
  moveFromMaster,
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
  | { readonly kind: 'duplicate'; readonly id: string }
  | { readonly kind: 'done-for-now'; readonly id: string }
  | { readonly kind: 'move'; readonly id: string; readonly to: Ref; readonly index?: number }
  | { readonly kind: 'reorder'; readonly id: string; readonly index: number }
  | { readonly kind: 'remove'; readonly id: string }
  | { readonly kind: 'split'; readonly id: string; readonly at: number; readonly tailFrom?: number }
  | { readonly kind: 'merge'; readonly id: string }
  | {
      readonly kind: 'copy';
      readonly to: Ref;
      readonly lines: readonly string[];
      readonly goalsContexts?: readonly (GoalsContext | null)[];
    }
  | {
      readonly kind: 'move-from-master';
      readonly to: Ref;
      readonly lines: readonly {
        readonly line: number;
        readonly text: string;
        readonly goalsContext?: GoalsContext;
      }[];
    }
  | { readonly kind: 'file'; readonly id: string; readonly to: Ref | 'master' }
  | { readonly kind: 'bulk'; readonly from: ISODate; readonly to: Ref | 'master' }
  | { readonly kind: 'settings'; readonly rolloverHour: number }
  | { readonly kind: 'actor'; readonly patch: { readonly name?: string; readonly color?: string } }
  | { readonly kind: 'device-label'; readonly name: string }
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
  readonly masterMove?: RelativeSelection;
  /** A later slice of a split command: the receipt keeps the first slice's business result. */
  readonly continuation?: true;
};
export type CommandValue = boolean | number | string | null | { readonly id: string };
/** Text insertion slices: at most 1000 UTF-16 units, never ending between a surrogate pair. */
export const TEXT_SLICE_UNITS = 1000;
export const sliceInsertText = (text: string): readonly [head: string, rest: string] => {
  let end = Math.min(TEXT_SLICE_UNITS, text.length);
  if (end < text.length && /[\uD800-\uDBFF]/u.test(text[end - 1]!)) end--;
  return [text.slice(0, end), text.slice(end)];
};
/** A composed card whose text is longer than this in UTF-8 is created from its first text slice
 * and completed by text slices. 2 KiB below the 16 KiB admission update limit, which leaves room
 * for the card's own fields (about 400 bytes measured); anything still over is refused, not sealed. */
export const COMPOSE_WHOLE_BYTES = 14 * 1024;
const utf8Length = (text: string) => {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    if (unit < 0x80) bytes += 1;
    else if (unit < 0x800) bytes += 2;
    else if (unit >= 0xd800 && unit <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        i++;
      } else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
};
export interface CommandContext {
  readonly identity: WorkspaceActorIdentity;
  readonly deviceLabelId?: string;
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

type CommandRunner = (
  history: YUndoManager,
  intent: WorkspaceIntent,
  context: CommandContext,
  selections: Map<string, RelativeSelection>,
) => { value: CommandValue; remaining?: WorkspaceIntent };

/** Unconditional reference runner, also used by callers that do not own a repair basis. */
export const runWorkspaceCommand: CommandRunner = (...args) =>
  executeWorkspaceCommand(...args, false);

/** Private to one admission owner. No eligibility capability escapes its workspace API. */
export const createWorkspaceCommandRunner = () => {
  const repaired = new WeakSet<YUndoManager>();
  return Object.freeze({
    eligible(history: YUndoManager) {
      return repaired.has(history);
    },
    inherit(source: YUndoManager, fork: YUndoManager) {
      if (source === fork) throw Error('Repair eligibility requires a detached history.');
      if (repaired.has(source)) repaired.add(fork);
      else repaired.delete(fork);
    },
    invalidate(history: YUndoManager) {
      repaired.delete(history);
    },
    run(...args: Parameters<CommandRunner>) {
      const history = args[0],
        knownRepaired = repaired.has(history);
      repaired.delete(history);
      const result = executeWorkspaceCommand(...args, knownRepaired);
      // Failed execution cannot establish a fact. A private candidate only marks itself;
      // its identity follows the existing verified adoption/disposal lifecycle.
      repaired.add(history);
      return result;
    },
  });
};

/** Pure editor-command planning shared by native and direct preparation. */
export function planWorkspaceText(
  doc: YDoc,
  command: Extract<WorkspaceIntent['command'], { kind: 'text' }>,
  selections: Map<string, RelativeSelection>,
) {
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
    const [head, tail] = sliceInsertText(command.action.text);
    rest = tail;
    transaction = state.update(state.replaceSelection(head));
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
  return { text, key, transaction, rest };
}

const executeWorkspaceCommand = (
  history: YUndoManager,
  intent: WorkspaceIntent,
  context: CommandContext,
  selections: Map<string, RelativeSelection>,
  knownRepaired: boolean,
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
    // Older releases keyed names by a local provenance ID. Publish that name under
    // this owner's verified device ID once, so other devices can associate it.
    if (context.deviceLabelId && context.deviceLabelId !== context.identity.device.id) {
      const meta = doc.getMap('meta');
      const key = `device-label:${context.deviceLabelId}`;
      const current = meta.get(key);
      const legacy = meta.get(`device-label:${context.identity.device.id}`);
      const name =
        typeof legacy === 'string' && legacy !== 'This device'
          ? legacy
          : context.identity.device.name;
      if ((typeof current !== 'string' || current === 'This device') && current !== name)
        doc.transact(() => meta.set(key, name), context.system);
    }
    return { value: repairCardMemberships(doc, context.system) };
  }
  // Repair is its own system transaction, including before a later queued human command.
  if (command.kind !== 'text' || !knownRepaired) repairCardMemberships(doc, context.system);
  const from = 'id' in command ? cardLocation(doc, command.id) : null;
  let value: CommandValue = false;
  let remaining: WorkspaceIntent | undefined;
  switch (command.kind) {
    case 'text': {
      if (!editableTarget(doc, command.target, context.today)) return { value: false };
      const { text, key, transaction, rest } = planWorkspaceText(doc, command, selections);
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
                ...(intent.continuation ? { continuation: true as const } : {}),
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
      // Too long for one update: create the card from its first text slice and append the rest
      // as text slices into it, in the same undo step, as a paste into a card is.
      const [head, rest] =
        utf8Length(command.text) > COMPOSE_WHOLE_BYTES
          ? sliceInsertText(command.text)
          : [command.text, ''];
      value = compose(workspace, command.to, head, { open: rest !== '' });
      if (value) {
        const id = [...cardsMap(doc).keys()].find((id) => !old.has(id))!;
        value = { id };
        if (rest) {
          const target = { kind: 'card' as const, id };
          const text = targetText(doc, target);
          selections.set(
            targetKey(target),
            relativeSelection(text, EditorSelection.single(text.length).toJSON()),
          );
          remaining = {
            group: intent.group,
            continuation: true,
            command: { kind: 'text', target, action: { name: 'insert', text: rest } },
          };
        }
      }
      break;
    }
    case 'duplicate': {
      const source = cardAt(doc, command.id);
      if (!from || !source) break;
      // Read from this admitted predecessor, including writing queued before
      // the click. Reuse creation's freeze, identity, attribution and undo path.
      value = compose(
        workspace,
        { date: from.date, section: 'scheduled' },
        cardText(source).toString(),
        { origin: command.id, goalsContext: cardGoalsContext(source) },
      );
      break;
    }
    case 'done-for-now':
      value = from ? doneForNow(workspace, from, command.id) : null;
      break;
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
      value = copyFromMaster(workspace, command.to, command.lines, command.goalsContexts);
      break;
    case 'move-from-master': {
      if (!intent.masterMove) break;
      const master = doc.getText('master');
      const selected = resolveSelection(doc, master, intent.masterMove);
      if (selected.ranges.length !== command.lines.length) break;
      const source = EditorState.create({ doc: master.toString() }).doc;
      const lines = selected.ranges.map((range) => source.lineAt(range.from));
      // A queued move follows its original lines. Any edit inside them refuses
      // the entire move instead of deleting different or newly written text.
      if (
        lines.some((line, index) => {
          const range = selected.ranges[index]!;
          return (
            range.from !== line.from ||
            range.to !== line.to ||
            line.text !== command.lines[index]!.text
          );
        })
      )
        break;
      value = moveFromMaster(
        workspace,
        master,
        command.to,
        lines.map((line) => line.number - 1),
        new Map(
          lines.map((line, index) => [line.number - 1, command.lines[index]!.goalsContext ?? null]),
        ),
      );
      break;
    }
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
    case 'device-label': {
      const name = command.name.trim().slice(0, 80);
      if (!name) break;
      // A display label inside encrypted workspace content, never a device credential.
      doc.transact(() => {
        const meta = doc.getMap('meta');
        meta.set(`device-label:${context.identity.device.id}`, name);
        if (context.deviceLabelId && context.deviceLabelId !== context.identity.device.id)
          meta.set(`device-label:${context.deviceLabelId}`, name);
      }, context.human);
      value = true;
      break;
    }
    case 'repair':
      value = repairCardMemberships(doc, context.system);
      break;
  }
  repairCardMemberships(doc, context.system);
  return { value, ...(remaining ? { remaining } : {}) };
};
