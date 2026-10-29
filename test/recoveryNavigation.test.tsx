/** Presentation/history only. Fake screen data never opens a native owner or grants authority. */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { AccountRecoveryApp } from '../src/ui/AccountRecoveryApp';
const mocks = vi.hoisted(() => ({
  factory: vi.fn(),
  navigation: vi.fn(),
  options: undefined as unknown as { visit: (step: string) => boolean; step: string | null },
}));
vi.mock('../src/ui/accountRecoveryWorker', () => ({ createWorkerAccountRecovery: mocks.factory }));
vi.mock('../src/ui/ceremonyNavigation', () => ({ useCeremonyNavigation: mocks.navigation }));
vi.mock('../src/ui/WorkspaceBackdrop', () => ({ WorkspaceBackdrop: () => null }));
vi.mock('../src/ui/DeviceDataRemoval', () => ({ RemoveFromDeviceButton: () => null }));
vi.mock('../src/ui/AccountDevices', () => ({ AccountDevices: () => null }));
vi.mock('../src/ui/App', () => ({ App: () => null }));
afterEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
});
it('save and immediate Back retain the same code without awaiting worker navigation acknowledgments', async () => {
  const pending: Array<() => void> = [],
    command = vi.fn((input: { command: string }) =>
      input.command === 'inspect'
        ? Promise.resolve()
        : new Promise<void>((resolve) => pending.push(resolve)),
    );
  const listeners = new Set<() => void>();
  let view = {
    step: 'save-code',
    generated: 'fictional-display-code',
    accountId: 'a'.repeat(43),
    error: '',
  };
  const owner = {
    getSnapshot: () => view,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    registerEditor: vi.fn(),
    close: vi.fn(async () => {}),
    command,
    visit: vi.fn(() => false),
  };
  mocks.factory.mockReturnValue(owner);
  mocks.navigation.mockImplementation((options) => {
    mocks.options = options;
    return { leaving: false, error: '', enabled: true, back: vi.fn() };
  });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <AccountRecoveryApp
          config={{ networkSessions: true } as never}
          slotId={'enrollment-' + '12'.repeat(16)}
          onNavigate={() => {}}
        />,
      ),
    );
    const saved = [...host.querySelectorAll('button')].find(
      (b) => b.textContent === 'I saved my unlock code',
    )!;
    await act(async () => saved.click());
    expect(host.querySelector('#device-lock-code')).not.toBeNull();
    expect(mocks.options.step).toBe('confirm-code');
    await act(async () => {
      expect(mocks.options.visit('save-code')).toBe(true);
    });
    expect(host.querySelector('[aria-label="Generated unlock code"]')?.textContent).toBe(
      'fictional-display-code',
    );
    expect(mocks.options.step).toBe('save-code');
    expect(command.mock.calls.map((v) => v[0].command)).toEqual(['inspect', 'savedCode', 'visit']);
    await act(async () => {
      view = { ...view, step: 'unlock', generated: '' };
      for (const listener of listeners) listener();
    });
    expect(host.querySelector('[aria-label="Generated unlock code"]')).toBeNull();
    expect(host.textContent).not.toContain('fictional-display-code');
  } finally {
    await act(async () => {
      for (const release of pending) release();
    });
    await act(async () => root.unmount());
  }
});
it('does not enable saved-code navigation while preparation is still awaiting its native reply', async () => {
  let view = { step: 'recovery-code', generated: '', accountId: 'a'.repeat(43), error: '' },
    release!: () => void;
  const listeners = new Set<() => void>();
  const command = vi.fn((input: { command: string }) =>
    input.command === 'prepare'
      ? new Promise<void>((resolve) => (release = resolve))
      : Promise.resolve(),
  );
  mocks.factory.mockReturnValue({
    getSnapshot: () => view,
    subscribe: (f: () => void) => {
      listeners.add(f);
      return () => {
        listeners.delete(f);
      };
    },
    registerEditor: vi.fn(),
    close: vi.fn(async () => {}),
    command,
    visit: vi.fn(() => false),
  });
  mocks.navigation.mockImplementation((options) => {
    mocks.options = options;
    return { leaving: false, error: '', enabled: true, back: vi.fn() };
  });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <AccountRecoveryApp
          config={{ networkSessions: true } as never}
          slotId={'enrollment-' + '12'.repeat(16)}
          onNavigate={() => {}}
        />,
      ),
    );
    await act(async () => {
      host
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await act(async () => {
      view = { ...view, step: 'save-code', generated: 'fictional-display-code' };
      for (const f of listeners) f();
    });
    const saved = [...host.querySelectorAll('button')].find(
      (b) => b.textContent === 'I saved my unlock code',
    )!;
    expect(saved.disabled).toBe(true);
    expect(mocks.options.visit('confirm-code')).toBe(false);
  } finally {
    await act(async () => release?.());
    await act(async () => root.unmount());
  }
});
it('closing a recovery view cannot expose an outgoing unlock input for the next flow', async () => {
  const view = { step: 'unlock', closing: true, generated: '', accountId: '', error: '' };
  mocks.factory.mockReturnValue({
    getSnapshot: () => view,
    subscribe: () => () => {},
    registerEditor: vi.fn(),
    command: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  });
  mocks.navigation.mockReturnValue({ leaving: false, error: '', enabled: true, back: vi.fn() });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <AccountRecoveryApp
          config={{ networkSessions: true } as never}
          slotId={'enrollment-' + '12'.repeat(16)}
          onNavigate={() => {}}
        />,
      ),
    );
    expect(host.querySelector('input[type=password]')).toBeNull();
    expect(host.textContent).toContain('Closing and finishing storage operations…');
  } finally {
    await act(async () => root.unmount());
  }
});
