import { newConnectionHref } from '../account/connectionNavigation';
import { isRecoverySlot } from '../account/lostRecoveryRoutes';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import {
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useLocation,
} from '@tanstack/react-router';
import {
  beginNewAccount,
  hasFirstDeviceSetup,
  isSetupSlot,
  rememberedAccounts,
  type SetupConfig,
} from '../account/setupProgress';
const Setup = lazy(() => import('./AccountSetupApp').then((module) => ({ default: module.Setup })));
// Device connection is loaded on that route; its assets are still precached for offline navigation.
const AccountEnrollmentApp = lazy(() =>
  import('./AccountEnrollmentApp').then((module) => ({ default: module.AccountEnrollmentApp })),
);
const AccountRecoveryApp = lazy(() =>
  import('./AccountRecoveryApp').then((module) => ({ default: module.AccountRecoveryApp })),
);
import { AccountSignIn } from './AccountSignIn';
const LocalApp = lazy(() => import('./LocalApp').then((module) => ({ default: module.LocalApp })));
import { AppUpdateNotice } from './AppUpdateNotice';
import { PreviewNavigationContext } from './ceremonyNavigation';
import { rememberedDeviceConnections } from '../account/deviceConnectionRoutes';
import { rememberedRecoveryRoutes } from '../account/lostRecoveryRoutes';
const DeviceDataRemoval = lazy(() =>
  import('./DeviceDataRemoval').then((module) => ({ default: module.DeviceDataRemoval })),
);

const ACCESS_CHOICE = 'done.account-setup.access-choice';
const ACCESS_SLOT = 'done.account-setup.selected-slot';

