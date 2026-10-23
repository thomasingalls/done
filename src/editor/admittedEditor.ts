/** A real CodeMirror surface whose document receives only accepted text. */
import { EditorSelection, EditorState, Compartment, type Extension } from '@codemirror/state';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { defaultKeymap } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { indentUnit } from '@codemirror/language';
import { livePreview } from './livePreview';
import { cardTheme, editorTheme } from './theme';
import type { AdmittedTextSurface, TextAction, TextSelection } from './admittedText';

export interface AdmittedEditorOptions {
  readonly parent: HTMLElement;
  readonly document: AdmittedTextSurface;
  readonly placeholder?: string;
  readonly extra?: readonly Extension[];
  readonly surface?: 'document' | 'card';
}
export const createAdmittedEditor = (options: AdmittedEditorOptions) => {
  const document = options.document,
    editable = new Compartment();
  let destroyed = false,
    projecting = false,
    composing = false;
  let selection: TextSelection | undefined, compositionSelection: TextSelection | undefined;
  let localError = '',
    suppressComposition = false;
  let isEditable = true;
  const status = window.document.createElement('div');
  status.className = 'admission-status';
  status.setAttribute('role', 'status');
  const message = window.document.createElement('span');
  const retry = window.document.createElement('button'),
    discard = window.document.createElement('button');
  retry.type = discard.type = 'button';
  retry.textContent = 'Retry storage';
  discard.textContent = 'Discard pending input';
  status.append(message, retry, discard);
  options.parent.append(status);
  const report = (error: unknown) => {
    localError = error instanceof Error ? error.message : String(error);
    renderStatus();
  };
  const input = (action: TextAction, at = selection) => {
    try {
      document.input(action, at);
      selection = undefined;
      localError = '';
      renderStatus();
    } catch (error) {
      report(error);
    }
    return true;
  };
  const bind = (key: string, name: TextAction['name'], mac?: string) => ({
    key,
    ...(mac ? { mac } : {}),
    preventDefault: true,
    run: () => input({ name } as TextAction),
  });
  const extensions: Extension[] = [
    ...(options.extra ?? []),
    keymap.of([
      bind('Mod-z', 'undo'),
      bind('Mod-Shift-z', 'redo'),
      bind('Mod-y', 'redo'),
      bind('Backspace', 'backspace'),
      bind('Delete', 'delete'),
      bind('Alt-ArrowUp', 'moveLineUp'),
      bind('Alt-ArrowDown', 'moveLineDown'),
      {
        mac: 'Mod-Backspace',
        preventDefault: true,
        run: (view) => {
          // Only the view knows soft-wrap boundaries. Capture the native Mac
          // deletion as a selection replacement so admission owns text/history.
          const current = view.state.selection;
          const ranges = current.ranges.map((range) => {
            if (!range.empty) return range;
            const start = view.moveToLineBoundary(range, false).head;
            return EditorSelection.range(
              range.head,
              range.head > start ? start : Math.max(0, range.head - 1),
            );
          });
          return input(
            { name: 'insert', text: '' },
            EditorSelection.create(ranges, current.mainIndex).toJSON(),
          );
        },
      },
      bind('Mod-Backspace', 'deleteWordBackward', 'Alt-Backspace'),
      bind('Enter', 'enter'),
      bind('Shift-Enter', 'newline'),
      bind('Tab', 'indent'),
      bind('Shift-Tab', 'outdent'),
      bind('Mod-]', 'indent'),
      bind('Mod-[', 'outdent'),
      bind('Mod-b', 'bold'),
      bind('Mod-i', 'italic'),
      bind('Mod-e', 'code'),
      bind('Mod-Shift-x', 'strike'),
      // Consume this explicitly: the default keymap would insert a blank line.
      { key: 'Mod-Enter', preventDefault: true, run: () => true },
    ]),
    keymap.of(defaultKeymap),
    markdown({ base: markdownLanguage, addKeymap: false }),
    indentUnit.of('  '),
    EditorView.lineWrapping,
    EditorState.allowMultipleSelections.of(true),
    livePreview(),
    options.surface === 'card' ? cardTheme : editorTheme,
    ...(options.placeholder === undefined ? [] : [placeholder(options.placeholder)]),
    editable.of(EditorView.editable.of(true)),
    EditorView.inputHandler.of((_view, from, to, inserted) => {
      if (composing || suppressComposition) return true;
      const at = document.status.pendingItems
        ? selection
        : _view.state.selection.ranges.length > 1
          ? _view.state.selection.toJSON()
          : EditorSelection.single(from, to).toJSON();
      return input({ name: 'insert', text: inserted }, at);
    }),
    EditorView.domEventHandlers({
      compositionstart(_event, view) {
        composing = true;
        compositionSelection =
          selection ?? (document.status.pendingItems ? undefined : view.state.selection.toJSON());
        return false;
      },
      beforeinput(event) {
        // Blink can end a cancelled/reconciled preedit with insertText and no compositionend.
        if (
          composing &&
          !event.isComposing &&
          ['insertText', 'insertFromComposition'].includes(event.inputType)
        ) {
          composing = false;
          event.preventDefault();
          if (event.data) input({ name: 'insert', text: event.data }, compositionSelection);
          compositionSelection = undefined;
          return true;
        }
        return false;
      },
      compositionend(event) {
        const commit = composing;
        composing = false;
        suppressComposition = true;
        if (commit && event.data) input({ name: 'insert', text: event.data }, compositionSelection);
        compositionSelection = undefined;
        queueMicrotask(() => {
          suppressComposition = false;
          // Reconcile any transient preedit DOM even when admission refused it.
          if (!destroyed) project(true);
        });
        return false;
      },
      paste(event) {
        const content = event.clipboardData?.getData('text/plain');
        if (content === undefined) return false;
        event.preventDefault();
        return input({ name: 'insert', text: content });
      },
      cut(event, view) {
        event.preventDefault();
        try {
          const snapshot = document.read();
          if (snapshot.editable === false || !isEditable)
            throw Error('This writing is not editable.');
          // Copy only the accepted text the user can see. A queued predecessor
          // could otherwise expand a relative selection to writing not copied.
          if (document.status.pendingItems || composing || view.composing)
            throw Error(
              'Wait for pending writing to save or composition to finish before cutting.',
            );
          if (document.status.state !== 'active')
            throw Error('Editing is unavailable. Reopen after resolving the storage problem.');
          if (!event.clipboardData)
            throw Error('The clipboard is unavailable. Your writing was kept.');
          const current = view.state.selection;
          const linewise = current.ranges.every((range) => range.empty);
          let ranges = linewise
            ? current.ranges.map((range) => {
                const line = view.state.doc.lineAt(range.head);
                return EditorSelection.range(
                  line.from,
                  Math.min(view.state.doc.length, line.to + 1),
                );
              })
            : current.ranges.filter((range) => !range.empty);
          if (linewise) {
            const merged: typeof ranges = [];
            for (const range of ranges) {
              const last = merged.at(-1);
              if (last && range.from <= last.to)
                merged[merged.length - 1] = EditorSelection.range(
                  last.from,
                  Math.max(last.to, range.to),
                );
              else merged.push(range);
            }
            ranges = merged;
          }
          const selected = EditorSelection.create(
            ranges,
            Math.max(0, ranges.indexOf(current.main)),
          );
          if (selected.ranges.every((range) => range.empty)) return true;
          const text = selected.ranges
            .map((range) => view.state.sliceDoc(range.from, range.to))
            .join('\n');
          try {
            event.clipboardData.setData('text/plain', text);
            if (event.clipboardData.getData('text/plain') !== text)
              throw Error('Clipboard refused');
          } catch {
            throw Error('Could not write to the clipboard. Your writing was kept.');
          }
          return input({ name: 'insert', text: '' }, selected.toJSON());
        } catch (error) {
          report(error);
          return true;
        }
      },
      copy(event) {
        try {
          document.read();
          return false;
        } catch {
          event.preventDefault();
          return true;
        }
      },
    }),
  ];
  const first = document.read();
  const view = new EditorView({
    parent: options.parent,
    state: EditorState.create({
      doc: first.text,
      selection: EditorSelection.fromJSON(first.selection),
      extensions,
    }),
    dispatchTransactions(transactions) {
      if (projecting) {
        view.update(transactions);
        return;
      }
      for (const tr of transactions) {
        if (tr.docChanged) {
          if (tr.isUserEvent('input.toggle-task')) {
            let position = 0;
            tr.changes.iterChanges((from) => {
              position = from;
            });
            input({ name: 'task' }, EditorSelection.single(position).toJSON());
            continue;
          }
          // Extension commands must have a semantic adapter. Never publish an arbitrary transaction.
          report(Error('This command needs an admission adapter.'));
        } else {
          view.update([tr]);
          if (tr.selection) selection = tr.newSelection.toJSON();
        }
      }
    },
  });
  function project(force = false) {
    if (destroyed) return;
    try {
      const snapshot = document.read();
      const changedEditable = isEditable !== (snapshot.editable !== false);
      isEditable = snapshot.editable !== false;
      const before = view.state.doc.toString(),
        after = snapshot.text;
      // Copying or moving a card can publish without changing this text. Keep the
      // user's local selection then; it has not been submitted as a text intent.
      const nextSelection = before === after && selection ? selection : snapshot.selection;
      if (before !== after) selection = undefined;
      const projectedSelection = EditorSelection.fromJSON(nextSelection);
      // Other workspace surfaces publish together. An unchanged projection does
      // not need a selection transaction (which also rebuilds live preview).
      // eq includes positions and goal columns; check the remaining cursor state
      // so this preserves the normalization performed by an actual dispatch.
      if (
        !force &&
        !composing &&
        !suppressComposition &&
        !view.composing &&
        before === after &&
        !changedEditable &&
        view.state.selection.eq(projectedSelection, true) &&
        view.state.selection.ranges.every((range, index) => {
          const projected = projectedSelection.ranges[index]!;
          return (
            range.assoc === projected.assoc &&
            range.bidiLevel === projected.bidiLevel &&
            range.undirectional === projected.undirectional
          );
        })
      )
        return;
      let changes: { from: number; to: number; insert: string } | undefined;
      if (before !== after) {
        let from = 0,
          end = before.length,
          last = after.length;
        while (from < end && from < last && before[from] === after[from]) from++;
        while (end > from && last > from && before[end - 1] === after[last - 1]) {
          end--;
          last--;
        }
        changes = { from, to: end, insert: after.slice(from, last) };
      }
      projecting = true;
      try {
        view.dispatch({
          ...(changes ? { changes } : {}),
          selection: projectedSelection,
          ...(changedEditable
            ? { effects: editable.reconfigure(EditorView.editable.of(isEditable)) }
            : {}),
        });
      } finally {
        projecting = false;
      }
    } catch {
      isEditable = false;
      projecting = true;
      try {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: '' },
          selection: EditorSelection.cursor(0),
          effects: editable.reconfigure(EditorView.editable.of(false)),
        });
      } finally {
        projecting = false;
      }
    }
  }
  function renderStatus() {
    if (destroyed) return;
    const value = document.status;
    const unavailable =
      !['active', 'blocked'].includes(value.state) || value.pressure?.code === 'repair-required';
    message.textContent = unavailable
      ? 'Editing is unavailable. Reopen after resolving the storage problem.'
      : localError ||
        (value.state === 'blocked'
          ? 'Input is waiting for storage.'
          : value.pendingItems
            ? 'Input is waiting to be saved.'
            : '');
    retry.hidden = discard.hidden = value.state !== 'blocked' || unavailable;
    if (unavailable) project();
  }
  retry.onclick = () => {
    try {
      document.retry();
      localError = '';
    } catch (error) {
      report(error);
    }
    renderStatus();
  };
  discard.onclick = () => {
    try {
      document.discardPending();
      selection = undefined;
      localError = '';
      project();
    } catch (error) {
      report(error);
    }
    renderStatus();
  };
  const unsubscribe = document.subscribe(project),
    stopStatus = document.onStatus(renderStatus);
  project();
  renderStatus();
  return {
    view,
    destroy: () => {
      destroyed = true;
      unsubscribe();
      stopStatus();
      view.destroy();
      status.remove();
    },
  };
};
