/**
 * The menu (PRD §7.3).
 *
 * Search and a full calendar picker belong to Phase 4 — both want the SQLite
 * index that phase builds (TRD §6.2, §8.5). What is here is what this phase can
 * answer honestly: which day you are on and how to reach another one, whether
 * the browser has promised to keep the data, where it syncs to, which actor and
 * device this client is, and a way to get everything out as markdown.
 *
 * **The menu is the only place sync is visible.** PRD principle 3 puts offline
 * as the normal state rather than a degraded one: no reconnecting banner, no
 * spinner, nothing that interrupts writing to report on a network. Someone who
 * wants to know comes here and looks.
 *
 * The export is not decoration. It is the backup story (TRD §10.5) — the relay
 * is a pipe and explicitly not a backup — and "your data outlives the app" is a
 * ranked principle.
 */

import { useState, useSyncExternalStore } from 'react';
import {
  DEFAULT_ROOM,
  actorById,
  describeSyncAge,
  downloadExport,
  renameLocalDevice,
  setRolloverHour,
  updateActor,
  type Settings,
  type StoragePersistence,
  type Store,
  type SyncStatus,
} from '../crdt';
import { addDays, formatDayLong, relativeDay, type ISODate } from '../lib/date';
import { installHelp, readInstallState, requestInstall, subscribeToInstallState } from '../pwa';
import { useSyncState } from './useSync';
import { useYValue } from './useYjs';

const STORAGE_LABEL: Record<StoragePersistence, string> = {
  granted: 'Persistent',
  denied: 'Best-effort',
  unsupported: 'Unknown',
  unknown: 'Not yet asked',
};

const STORAGE_NOTE: Record<StoragePersistence, string> = {
  granted: 'The browser has agreed not to evict this data on its own.',
  denied:
    'The browser may evict this data under storage pressure. Export is the backup story until sync exists.',
  unsupported: 'This browser does not report whether storage is durable.',
  unknown: 'Durable storage is requested on your first edit.',
};

const SYNC_LABEL: Record<SyncStatus, string> = {
  disabled: 'Off',
  connecting: 'Connecting',
  connected: 'Connected',
  offline: 'Offline',
};

const SYNC_NOTE: Record<SyncStatus, string> = {
  disabled:
    'No relay configured. Everything works; nothing leaves this device. Sync is optional and the app is complete without it.',
  connecting: 'Reaching the relay. Nothing waits for this — keep writing.',
  connected: 'Changes go out as you make them, and arrive the same way.',
  offline:
    'Editing continues as normal. Changes are held locally and go out whole when the relay is reachable again.',
};

export interface MenuProps {
  store: Store;
  storage: StoragePersistence;
  persistenceError: Error | null;
  settings: Settings;
  today: ISODate;
  date: ISODate;
  onGoTo: (date: ISODate) => void;
  onClose: () => void;
  /** The shell measures the panel to turn a drag into a fraction of its width. */
  ref?: React.Ref<HTMLElement>;
}

/** A week either side, which is the range the plane is comfortable walking. */
const NEARBY = [-7, -2, -1, 0, 1, 2, 7];

