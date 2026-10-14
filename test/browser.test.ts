import { describe, expect, it } from 'vitest';
import { browserEnvironment, defaultDeviceName } from '../src/lib/browser';

describe('ordinary browser and OS names', () => {
  it.each([
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15) Firefox/150.0', 'Firefox - macOS'],
    [
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/150.0 Mobile Safari/537.36',
      'Chrome - Android',
    ],
    ['Mozilla/5.0 (Windows NT 10.0) Chrome/150.0 Safari/537.36 Edg/150.0', 'Edge - Windows'],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/18.1 Safari/605.1.15',
      'Safari - macOS',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) CriOS/150.0 Mobile Safari/604.1',
      'Chrome - iOS',
    ],
    [
      'Mozilla/5.0 (Linux; Android 14) Chrome/150.0 SamsungBrowser/29.0 Safari/537.36',
      'Samsung Internet - Android',
    ],
    ['Mozilla/5.0 (X11; CrOS x86_64) Chrome/150.0 Safari/537.36', 'Chrome - ChromeOS'],
    ['', 'This device'],
  ])('names %s as %s', (userAgent, expected) => {
    expect(defaultDeviceName({ userAgent })).toBe(expected);
  });
  it('recognizes an iPad using a desktop Safari user agent', () => {
    expect(
      defaultDeviceName({
        userAgent: 'Macintosh Version/18.0 Safari/605.1',
        platform: 'MacIntel',
        maxTouchPoints: 5,
      }),
    ).toBe('Safari - iPadOS');
  });
  it('uses low-entropy browser brands without asking for hardware or profile information', () => {
    expect(
      browserEnvironment({
        userAgentData: {
          platform: 'Windows',
          brands: [
            { brand: 'Not A Brand', version: '99' },
            { brand: 'Chromium', version: '150' },
            { brand: 'Microsoft Edge', version: '150' },
          ],
        },
      }),
    ).toEqual({ browser: 'Edge', os: 'Windows', version: 150 });
  });
});
