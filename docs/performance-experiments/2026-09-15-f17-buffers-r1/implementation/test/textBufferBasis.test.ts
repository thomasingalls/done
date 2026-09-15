// @vitest-environment node
import { it, expect } from 'vitest';
import {
  Y,
  createHistoryDoc,
  isTextBufferBasis,
  createSelectionHistory,
  applyUpdate,
} from '../src/crdt/yjs';

it('text buffer basis rejects every unsupported normalization shape', () => {
  const sparse = Array(2);
  sparse[1] = 'value';
  const extra = ['value'] as string[] & { extra?: string };
  extra.extra = 'lost';
  const hidden = {};
  Object.defineProperty(hidden, 'hidden', { value: 'lost' });
  for (const value of [sparse, extra, hidden]) {
    const doc = createHistoryDoc();
    try {
      doc.getMap('meta').set('value', value);
      expect(isTextBufferBasis(doc), String(value)).toBe(false);
    } finally {
      doc.destroy();
    }
  }
});

it('text buffer basis accepts ordinary strings and rejects surrogates, unsupported content and pending state', () => {
  const doc = createHistoryDoc();
  try {
    doc.getText('master').insert(0, 'ordinary é');
    doc.getMap('meta').set('nested', { list: ['yes', true, null, 2] });
    expect(isTextBufferBasis(doc)).toBe(true);
    for (const text of ['\u{1f600}', '\ud800', '\udc00']) {
      const own = createHistoryDoc();
      try {
        own.getText('master').insert(0, text);
        expect(isTextBufferBasis(own)).toBe(false);
      } finally {
        own.destroy();
      }
    }
    const bin = createHistoryDoc();
    try {
      bin.getMap('meta').set('bin', new Uint8Array([1]));
      expect(isTextBufferBasis(bin)).toBe(false);
    } finally {
      bin.destroy();
    }
    const writer = createHistoryDoc(),
      updates: Uint8Array[] = [];
    writer.on('update', (b) => updates.push(new Uint8Array(b)));
    writer.getText('master').insert(0, 'dependency');
    writer.getText('master').insert(0, 'dependent');
    applyUpdate(doc, updates[1]!);
    expect(doc.store.pendingStructs).not.toBeNull();
    expect(isTextBufferBasis(doc)).toBe(false);
    writer.destroy();
  } finally {
    doc.destroy();
  }
});

it('text history catch-up refuses aliases foreign owners and closed or disposed histories', () => {
  const a = createSelectionHistory(),
    b = createSelectionHistory(),
    human = {};
  const source = a.create(createHistoryDoc(), human),
    target = a.fork(source, human),
    foreign = b.create(createHistoryDoc(), human);
  try {
    expect(() => a.catchUpText(source, source, new Uint8Array([0, 0]))).toThrow(/aliases/);
    expect(() => a.catchUpText(target, foreign, new Uint8Array([0, 0]))).toThrow(/foreign/);
    a.close();
    expect(() => a.catchUpText(target, source, new Uint8Array([0, 0]))).toThrow(/closed/);
    foreign.destroy();
    expect(() => b.catchUpText(foreign, foreign, new Uint8Array([0, 0]))).toThrow(/disposed/);
    expect(source.doc).toBeInstanceOf(Y.Doc);
  } finally {
    for (const h of [source, target, foreign]) {
      h.destroy();
      h.doc.destroy();
    }
    a.close();
    b.close();
  }
});

it('text history catch-up applies the exact delta and copies both detached stacks', () => {
  const owner = createSelectionHistory(),
    human = {};
  const source = owner.create(createHistoryDoc(), human);
  source.doc.transact(() => source.doc.getText('master').insert(0, 'A'), human);
  const target = owner.fork(source, human),
    updates: Uint8Array[] = [];
  source.doc.on('update', (b) => updates.push(new Uint8Array(b)));
  try {
    source.stopCapturing();
    source.doc.transact(() => source.doc.getText('master').insert(1, 'B'), human);
    owner.catchUpText(target, source, updates[0]!);
    expect(target.doc.getText('master').toString()).toBe('AB');
    expect(target.undoStack).toEqual(source.undoStack);
    expect(target.undoStack[0]).not.toBe(source.undoStack[0]);
    expect(target.redoStack).not.toBe(source.redoStack);
    target.undo();
    expect(target.doc.getText('master').toString()).toBe('A');
    expect(source.doc.getText('master').toString()).toBe('AB');
  } finally {
    for (const h of [source, target]) {
      h.destroy();
      h.doc.destroy();
    }
    owner.close();
  }
});
