import { MenuSection } from './MenuSection';
import { SyncNotice } from './SyncNotice';
import { AccountHistory } from './AccountHistory';
import { NetworkLoginNotice } from './NetworkLoginNotice';
/** Local navigation, explicit preferences, recovery export and lock. */
import { useState } from 'react';
import { exportFilename } from '../crdt/export';
import { addDays, formatDayLong, relativeDay, type ISODate } from '../lib/date';
import { useWorkspaceUi } from './workspaceUi';
import { AppUpdateNotice } from './AppUpdateNotice';
import { AccountIdentity } from './AccountIdentity';
import { deviceCode } from '../account/deviceRoster';
import { InstallPanel } from './InstallPanel';
import { RemoveFromDeviceButton } from './DeviceDataRemoval';

export interface MenuProps {
  today: ISODate;
  date: ISODate;
  onGoTo: (date: ISODate) => void;
  onClose: () => void;
  ref?: React.Ref<HTMLElement>;
}
const NEARBY = [-1, 0, 1];
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
    protection,
    protect,
    slotId,
  } = useWorkspaceUi();
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
      <AppUpdateNotice beforeReload={workspace.whenDurable} />
      <nav className="menu-section menu-date-nav" aria-label="Day">
        <label className="menu-date-control">
          <span>{formatDayLong(date)}</span>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M7 3v4m10-4v4M3 11h18" />
          </svg>
          {/* The full-size native control owns pointer and keyboard activation, including
              browsers without showPicker. Its label supplies the compact ghost appearance. */}
          <input
            className="menu-native-date"
            type="date"
            aria-label="Go to date"
            value={date}
            onChange={(event) => {
              if (/^\d{4}-\d{2}-\d{2}$/.test(event.target.value)) {
                onGoTo(event.target.value as ISODate);
                onClose();
              }
            }}
          />
        </label>
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
      </nav>
      <MenuSection title="Account">
        {accountId && <AccountIdentity id={accountId} />}
        <div className="menu-group">
          <h3 className="menu-subheading">Identity and preferences</h3>
          <div className="menu-metadata">
            <div className="menu-row">
              <span>User</span>
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
          </div>
          <form
            className="menu-preferences"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <label className="menu-field">
              <span>Device</span>
              <input
                className="menu-input"
                value={deviceName}
                aria-label="Device name"
                disabled={saving}
                onChange={(e) => setDeviceName(e.target.value)}
              />
            </label>
            {accountWorkspace && (
              <div className="menu-row">
                <span>Device code</span>
                <code className="menu-value" aria-label="Device code" title={snapshot.deviceId}>
                  {deviceCode(snapshot.deviceId)}
                </code>
              </div>
            )}
            <label className="menu-field">
              <span>Name</span>
              <input
                className="menu-input"
                value={name}
                aria-label="User name"
                disabled={saving}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <div className="menu-preference-pair">
              <label className="menu-field">
                <span>Color</span>
                <input
                  className="menu-color"
                  type="color"
                  value={color}
                  aria-label="User color"
                  disabled={saving}
                  onChange={(e) => setColor(e.target.value)}
                />
              </label>
              <label className="menu-field">
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
            </div>
            <button type="submit" className="menu-button" disabled={saving}>
              {saving ? 'Saving…' : 'Save preferences'}
            </button>
            {saved && (
              <p role="status" className="menu-note">
                {saved}
              </p>
            )}
          </form>
        </div>
        <div className="menu-group">
          <h3 className="menu-subheading">Protection</h3>

          <p className="menu-note">
            {protection === 'automatic'
              ? 'Opens automatically. Anyone using this browser can open your list.'
              : 'Unlock code enabled. Your local copy requires an unlock code.'}
          </p>
          {protection === 'automatic' ? (
            <button className="menu-button" onClick={protect}>
              Add an unlock code
            </button>
          ) : (
            <button className="menu-button" onClick={lock}>
              Lock workspace
            </button>
          )}
        </div>
        <div className="menu-group">
          <h3 className="menu-subheading">On this device</h3>
          {showDevices && (
            <button className="menu-button" onClick={showDevices}>
              Devices
            </button>
          )}
          {switchAccount && (
            <button className="menu-button" onClick={switchAccount}>
              Use another account
            </button>
          )}
          {networkLogin && !devices?.detached && (
            <>
              {switchAccount && (
                <p className="menu-note">
                  Use another account keeps this account’s login remembered. Sign out ends that
                  login. Both keep your writing on this device.
                </p>
              )}
              <NetworkLoginNotice login={networkLogin} close={switchAccount ?? lock} />
            </>
          )}
          <RemoveFromDeviceButton slotId={slotId} />
        </div>
      </MenuSection>
      <MenuSection title="Sync">
        {sync && (
          <SyncNotice sync={sync} {...(networkLogin ? { login: networkLogin } : {})} details />
        )}
        {devices?.detached ? (
          <p className="menu-note" role="status">
            Removed from account. This local copy can be edited and exported, but it no longer
            syncs.
          </p>
        ) : (
          !networkLogin && (
            <p className="menu-note">
              {accountWorkspace
                ? 'Account connected. Approved devices can sync writing.'
                : 'Saved only in this browser. Sync is off.'}
            </p>
          )
        )}
        {connectAccount && (
          <button className="menu-button" onClick={connectAccount}>
            Set up sync
          </button>
        )}
      </MenuSection>
      <MenuSection title="Data">
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
        {devices?.history && <AccountHistory run={devices.history} />}
      </MenuSection>
      <InstallPanel />
    </aside>
  );
};
