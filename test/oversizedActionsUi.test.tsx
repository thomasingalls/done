// Phase 548: when an action is refused for too much text, the page says so, the compose field
// keeps its text and nothing claims storage is at fault.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { EditorSelection } from '@codemirror/state';
import { afterEach, expect, it, vi } from 'vitest';
import { WorkspaceUiProvider, useWorkspaceUi } from '../src/ui/workspaceUi';
import { Compose } from '../src/ui/Compose';
import { createAdmittedEditor } from '../src/editor/admittedEditor';
import type { AdmittedWorkspace } from '../src/crdt/admittedWorkspace';
import type { AdmittedTextSurface } from '../src/editor/admittedText';
import type { AdmissionStatus } from '../src/crdt/admission';
import {
  ActionTooLarge,
  TOO_LARGE_FOR_ONE_ACTION,
  TOO_LARGE_FOR_ONE_ACTION_MESSAGE,
} from '../src/crdt/actionSize';

const cleanups: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()?.();
});
const active: AdmissionStatus = {
  state: 'active',
  revision: 0,
  pendingItems: 0,
  pendingBytes: 0,
  reservedBytes: 0,
  durable: true,
  pressure: null,
};
const workspaceWith = (command: AdmittedWorkspace['command']) =>
  ({
    status: active,
    read: () => ({ master: '' }),
    onStatus: () => () => {},
    subscribe: () => () => {},
    retry: vi.fn(),
    discardPending: vi.fn(),
    command: vi.fn(command),
  }) as unknown as AdmittedWorkspace;
const render = async (workspace: AdmittedWorkspace) => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  // The compose field as Collection wires it: a falsy result keeps the draft.
  function Field() {
    const { execute } = useWorkspaceUi();
    return (
      <Compose
        placeholder="What got done?"
        onSubmit={async (text) =>
          Boolean(
            await execute({ kind: 'compose', to: { date: '2026-09-08', section: 'done' }, text }),
          )
        }
      />
    );
  }
  await act(async () =>
    root.render(
      <WorkspaceUiProvider
        workspace={workspace}
        actorId="test"
        onLock={() => {}}
        registerEditor={() => () => {}}
      >
        <Field />
      </WorkspaceUiProvider>,
    ),
  );
  cleanups.push(async () => {
    await act(async () => root.unmount());
    host.remove();
  });
  const field = host.querySelector('textarea')!;
  return {
    host,
    field,
    async submit(value: string) {
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
          field,
          value,
        );
        field.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await act(async () =>
        field.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
        ),
      );
      await act(async () => {});
    },
  };
};

for (const [label, command] of [
  [
    'a refused action',
    () => ({
      id: 1,
      accepted: Promise.resolve({
        id: 1,
        source: 'local' as const,
        revision: 1,
        slices: 1,
        value: TOO_LARGE_FOR_ONE_ACTION,
      }),
    }),
  ],
  [
    'an input over the one-action ceiling',
    () => {
      throw new ActionTooLarge();
    },
  ],
] as const)
  it(`${label} keeps the draft and says the text is too long, not that storage failed`, async () => {
    const page = await render(workspaceWith(command as unknown as AdmittedWorkspace['command']));
    await page.submit('a long draft');
    expect(page.field.value).toBe('a long draft');
    expect(page.field.readOnly).toBe(false);
    const status = page.host.querySelector('.workspace-status')?.textContent ?? '';
    expect(status).toContain(TOO_LARGE_FOR_ONE_ACTION_MESSAGE);
    expect(status).not.toContain('storage');
    expect(page.host.textContent).not.toContain('Waiting to save');
  });

it('removing Goals lines refused for too much text says so instead of nothing removed', async () => {
  const input = vi.fn(() => ({
    id: 1,
    accepted: Promise.resolve({ id: 1, value: TOO_LARGE_FOR_ONE_ACTION }),
  }));
  const workspace = {
    ...workspaceWith(() => {
      throw Error('unused');
    }),
    text: () => ({ read: () => ({ text: 'one\ntwo' }), input }),
  } as unknown as AdmittedWorkspace;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let result: unknown = 'not run';
  function Remove() {
    const { removeMasterLines } = useWorkspaceUi();
    return (
      <button
        onClick={() =>
          void removeMasterLines([0, 1], { feedback: 'local' }).then((r) => (result = r))
        }
      >
        Remove
      </button>
    );
  }
  await act(async () =>
    root.render(
      <WorkspaceUiProvider
        workspace={workspace}
        actorId="test"
        onLock={() => {}}
        registerEditor={() => () => {}}
      >
        <Remove />
      </WorkspaceUiProvider>,
    ),
  );
  cleanups.push(async () => {
    await act(async () => root.unmount());
    host.remove();
  });
  await act(async () => host.querySelector('button')!.click());
  await act(async () => {});
  expect(input).toHaveBeenCalledOnce();
  expect(result).toBeUndefined();
  expect(host.querySelector('.workspace-status')?.textContent).toContain(
    TOO_LARGE_FOR_ONE_ACTION_MESSAGE,
  );
});

it('an editor action refused for too much text says so and stays editable', async () => {
  const input = vi.fn<AdmittedTextSurface['input']>(() => ({
    id: 1,
    accepted: Promise.resolve({
      id: 1,
      source: 'local',
      revision: 1,
      slices: 1,
      value: TOO_LARGE_FOR_ONE_ACTION,
    } as never),
  }));
  const surface: AdmittedTextSurface = {
    status: active,
    read: () => ({
      text: 'line',
      selection: EditorSelection.single(0).toJSON(),
      undo: 1,
      redo: 1,
    }),
    input,
    subscribe: () => () => {},
    onStatus: () => () => {},
    retry() {},
    discardPending() {},
  };
  const parent = document.createElement('div');
  document.body.append(parent);
  const editor = createAdmittedEditor({ parent, document: surface });
  cleanups.push(() => {
    editor.destroy();
    parent.remove();
  });
  editor.view.contentDOM.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'y', ctrlKey: true, bubbles: true, cancelable: true }),
  );
  expect(input).toHaveBeenCalled();
  await Promise.resolve();
  await Promise.resolve();
  // The message, beside the editor's Retry/Discard buttons, which stay hidden.
  const message = parent.querySelector('[role=status] span')?.textContent ?? '';
  expect(message).toBe(TOO_LARGE_FOR_ONE_ACTION_MESSAGE);
  for (const button of parent.querySelectorAll('[role=status] button'))
    expect((button as HTMLButtonElement).hidden).toBe(true);
});
