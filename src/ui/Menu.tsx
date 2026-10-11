import { SyncNotice } from './SyncNotice';
import { AccountHistory } from './AccountHistory';
import { NetworkLoginNotice } from './NetworkLoginNotice';
/** Local navigation, explicit preferences, recovery export and lock. */
import { useState, useSyncExternalStore } from 'react';
import { exportFilename } from '../crdt/export';
import { addDays, formatDayLong, relativeDay, type ISODate } from '../lib/date';
import { installHelp, readInstallState, requestInstall, subscribeToInstallState } from '../pwa';
import { useWorkspaceUi } from './workspaceUi';
import { AppUpdateNotice } from './AppUpdateNotice';
import { AccountIdentity } from './AccountIdentity';

export interface MenuProps {
  today: ISODate;
  date: ISODate;
  onGoTo: (date: ISODate) => void;
  onClose: () => void;
  ref?: React.Ref<HTMLElement>;
}
const NEARBY = [-7, -2, -1, 0, 1, 2, 7];
export const Menu = ({ today, date, onGoTo, onClose, ref }: MenuProps) => {
  const {
    workspace,
    snapshot,
    actorId,
    execute,
    lock,
    storage,
    connectAccount,
    accountWorkspace,
    accountId,
    switchAccount,
    networkLogin,
    showDevices,
    devices,
    sync,
  } = useWorkspaceUi();
  const installState = useSyncExternalStore(
    subscribeToInstallState,
    readInstallState,
    readInstallState,
  );
  const actor = snapshot.actors.find((value) => value.id === actorId)!;
  const [name, setName] = useState(actor.name);
  const [deviceName, setDeviceName] = useState(snapshot.deviceName);
  const [color, setColor] = useState(actor.color);
  const [rollover, setRollover] = useState(snapshot.settings.rolloverHour);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState('');
  const [exportError, setExportError] = useState('');
  const save = async () => {
    if (saving) return;
    setSaving(true);
    setSaved('');
    try {
      const changedActor = name !== actor.name || color !== actor.color;
      if (
        deviceName !== snapshot.deviceName &&
        !(await execute({ kind: 'device-label', name: deviceName }))
      )
        return;
      if (changedActor && !(await execute({ kind: 'actor', patch: { name, color } }))) return;
      if (
        rollover !== snapshot.settings.rolloverHour &&
        !(await execute({ kind: 'settings', rolloverHour: rollover }))
      )
        return;
      setSaved('Preferences saved.');
    } finally {
      setSaving(false);
    }
  };
  const download = () => {
    try {
      const bytes = workspace.exportArchive();
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/zip' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = exportFilename();
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      bytes.fill(0);
      setExportError('');
    } catch {
      setExportError('The export could not be created. Reopen the workspace and try again.');
    }
  };
  return (
    <aside className="menu" id="menu" aria-label="Menu" ref={ref}>
      <AppUpdateNotice />
      <section className="menu-section">
        <h2 className="menu-heading">Day</h2>
        <p className="menu-note">{formatDayLong(date)}</p>
        <div className="menu-days">
          {NEARBY.map((offset) => {
            const target = addDays(today, offset);
            return (
              <button
                key={offset}
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
        <label className="menu-row">
          Go to date
          <input
            className="menu-input"
            type="date"
            aria-label="Go to date"
            value={date}
            onChange={(e) => {
              if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) onGoTo(e.target.value as ISODate);
            }}
          />
        </label>
      </section>
      <section className="menu-section">
        <h2 className="menu-heading">Storage</h2>
        <div className="menu-row">
          <span>Local data</span>
          <span className="menu-value">{storage}</span>
        </div>
        <p className="menu-note">
          Writing is encrypted in this browser. Export a readable backup when you need one.
        </p>
        <button className="menu-button" onClick={download}>
          Export markdown
        </button>
        {exportError && (
          <p role="alert" className="menu-note">
            {exportError}
          </p>
        )}
        <button className="menu-button" onClick={lock}>
          Lock workspace
        </button>
        <div className="menu-days">
          <button
            className="menu-day"
            disabled={!snapshot.undo}
            onClick={() => void execute({ kind: 'undo' })}
          >
            Undo
          </button>
          <button
            className="menu-day"
            disabled={!snapshot.redo}
            onClick={() => void execute({ kind: 'redo' })}
          >
            Redo
          </button>
        </div>
      </section>
      <section className="menu-section">
        <h2 className="menu-heading">{accountWorkspace ? 'Account' : 'Sync'}</h2>
        {accountWorkspace && (
          <div className="menu-row">
            <span>Name</span>
            <span className="menu-value">{actor.name}</span>
          </div>
        )}
        {accountId && <AccountIdentity id={accountId} />}
        {sync && (
          <SyncNotice sync={sync} {...(networkLogin ? { login: networkLogin } : {})} details />
        )}
        {showDevices && (
          <button className="menu-button" onClick={showDevices}>
            Devices
          </button>
        )}
        {devices?.history && <AccountHistory run={devices.history} />}
        {switchAccount && (
          <button className="menu-button" onClick={switchAccount}>
            Use another account
          </button>
        )}
        {devices?.detached ? (
          <p className="menu-note" role="status">
            Removed from account. This local copy can be edited and exported, but it no longer
            syncs.
          </p>
        ) : (
          networkLogin && <NetworkLoginNotice login={networkLogin} close={switchAccount ?? lock} />
        )}
        {!networkLogin && !devices?.detached && (
          <p className="menu-note">
            {accountWorkspace
              ? 'Account connected. Approved devices can sync writing.'
              : 'Off. This Local workspace is not connected to a relay.'}
          </p>
        )}
        {connectAccount && (
          <button className="menu-button" onClick={connectAccount}>
            Connect this workspace
          </button>
        )}
      </section>
      <section className="menu-section">
        <h2 className="menu-heading">Identity and preferences</h2>
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
        <div className="menu-row">
          <span>Version</span>
          <span className="menu-value">{import.meta.env['VITE_APP_VERSION']}</span>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label className="menu-row">
            <span>Device</span>
            <input
              className="menu-input"
              value={deviceName}
              aria-label="Device name"
              disabled={saving}
              onChange={(e) => setDeviceName(e.target.value)}
            />
          </label>
          <label className="menu-row">
            <span>Name</span>
            <input
              className="menu-input"
              value={name}
              aria-label="Actor name"
              disabled={saving}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="menu-row">
            <span>Color</span>
            <input
              className="menu-color"
              type="color"
              value={color}
              aria-label="Actor color"
              disabled={saving}
              onChange={(e) => setColor(e.target.value)}
            />
          </label>
          <label className="menu-row">
            <span>Day rollover</span>
            <select
              className="menu-input"
              value={rollover}
              aria-label="Day rollover hour"
              disabled={saving}
              onChange={(e) => setRollover(Number(e.target.value))}
            >
              {Array.from({ length: 24 }, (_, hour) => (
                <option key={hour} value={hour}>
                  {String(hour).padStart(2, '0')}:00
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="menu-button" disabled={saving}>
            {saving ? 'Saving…' : 'Save preferences'}
          </button>
          {saved && (
            <p role="status" className="menu-note">
              {saved}
            </p>
          )}
        </form>
      </section>
      {installState !== 'installed' && (
        <section className="menu-section">
          <h2 className="menu-heading">Install</h2>
          <p className="menu-note">{installHelp()}</p>
          {installState === 'available' && (
            <button className="menu-button" onClick={() => void requestInstall()}>
              Install app
            </button>
          )}
        </section>
      )}
    </aside>
  );
};
