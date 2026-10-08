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
  const [target, setTarget] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
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
            {roster.detached && (
              <p role="status">
                Removed from account. This is a detached local copy. Your writing can be edited and
                exported; it no longer syncs.
              </p>
            )}
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
                      ? roster.detached
                        ? 'Previously approved for this account'
                        : 'Approved for content and sync'
                      : 'Enrollment pending · Not yet certified for sync'}
                  </p>
                  <p className="setup-note">
                    {device.id === roster.currentDevice
                      ? 'Protected here by your device-lock code.'
                      : 'Key-storage details are not recorded for this device.'}
                  </p>
                  {devices?.remove &&
                    !roster.detached &&
                    (roster.generation ?? 1) === 1 &&
                    device.id !== roster.currentDevice && (
                      <button
                        className="local-secondary"
                        disabled={removing}
                        onClick={() => setTarget(device.id)}
                      >
                        Remove device
                      </button>
                    )}
                </li>
              ))}
            </ul>
            {target && (
              <section aria-label="Confirm device removal">
                <h2>Remove device {target.slice(0, 8)}?</h2>
                <p>
                  It will stop receiving new writing. Existing copies on that device cannot be
                  erased and can still be read, edited and exported locally.
                </p>
                <p>
                  Your writing on this device is kept. We will lock this workspace while updating
                  its keys; unlock it again to finish.
                </p>
                <button
                  className="setup-primary"
                  disabled={removing}
                  onClick={() => {
                    setRemoving(true);
                    void devices!.remove!(target)
                      .catch(() =>
                        setError(
                          'Removal could not finish. Your writing and any saved removal progress have been kept. Unlock this account to retry.',
                        ),
                      )
                      .finally(() => setRemoving(false));
                  }}
                >
                  {removing ? 'Saving device removal…' : 'Confirm removal'}
                </button>
                <button
                  className="local-secondary"
                  disabled={removing}
                  onClick={() => setTarget(null)}
                >
                  Keep device
                </button>
              </section>
            )}
            <button
              className="setup-primary"
              onClick={onConnect}
              disabled={
                removing ||
                roster.detached ||
                (roster.generation ?? 1) !== 1 ||
                (roster.epoch > 1 && !(continuationAvailable && roster.epoch <= 4))
              }
            >
              {roster.devices.some((d) => d.state === 'pending')
                ? 'Resume connection'
                : 'Connect another device'}
            </button>
            {(roster.detached ||
              (roster.generation ?? 1) !== 1 ||
              (roster.epoch > 1 && !(continuationAvailable && roster.epoch <= 4))) && (
              <p className="setup-note">
                Additional device connections are not available yet in this preview.
              </p>
            )}
            {(!devices?.remove || (roster.generation ?? 1) !== 1) && !roster.detached && (
              <p className="setup-note">Further device removal is not available in this preview.</p>
            )}
          </>
        )}
        <button className="local-secondary" disabled={removing} onClick={onBack}>
          Back to writing
        </button>
      </section>
    </main>
  );
}
