import assert from 'node:assert/strict';

/** Borrow the stage owner's browser; standalone campaigns retain their original launch path. */
export function openFixtureBrowser(chromium, env = process.env) {
  const endpoint = env.RELEASE_BROWSER_ENDPOINT;
  assert(
    !env.RELEASE_PROCESS_GUARD || endpoint,
    'Owned Account fixture requires a browser endpoint',
  );
  if (endpoint) {
    assert(
      /^ws:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}\/devtools\/browser\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        endpoint,
      ) && Number(new URL(endpoint).port) <= 65535,
      'Invalid owned Account browser endpoint',
    );
    return chromium.connectOverCDP(endpoint, { timeout: 15000 });
  }
  return chromium.launch({
    headless: true,
    ...(env.CHROMIUM_PATH ? { executablePath: env.CHROMIUM_PATH } : {}),
  });
}
