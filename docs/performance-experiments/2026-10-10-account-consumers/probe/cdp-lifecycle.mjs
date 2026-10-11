// Isolated probe control. No application, account or saved credential is used.
import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const auth = await page.context().newCDPSession(page);
  await auth.send('WebAuthn.enable');
  const { authenticatorId } = await auth.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2', transport: 'internal', hasResidentKey: true,
      hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true,
    },
  });
  const read = async (label) => {
    try {
      const { credentials } = await auth.send('WebAuthn.getCredentials', { authenticatorId });
      console.log(label, { credentials: credentials.length });
      return true;
    } catch (cause) {
      console.log(label, String(cause));
      return false;
    }
  };
  if (!await read('initial')) throw Error('Initial authenticator unavailable');
  const profiler = await page.context().newCDPSession(page);
  await profiler.send('Profiler.enable');
  await profiler.send('Profiler.start');
  await page.evaluate(() => 1 + 1);
  await profiler.send('Profiler.stop');
  if (!await read('after profiler stop')) throw Error('Stopping profiler broke authenticator');
  await profiler.detach();
  if (await read('after profiler detach')) throw Error('Expected lifecycle defect did not reproduce');
} finally {
  await browser.close();
}
