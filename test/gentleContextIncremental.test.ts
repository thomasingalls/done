import { ensureSyntaxTree } from '@codemirror/language';
import { StateEffect, type TransactionSpec } from '@codemirror/state';
import type { DecorationSet, EditorView, ViewUpdate } from '@codemirror/view';
import { Tree } from '@lezer/common';
import { describe, expect, it, vi } from 'vitest';
import {
  gentleContextPlan,
  gentleContextView,
  gentleLineIsClear,
} from '../src/editor/gentleContext';
import { stateFor } from './helpers';

const TEXT =
  '# Work\nold note\n## Site\nsite note\n### Launch\ncurrent task\n### Later\nlater note\n# Home\nhome note';

// Drive the real plugin's read/write/microtask boundary with real Markdown states.
// Geometry is fixed here; actual layout/offscreen behavior also has browser coverage.
const harness = (initial = stateFor(TEXT, TEXT.indexOf('current task') + 7)) => {
  let visible = true;
  let dispatches = 0;
  const reads: NonNullable<Parameters<EditorView['requestMeasure']>[0]>[] = [];
  const microtasks: (() => void)[] = [];
  const bounds = { top: 0, bottom: 1000, left: 0, right: 1000, width: 1000, height: 1000 };
  const view = {
    state: initial,
    visibleRanges: [{ from: 0, to: initial.doc.length }],
    dom: {
      ownerDocument: {
        defaultView: {
          visualViewport: null,
          innerHeight: 1000,
          innerWidth: 1000,
          queueMicrotask: (run: () => void) => microtasks.push(run),
        },
      },
      getBoundingClientRect: () => bounds,
    },
    scrollDOM: { getBoundingClientRect: () => bounds },
    coordsAtPos: () => ({
      top: visible ? 50 : 1100,
      bottom: visible ? 70 : 1120,
      left: 20,
      right: 21,
    }),
    requestMeasure: (request: NonNullable<Parameters<EditorView['requestMeasure']>[0]>) =>
      reads.push(request),
    dispatch: (spec: TransactionSpec) => {
      dispatches++;
      apply(spec);
    },
  };
  const plugin = (
    gentleContextView() as unknown as {
      create: (view: EditorView) => {
        decorations: DecorationSet;
        update: (update: ViewUpdate) => void;
        schedule: (view: EditorView) => void;
        destroy: () => void;
      };
    }
  ).create(view as unknown as EditorView);
  function apply(spec: TransactionSpec) {
    const startState = view.state;
    const transaction = startState.update(spec);
    // Finish parser work as the editor does; this is not part of the plugin's work.
    ensureSyntaxTree(transaction.state, transaction.state.doc.length, 5000);
    view.state = transaction.state;
    view.visibleRanges = [{ from: 0, to: view.state.doc.length }];
    plugin.update({
      view,
      state: view.state,
      startState,
      changes: transaction.changes,
      transactions: [transaction],
      docChanged: transaction.docChanged,
      selectionSet: transaction.selection !== undefined,
      viewportChanged: false,
      geometryChanged: false,
    } as unknown as ViewUpdate);
  }
  function flush() {
    let remaining = 20;
    while (reads.length || microtasks.length) {
      if (!remaining--) throw Error('Context measurement did not settle');
      for (const request of reads.splice(0)) {
        const measured = request.read!(view as unknown as EditorView);
        request.write!(measured, view as unknown as EditorView);
      }
      for (const run of microtasks.splice(0)) run();
    }
  }
  const dimmed = () => {
    const positions: number[] = [];
    for (let cursor = plugin.decorations.iter(); cursor.value; cursor.next())
      positions.push(cursor.from);
    return positions;
  };
  const reference = () => {
    const plan = gentleContextPlan(view.state);
    return plan
      ? Array.from({ length: view.state.doc.lines }, (_, index) => view.state.doc.line(index + 1))
          .filter((line) => !gentleLineIsClear(view.state, line.from, line.to, plan))
          .map((line) => line.from)
      : [];
  };
  return {
    view,
    plugin,
    apply,
    flush,
    dimmed,
    reference,
    dispatches: () => dispatches,
    visibility: (value: boolean) => {
      visible = value;
      plugin.schedule(view as unknown as EditorView);
    },
  };
};

