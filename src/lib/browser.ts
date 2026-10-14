/** Ordinary browser hints only. Profiles, client hostnames and hardware models are not exposed. */
interface BrowserHints {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
  userAgentData?: { platform?: string; brands?: readonly { brand: string; version: string }[] };
}

export const browserEnvironment = (
  hints: BrowserHints = typeof navigator === 'undefined' ? {} : navigator,
) => {
  const ua = hints.userAgent ?? '';
  const platform = hints.userAgentData?.platform ?? hints.platform ?? '';
  const ipad = /iPad/u.test(ua) || (/Mac/u.test(platform) && (hints.maxTouchPoints ?? 0) > 1);
  const os = ipad
    ? 'iPadOS'
    : /iPhone|iPod/u.test(ua)
      ? 'iOS'
      : /Android/u.test(ua) || platform === 'Android'
        ? 'Android'
        : /CrOS/u.test(ua) || platform === 'Chrome OS'
          ? 'ChromeOS'
          : /Windows/u.test(ua + platform)
            ? 'Windows'
            : /Mac/u.test(ua + platform)
              ? 'macOS'
              : /Linux/u.test(ua + platform)
                ? 'Linux'
                : null;
  const candidates = [
    ['Edge', /(?:Edg|EdgA|EdgiOS)\/(\d+)/u, 'Microsoft Edge'],
    ['Opera', /(?:OPR|Opera)\/(\d+)/u, 'Opera'],
    ['Samsung Internet', /SamsungBrowser\/(\d+)/u, 'Samsung Internet'],
    ['Firefox', /(?:Firefox|FxiOS)\/(\d+)/u, 'Firefox'],
    ['Chrome', /(?:Chrome|CriOS|Chromium)\/(\d+)/u, 'Google Chrome'],
    ['Safari', /Version\/(\d+).*Safari\//u, 'Safari'],
  ] as const;
  for (const [browser, pattern, brand] of candidates) {
    const hint = hints.userAgentData?.brands?.find((value) => value.brand === brand);
    const match = pattern.exec(ua);
    if (hint || match) return { browser, os, version: Number(hint?.version ?? match?.[1]) };
  }
  return { browser: null, os, version: 0 };
};

export const defaultDeviceName = (hints?: BrowserHints): string => {
  const { browser, os } = browserEnvironment(hints);
  return [browser, os].filter(Boolean).join(' - ') || 'This device';
};
