import { useEffect, useRef, useState } from 'react';
import type { DeviceRosterSnapshot } from '../account/deviceRoster';
import { useWorkspaceUi } from './workspaceUi';
import { AccountIdentity } from './AccountIdentity';

/** Membership comes only from the account owner. Editable labels never establish membership. */
export function AccountDevices({
  onBack,
  onConnect,
  continuationAvailable = false,
}: {
  onBack(): void;
  onConnect(): void;
  continuationAvailable?: boolean;
}) {
  const { devices, snapshot, accountId } = useWorkspaceUi();
  const [roster, setRoster] = useState<DeviceRosterSnapshot | null>(null);
  const [error, setError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    let live = true;
    heading.current?.focus();
    void devices?.read().then(
      (value) => {
        if (live) setRoster(value);
      },
      () => {
        if (live)
          setError('The saved device list could not be verified. Your writing has been kept.');
      },
    );
    return () => {
      live = false;
    };
  }, [devices]);
  return (
    <main className="local-startup" aria-label="Devices">
      <section className="local-startup-panel setup-panel">
        <p className="local-brand">done</p>
        <h1 ref={heading} tabIndex={-1}>
          Devices
        </h1>
        {accountId && <AccountIdentity id={accountId} />}
        <p>
          Devices in this account’s last verified state, saved on this device. Changes made
          elsewhere may not appear here yet.
        </p>
        {error ? (
          <p role="alert">{error}</p>
        ) : !roster ? (
          <p role="status">Reading saved devices…</p>
        ) : (
          <>
            <ul className="account-device-list">
              {roster.devices.map((device) => (
                <li key={device.id} data-device-state={device.state}>
                  <h2>
                    {device.id === roster.currentDevice
                      ? snapshot.deviceName === 'This device'
                        ? 'This device'
                        : snapshot.deviceName + ' · This device'
                      : 'Device ' + device.id.slice(0, 8)}
                  </h2>
                  <p>
                    {device.state === 'certified'
                      ? 'Approved for content and sync'
                      : 'Enrollment pending · Not yet certified for sync'}
                  </p>
                  <p className="setup-note">
                    {device.id === roster.currentDevice
                      ? 'Protected here by your device-lock code.'
                      : 'Key-storage details are not recorded for this device.'}
                  </p>
                </li>
              ))}
            </ul>
            <button
              className="setup-primary"
              onClick={onConnect}
              disabled={roster.epoch > 1 && !(continuationAvailable && roster.epoch <= 4)}
            >
              {roster.devices.some((d) => d.state === 'pending')
                ? 'Resume connection'
                : 'Connect another device'}
            </button>
            {roster.epoch > 1 && !(continuationAvailable && roster.epoch <= 4) && (
              <p className="setup-note">
                Additional device connections are not available yet in this preview.
              </p>
            )}
            <p className="setup-note">
              Device removal is not available yet. Existing device access has not changed.
            </p>
          </>
        )}
        <button className="local-secondary" onClick={onBack}>
          Back to writing
        </button>
      </section>
    </main>
  );
}