describe('incremental gentle context at the editor measurement boundary', () => {
  it('does not dispatch a second effect when visible decoration ranges are unchanged', () => {
    const h = harness();
    h.flush();
    expect(h.dimmed()).toEqual(h.reference());
    const before = h.dispatches();
    h.plugin.schedule(h.view as unknown as EditorView);
    h.flush();
    expect(h.dispatches()).toBe(before);
    h.plugin.destroy();
  });

  it('maps ordinary paragraph edits without repeating heading searches or no-op effects', () => {
    const h = harness();
    h.flush();
    const before = h.dispatches();
    for (let index = 0; index < 20; index++) {
      const at = h.view.state.selection.main.head;
      h.apply({ changes: { from: at, insert: 'x' }, selection: { anchor: at + 1 } });
      const lookup = vi.spyOn(Tree.prototype, 'resolveInner');
      h.flush();
      expect(lookup).not.toHaveBeenCalled();
      lookup.mockRestore();
      expect(h.dimmed()).toEqual(h.reference());
    }
    expect(h.dispatches()).toBe(before);
    expect(h.view.state.doc.toString()).toContain('current' + 'x'.repeat(20) + ' task');
    h.plugin.destroy();
  });

  it('reuses the ownership interval but recomputes when the caret enters a child heading', () => {
    const h = harness(stateFor(TEXT, TEXT.indexOf('site note')));
    h.flush();
    h.apply({ selection: { anchor: TEXT.indexOf('site note') + 4 } });
    const lookup = vi.spyOn(Tree.prototype, 'resolveInner');
    h.flush();
    expect(lookup).not.toHaveBeenCalled();
    lookup.mockRestore();
    h.apply({ selection: { anchor: TEXT.indexOf('current task') } });
    h.flush();
    expect(h.dimmed()).toEqual(h.reference());
    expect(h.dimmed()).toContain(TEXT.indexOf('site note'));
    h.plugin.destroy();
  });

  it('recomputes through heading creation, Setext conversion, code fences and line joins', () => {
    const h = harness();
    h.flush();
    const edits = [
      { from: TEXT.indexOf('current task'), insert: '## New\n' },
      { from: 0, to: 7, insert: 'Work\n====' },
      { from: 0, insert: '```\n' },
      { from: 0, to: 4, insert: '' },
    ];
    for (const changes of edits) {
      h.apply({ changes });
      h.flush();
      expect(h.dimmed()).toEqual(h.reference());
    }
    h.plugin.destroy();
  });

  it('restores ordinary contrast offscreen and avoids repeated offscreen effects', () => {
    const h = harness();
    h.flush();
    h.visibility(false);
    h.flush();
    expect(h.dimmed()).toEqual([]);
    const before = h.dispatches();
    h.visibility(false);
    h.flush();
    expect(h.dispatches()).toBe(before);
    h.visibility(true);
    h.flush();
    expect(h.dimmed()).toEqual(h.reference());
    h.plugin.destroy();
  });

  it('does not use a cached plan after parser reconfiguration', () => {
    const h = harness();
    h.flush();
    h.apply({ effects: StateEffect.reconfigure.of([]) });
    h.flush();
    expect(h.dimmed()).toEqual([]);
    h.plugin.destroy();
  });

  it('matches an independent fresh projection across deterministic mixed structural edits and caret moves', () => {
    const h = harness();
    h.flush();
    let seed = 0x6c61756e;
    const random = (limit: number) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed % limit;
    };
    const inserts = ['x', '\n', '# ', '---', '```', '> ', '- ', '\\', ''];
    for (let index = 0; index < 250; index++) {
      const from = random(h.view.state.doc.length + 1);
      if (index % 3 === 0) h.apply({ selection: { anchor: from } });
      else
        h.apply({
          changes: {
            from,
            to: Math.min(h.view.state.doc.length, from + random(3)),
            insert: inserts[random(inserts.length)]!,
          },
        });
      h.flush();
      expect(h.dimmed(), `history step ${index}`).toEqual(h.reference());
    }
    h.plugin.destroy();
  });

  it('does not dispatch work queued before the editor is destroyed', () => {
    const h = harness();
    h.plugin.destroy();
    h.flush();
    expect(h.dispatches()).toBe(0);
    expect(h.dimmed()).toEqual([]);
  });
});