/** One preview router shared by old HTML entry points and ordinary browser navigation. */
export async function createAccountPreview(
  config: SetupConfig,
  initial?: { entry: string; name?: string; code?: string },
) {
  const history = createBrowserHistory();
  let entry = location.pathname + location.search;
  if (initial) entry = initial.entry;
  if (location.pathname === '/private/account-enrollment.html')
    entry = '/connect/' + (location.search ? 'prepare' : 'choose') + location.search;
  else if (['/private/account-setup.html', '/local.html'].includes(location.pathname)) {
    let selected: string | null = null;
    let choosing = false;
    try {
      selected = sessionStorage.getItem(ACCESS_SLOT);
      choosing = sessionStorage.getItem(ACCESS_CHOICE) === 'choose';
    } catch {
      /* Selection hints are optional. */
    }
    if (!isSetupSlot(selected)) selected = null;
    const target = selected ?? 'local';
    const resolved = await Promise.all([
      hasFirstDeviceSetup(target),
      rememberedAccounts(config.pin),
    ]).catch(() => null);
    if (!resolved) {
      history.destroy();
      return (
        <main className="local-startup">
          <p role="alert">Saved setup could not be read. Your browser data has been kept.</p>
          <a href="/">Return to done</a>
        </main>
      );
    }
    const [pending, accounts] = resolved;
    entry =
      choosing ||
      (!selected && accounts.length > 1) ||
      (!pending && accounts.length > 0 && selected !== 'local')
        ? '/accounts'
        : pending
          ? `/setup/${target}/inspect`
          : '/local/fresh';
  } else if (location.pathname === '/index.html') entry = '/';

  // A link opened from another site gets an internal Back destination. Reloads
  // keep their existing stack. These are navigation hints, never credentials.
  const navigationState = { donePreview: true };
  if (!(history.location.state as { donePreview?: boolean }).donePreview && entry !== '/') {
    history.replace('/', navigationState);
    history.flush();
    if (entry !== '/accounts') {
      history.push('/accounts', navigationState);
      history.flush();
    }
    if (
      (entry.startsWith('/connect/') && entry !== '/connect/choose') ||
      entry.startsWith('/recover/')
    ) {
      history.push('/connect/choose', navigationState);
      history.flush();
    }
    history.push(entry, navigationState);
  } else history.replace(entry, navigationState);
  history.flush();

  // Only non-secret name drafts live across chooser visits. Credential displays
  // belong to the mounted owner, not router data, loaders or history entries.
  const names = new Map<string, string>();
  const syncCodes = new Map<string, string>();
  if (initial?.name) names.set('local', initial.name);
  if (initial?.code) syncCodes.set('local', initial.code);
  let beginLocal = false;
  const root = createRootRoute({ component: Frame });
  const welcome = createRoute({ getParentRoute: () => root, path: '/', component: Splash });
  const accounts = createRoute({
    getParentRoute: () => root,
    path: '/accounts',
    component: Accounts,
  });
  const local = createRoute({ getParentRoute: () => root, path: '/local', component: Local });
  const setup = createRoute({
    getParentRoute: () => root,
    path: '/setup/$slotId',
    component: Account,
  });
  const connect = createRoute({ getParentRoute: () => root, path: '/connect', component: Connect });
  const recover = createRoute({
    getParentRoute: () => root,
    path: '/recover/$slotId',
    component: Recover,
  });
  const remove = createRoute({
    getParentRoute: () => root,
    path: '/remove/$slotId',
    component: Remove,
  });
  const router = createRouter({
    history,
    routeTree: root.addChildren([
      welcome,
      accounts,
      remove,
      local.addChildren([
        createRoute({ getParentRoute: () => local, path: '$step', component: () => null }),
      ]),
      setup.addChildren([
        createRoute({ getParentRoute: () => setup, path: '$step', component: () => null }),
      ]),
      connect.addChildren([
        createRoute({ getParentRoute: () => connect, path: '$step', component: () => null }),
      ]),
      recover.addChildren([
        createRoute({ getParentRoute: () => recover, path: '$step', component: () => null }),
      ]),
    ]),
    defaultPreload: false,
    defaultPendingComponent: () => <p role="status">Opening…</p>,
    defaultNotFoundComponent: () => <a href="/">Return to done</a>,
  });
  const go = async (href: string, replace = false, settled = false) => {
    await router.navigate({
      href,
      replace,
      ignoreBlocker: settled,
      state: (previous) => ({ ...previous, ...navigationState }),
    });
  };
  const choose = () => {
    try {
      sessionStorage.setItem(ACCESS_CHOICE, 'choose');
    } catch {
      /* Optional hint. */
    }
    void go('/accounts');
  };
  const select = (slot: string) => {
    if (!isSetupSlot(slot)) return;
    try {
      sessionStorage.removeItem(ACCESS_CHOICE);
      sessionStorage.setItem(ACCESS_SLOT, slot);
    } catch {
      /* Optional hint. */
    }
    return go(`/setup/${slot}/inspect`);
  };
  const createAccount = async () => {
    await select(await beginNewAccount(config));
  };
  const openLocal = () => {
    try {
      sessionStorage.removeItem(ACCESS_CHOICE);
      sessionStorage.setItem(ACCESS_SLOT, 'local');
    } catch {
      /* Optional hint. */
    }
    void go('/local/fresh');
  };
  function Frame() {
    const active = useLocation();
    useEffect(() => {
      if (!active.pathname.startsWith('/setup/local/')) syncCodes.clear();
    }, [active.pathname]);
    useEffect(() => {
      const retire = () => syncCodes.clear();
      window.addEventListener('pagehide', retire);
      return () => window.removeEventListener('pagehide', retire);
    }, []);
    const [offline, setOffline] = useState(!navigator.onLine);
    useEffect(() => {
      const update = () => setOffline(!navigator.onLine);
      window.addEventListener('online', update);
      window.addEventListener('offline', update);
      return () => {
        window.removeEventListener('online', update);
        window.removeEventListener('offline', update);
      };
    }, []);
    const context = useMemo(() => ({ history, href: active.href, go }), [active.href]);
    return (
      <PreviewNavigationContext value={context}>
        <div className="account-application">
          {offline && (
            <aside className="account-offline-note" role="status">
              Offline. Saved workspaces remain available; sync resumes when connected.
            </aside>
          )}
          {active.pathname !== '/' &&
            !active.pathname.startsWith('/local') &&
            !/\/(ready|editing)$/.test(active.pathname) && <AppUpdateNotice setup />}
          <Suspense fallback={<p role="status">Opening…</p>}>
            <Outlet />
          </Suspense>
        </div>
      </PreviewNavigationContext>
    );
  }
  function Splash() {
    const [target, setTarget] = useState<'local' | 'accounts' | string | null>(null);
    useEffect(() => {
      let live = true;
      void rememberedAccounts(config.pin)
        .then(async (accounts) => {
          let selected: string | null = null;
          try {
            selected = sessionStorage.getItem(ACCESS_SLOT);
          } catch {
            /* optional selection */
          }
          const saved = accounts.find((account) => account.slotId === selected);
          const otherSaved =
            rememberedDeviceConnections().length > 0 ||
            rememberedRecoveryRoutes(config.pin).length > 0;
          const destination =
            saved?.slotId ??
            (accounts.length > 1 || otherSaved ? 'accounts' : (accounts[0]?.slotId ?? 'local'));
          if (live) setTarget(destination);
        })
        .catch(() => {
          if (live) setTarget('accounts');
        });
      return () => {
        live = false;
      };
    }, []);
    useEffect(() => {
      if (target === 'accounts') choose();
      else if (target && target !== 'local') select(target);
      else if (target === 'local')
        void hasFirstDeviceSetup('local').then((pending) => {
          if (pending) select('local');
          else openLocal();
        });
    }, [target]);
    return <p role="status">Opening your saved list…</p>;
  }
  function Accounts() {
    const [epoch, setEpoch] = useState(0);
    const [restore] = useState(() => () => setEpoch((value) => value + 1));
    return (
      <AccountSignIn
        key={epoch}
        config={config}
        onSelect={select}
        onOpenLocal={openLocal}
        onCreate={createAccount}
        onRestore={restore}
        onRecover={(slot) => {
          void go(`/recover/${slot}/unlock`);
        }}
        onConnect={(workspace) => {
          void go('/connect/' + (workspace ? 'unlock?workspace=' + workspace : 'choose'));
        }}
      />
    );
  }
  function Local() {
    const [requested] = useState(beginLocal);
    useEffect(() => {
      beginLocal = false;
    }, []);
    return (
      <LocalApp
        onCreateWorkspace={createAccount}
        beginOnFresh={requested}
        onChooseAccount={choose}
        onConnectAccount={(name, code) => {
          names.set('local', name);
          if (code) syncCodes.set('local', code);
          select('local');
        }}
        onConnectExisting={() => {
          void go('/connect/choose');
        }}
      />
    );
  }
  function Account() {
    const { slotId } = setup.useParams();
    const [lockEpoch, setLockEpoch] = useState(0);
    const [lock] = useState(() => () => setLockEpoch((value) => value + 1));
    if (!isSetupSlot(slotId)) return <p role="alert">Choose a saved account to continue.</p>;
    return (
      <Setup
        key={`${slotId}:${lockEpoch}`}
        config={config}
        slotId={slotId}
        initialName={names.get(slotId) ?? ''}
        takeInitialCode={() => {
          const code = syncCodes.get(slotId);
          syncCodes.delete(slotId);
          return code;
        }}
        onName={(name) => names.set(slotId, name)}
        onBack={openLocal}
        onLock={lock}
        onOtherAccount={choose}
        onConnectDevice={() => {
          void go(newConnectionHref(slotId));
        }}
      />
    );
  }
  function Remove() {
    const { slotId } = remove.useParams();
    if (!(isSetupSlot(slotId) || /^enrollment-[a-f0-9]{32}$/.test(slotId)))
      return <p role="alert">Choose a saved workspace to remove.</p>;
    return <DeviceDataRemoval slotId={slotId} onBack={choose} onStartFresh={openLocal} />;
  }
  function Connect() {
    const active = useLocation();
    const search = new URL(active.href, location.origin).search;
    const query = new URLSearchParams(search);
    // Different participants always get different owner lifetimes.
    return (
      <AccountEnrollmentApp
        key={search}
        config={config}
        workspace={query.get('workspace')}
        selectedSlot={query.get('slot')}
        invitation={query.get('invitation')}
        begin={query.get('begin')}
        onNavigate={(href) => {
          void go(href);
        }}
      />
    );
  }
  function Recover() {
    const { slotId } = recover.useParams();
    if (!isRecoverySlot(slotId))
      return <p role="alert">Choose saved recovery or start from Use another account.</p>;
    return (
      <AccountRecoveryApp
        key={slotId}
        config={config}
        slotId={slotId}
        onNavigate={(href) => {
          void go(href);
        }}
      />
    );
  }
  return <RouterProvider router={router} />;
}
