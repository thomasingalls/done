import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { Compose } from '../src/ui/Compose';

const mount = async (onSubmit = vi.fn(async (_text: string) => true)) => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const render = () => root.render(<Compose placeholder="Quick entry" onSubmit={onSubmit} />);
  await act(async () => render());
  const field = host.querySelector('textarea')!;
  const button = host.querySelector('button')!;
  return {
    host,
    field,
    button,
    onSubmit,
    async type(value: string) {
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
          field,
          value,
        );
        field.dispatchEvent(new Event('input', { bubbles: true }));
      });
    },
    async composition(type: 'compositionstart' | 'compositionend') {
      await act(async () => field.dispatchEvent(new CompositionEvent(type, { bubbles: true })));
    },
    async enter(options: KeyboardEventInit = {}) {
      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
        ...options,
      });
      await act(async () => field.dispatchEvent(event));
      return event;
    },
    async rerender() {
      await act(async () => render());
    },
    async close() {
      await act(async () => root.unmount());
      host.remove();
    },
  };
};

for (const signal of ['native-composing', 'legacy-229', 'tracked-session'] as const) {
  it(`lets ${signal} Enter confirm input without submitting or clearing the draft`, async () => {
    const f = await mount();
    try {
      if (signal === 'tracked-session') await f.composition('compositionstart');
      await f.type('draft 候補');
      const event = await f.enter({
        isComposing: signal === 'native-composing',
        keyCode: signal === 'legacy-229' ? 229 : 13,
      });
      expect(event.defaultPrevented).toBe(false);
      expect(f.onSubmit).not.toHaveBeenCalled();
      expect(f.field.value).toBe('draft 候補');
      expect(f.field.readOnly).toBe(false);
      if (signal === 'tracked-session') await f.composition('compositionend');
      await f.type('draft 確定');
      await f.enter();
      expect(f.onSubmit).toHaveBeenCalledExactlyOnceWith('draft 確定');
      expect(f.field.value).toBe('');
    } finally {
      await f.close();
    }
  });
}

it('preserves a composing draft across unrelated rerenders and enables Add as input arrives', async () => {
  const f = await mount();
  try {
    expect(f.button.disabled).toBe(true);
    await f.composition('compositionstart');
    for (const text of ['h', 'hel', 'hello']) {
      await f.type(text);
      await f.rerender();
      expect(f.field.value).toBe(text);
      expect(f.button.disabled).toBe(false);
    }
    await f.composition('compositionend');
    await act(async () => f.button.click());
    expect(f.onSubmit).toHaveBeenCalledExactlyOnceWith('hello');
    expect(f.field.value).toBe('');
    expect(f.button.disabled).toBe(true);
  } finally {
    await f.close();
  }
});

it('releases a cancelled composition session when the field loses focus', async () => {
  const f = await mount();
  try {
    await act(async () => f.field.focus());
    await f.composition('compositionstart');
    await f.type('retained draft');
    await act(async () => f.field.blur());
    await act(async () => f.field.focus());
    await f.enter();
    expect(f.onSubmit).toHaveBeenCalledExactlyOnceWith('retained draft');
    expect(f.field.value).toBe('');
  } finally {
    await f.close();
  }
});

it('keeps multiline entry native and retains the draft until a submission is accepted', async () => {
  let finish!: (accepted: boolean) => void;
  const f = await mount(
    vi.fn(
      (_text: string) =>
        new Promise<boolean>((r) => {
          finish = r;
        }),
    ),
  );
  try {
    await f.type('line one');
    const newline = await f.enter({ shiftKey: true });
    expect(newline.defaultPrevented).toBe(false);
    expect(f.onSubmit).not.toHaveBeenCalled();
    // jsdom does not perform the textarea's native newline default action.
    await f.type('line one\nline two');
    await f.enter();
    expect(f.onSubmit).toHaveBeenCalledExactlyOnceWith('line one\nline two');
    expect(f.field.value).toBe('line one\nline two');
    expect(f.field.readOnly).toBe(true);
    expect(f.button.disabled).toBe(true);
    await f.enter();
    expect(f.onSubmit).toHaveBeenCalledTimes(1);
    await act(async () => finish(false));
    expect(f.field.value).toBe('line one\nline two');
    expect(f.field.readOnly).toBe(false);
    await act(async () => f.button.click());
    expect(f.onSubmit).toHaveBeenCalledTimes(2);
    await act(async () => finish(true));
    expect(f.field.value).toBe('');
  } finally {
    await f.close();
  }
});
