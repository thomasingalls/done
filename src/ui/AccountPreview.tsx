import { useEffect, useMemo, useState } from 'react';
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
} from '../account/firstDeviceSetup';
import { Setup } from './AccountSetupApp';
import { AccountEnrollmentApp } from './AccountEnrollmentApp';
import { AccountSignIn } from './AccountSignIn';
import { LocalApp } from './LocalApp';
import { Welcome } from './Welcome';
import { PreviewNavigationContext } from './ceremonyNavigation';

const ACCESS_CHOICE = 'done.account-setup.access-choice';
const ACCESS_SLOT = 'done.account-setup.selected-slot';

/** One preview router shared by old HTML entry points and ordinary browser navigation. */
export async function createAccountPreview(config: SetupConfig) {
  const history = createBrowserHistory();
  let entry = location.pathname + location.search;
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
    if (entry.startsWith('/connect/') && entry !== '/connect/choose') {
      history.push('/connect/choose', navigationState);
      history.flush();
    }
    history.push(entry, navigationState);
  } else history.replace(entry, navigationState);
  history.flush();

  // Only non-secret name drafts live across chooser visits. Credential displays
  // belong to the mounted owner, not router data, loaders or history entries.
  const names = new Map<string, string>();
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
  const router = createRouter({
    history,
    routeTree: root.addChildren([
      welcome,
      accounts,
      local.addChildren([
        createRoute({ getParentRoute: () => local, path: '$step', component: () => null }),
      ]),
      setup.addChildren([
        createRoute({ getParentRoute: () => setup, path: '$step', component: () => null }),
      ]),
      connect.addChildren([
        createRoute({ getParentRoute: () => connect, path: '$step', component: () => null }),
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
    void go(`/setup/${slot}/inspect`);
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
    const context = useMemo(() => ({ history, href: active.href, go }), [active.href]);
    return (
      <PreviewNavigationContext value={context}>
        <div className="account-development">
          <aside className="setup-dev-note">Account preview · encrypted two-device sync</aside>
          <Outlet />
        </div>
      </PreviewNavigationContext>
    );
  }
  function Splash() {
    return (
      <Welcome
        onChooseAccount={choose}
        onCreateLocal={() => {
          beginLocal = true;
          openLocal();
        }}
      />
    );
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
        onCreate={async () => select(await beginNewAccount(config))}
        onRestore={restore}
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
        beginOnFresh={requested}
        onChooseAccount={choose}
        onConnectAccount={(name) => {
          names.set('local', name);
          select('local');
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
        onName={(name) => names.set(slotId, name)}
        onBack={openLocal}
        onLock={lock}
        onOtherAccount={choose}
      />
    );
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
        onNavigate={(href) => {
          void go(href);
        }}
      />
    );
  }
  return <RouterProvider router={router} />;
}