export const Menu = ({
  store,
  storage,
  persistenceError,
  settings,
  today,
  date,
  onGoTo,
  onClose,
  ref,
}: MenuProps): React.ReactElement => {
  const installState = useSyncExternalStore(
    subscribeToInstallState,
    readInstallState,
    readInstallState,
  );
  const actor = useYValue(
    store.meta,
    () => JSON.stringify(actorById(store.doc, store.actor.id) ?? store.actor.actor),
    () => actorById(store.doc, store.actor.id) ?? store.actor.actor,
  );
  const sync = useSyncState(store.sync);

  // The relay's address, room and token are local and unsynced (TRD §4.8), so
  // they are edited as an ordinary form rather than through the document. The
  // draft is applied on submit: a half-typed endpoint should not cause a
  // connection attempt on every keystroke.
  const [draft, setDraft] = useState(() => ({
    endpoint: sync.config?.endpoint ?? '',
    room: sync.config?.room ?? DEFAULT_ROOM,
    token: sync.config?.token ?? '',
  }));
  const [deviceName, setDeviceName] = useState(store.actor.device.name);

  const changeDeviceName = (name: string): void => {
    setDeviceName(name);
    const device = renameLocalDevice(name);
    if (!device) return;
    store.actor.device.name = device.name;
    store.awareness.setLocalStateField('device', { id: device.id, name: device.name });
  };

  const changeActor = (patch: { name?: string; color?: string }): void => {
    const next = updateActor(store.doc, store.actor.origin, store.actor.id, patch);
    if (!next) return;
    Object.assign(store.actor.actor, next);
    store.awareness.setLocalStateField('user', {
      name: next.name,
      color: next.color,
      colorLight: `${next.color}33`,
    });
  };

  return (
    <aside className="menu" id="menu" aria-label="Menu" ref={ref}>
      <section className="menu-section">
        <h2 className="menu-heading">Day</h2>
        <p className="menu-note">{formatDayLong(date)}</p>
        <div className="menu-days">
          {NEARBY.map((offset) => {
            const target = addDays(today, offset);
            return (
              <button
                key={offset}
                type="button"
                className="menu-day"
                data-current={target === date}
                onClick={() => {
                  onGoTo(target);
                  onClose();
                }}
              >
                {relativeDay(target, today)}
              </button>
            );
          })}
        </div>
      </section>

      <section className="menu-section">
        <h2 className="menu-heading">Storage</h2>
        <div className="menu-row">
          <span>Local data</span>
          <span className="menu-value">
            {persistenceError ? 'Needs attention' : STORAGE_LABEL[storage]}
          </span>
        </div>
        <p className="menu-note" role={persistenceError ? 'alert' : undefined}>
          {persistenceError
            ? `A local write could not be fully protected. Export before closing this page. ${persistenceError.message}`
            : STORAGE_NOTE[storage]}
        </p>
        <button
          type="button"
          className="menu-button"
          onClick={() => downloadExport(store.doc, store.master.toString())}
        >
          Export markdown
        </button>
      </section>

      <section className="menu-section">
        <h2 className="menu-heading">Sync</h2>
        <div className="menu-row">
          <span>Relay</span>
          <span className="menu-value">
            <span className="sync-dot" data-status={sync.status} />
            {SYNC_LABEL[sync.status]}
          </span>
        </div>
        <div className="menu-row">
          <span>Last synced</span>
          <span className="menu-value">
            {describeSyncAge(sync.lastSyncedAt)}
            {sync.lastSyncedAt && sync.lastSyncedFrom ? `, from ${sync.lastSyncedFrom}` : ''}
          </span>
        </div>
        {sync.peers.length > 0 && (
          <div className="menu-row">
            <span>Also here</span>
            <span className="menu-value">{sync.peers.join(', ')}</span>
          </div>
        )}

        <form
          className="sync-form"
          onSubmit={(event) => {
            event.preventDefault();
            store.sync.configure({ ...draft, enabled: true });
          }}
        >
          <label className="sync-field">
            <span>Endpoint</span>
            <input
              className="sync-input"
              value={draft.endpoint}
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="wss://relay.example"
              aria-label="Relay endpoint"
              onChange={(event) => setDraft({ ...draft, endpoint: event.target.value })}
            />
          </label>
          <label className="sync-field">
            <span>Room</span>
            <input
              className="sync-input"
              value={draft.room}
              autoComplete="off"
              spellCheck={false}
              placeholder={DEFAULT_ROOM}
              aria-label="Relay room"
              onChange={(event) => setDraft({ ...draft, room: event.target.value })}
            />
          </label>
          <label className="sync-field">
            <span>Token</span>
            <input
              className="sync-input"
              type="password"
              value={draft.token}
              autoComplete="off"
              aria-label="Relay token"
              onChange={(event) => setDraft({ ...draft, token: event.target.value })}
            />
          </label>
          <div className="sync-actions">
            <button type="submit" className="menu-button">
              {sync.config ? 'Save and connect' : 'Connect'}
            </button>
            {sync.config?.enabled === true && (
              <button type="button" className="menu-button" onClick={() => store.sync.disconnect()}>
                Pause
              </button>
            )}
            {sync.config && (
              <button
                type="button"
                className="menu-button"
                onClick={() => {
                  store.sync.configure(null);
                  setDraft({ endpoint: '', room: DEFAULT_ROOM, token: '' });
                }}
              >
                Forget
              </button>
            )}
          </div>
        </form>

        {sync.error !== null && <output className="menu-note">{sync.error}</output>}
        <p className="menu-note">{SYNC_NOTE[sync.status]}</p>
      </section>

      <section className="menu-section">
        <h2 className="menu-heading">This client</h2>
        <div className="menu-row">
          <span>Version</span>
          <span className="menu-value">{import.meta.env['VITE_APP_VERSION']}</span>
        </div>
        <div className="menu-row">
          <span>Commit date</span>
          <time className="menu-value" dateTime={import.meta.env['VITE_APP_COMMIT_DATE']}>
            {import.meta.env['VITE_APP_COMMIT_DATE']}
          </time>
        </div>
        <div className="menu-row">
          <span>Actor</span>
          <span className="menu-value">
            <span
              className="actor-swatch"
              style={{ '--actor-color': actor.color } as React.CSSProperties}
            />
            {actor.name}
          </span>
        </div>
        <label className="menu-row">
          <span>Device</span>
          <input
            className="menu-input"
            value={deviceName}
            aria-label="Device name"
            onChange={(event) => changeDeviceName(event.target.value)}
          />
        </label>
        <label className="menu-row">
          <span>Name</span>
          <input
            className="menu-input"
            value={actor.name}
            aria-label="Actor name"
            onChange={(event) => changeActor({ name: event.target.value })}
          />
        </label>
        <label className="menu-row">
          <span>Color</span>
          <input
            className="menu-color"
            type="color"
            value={actor.color}
            aria-label="Actor color"
            onChange={(event) => changeActor({ color: event.target.value })}
          />
        </label>
        <label className="menu-row">
          <span>Day rollover</span>
          <select
            className="menu-input"
            value={settings.rolloverHour}
            aria-label="Day rollover hour"
            onChange={(event) => {
              setRolloverHour(
                store.doc,
                store.meta,
                store.actor.origin,
                Number(event.target.value),
              );
            }}
          >
            {Array.from({ length: 24 }, (_, hour) => (
              <option key={hour} value={hour}>
                {String(hour).padStart(2, '0')}:00
              </option>
            ))}
          </select>
        </label>
      </section>

      {installState !== 'installed' && (
        <section className="menu-section">
          <h2 className="menu-heading">Install</h2>
          <p className="menu-note">
            {installState === 'available'
              ? 'Give done its own app window and launch it directly from your home screen.'
              : installHelp()}
          </p>
          {installState === 'available' && (
            <button type="button" className="menu-button" onClick={() => void requestInstall()}>
              Install app
            </button>
          )}
        </section>
      )}

      <section className="menu-section">
        <h2 className="menu-heading">Phase 3</h2>
        <p className="menu-note">
          Sync: a self-hosted relay carrying opaque updates between your own devices. No search yet
          — that is Phase 4.
        </p>
      </section>
    </aside>
  );
};
