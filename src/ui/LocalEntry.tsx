/** Static/local-only entry, including credential-free removal without an account-service bootstrap. */
import { LocalApp } from './LocalApp';
import { DeviceDataRemoval } from './DeviceDataRemoval';
export function LocalEntry() {
  const match = /^\/remove\/(local|account-[a-f0-9]{32}|enrollment-[a-f0-9]{32})\/?$/.exec(
    location.pathname,
  );
  if (match)
    return (
      <DeviceDataRemoval
        slotId={match[1]!}
        onBack={() => location.assign('/')}
        onStartFresh={() => location.assign('/')}
      />
    );
  return <LocalApp />;
}
