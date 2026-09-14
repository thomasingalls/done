import { test as base } from '@playwright/test';

/** Standalone commands keep Playwright's ordinary browser; owned runs borrow only CDP. */
export const test = process.env['RELEASE_BROWSER_ENDPOINT']
  ? base.extend({
      browser: [
        async ({ playwright }, use) => {
          const browser = await playwright.chromium.connectOverCDP(
            process.env['RELEASE_BROWSER_ENDPOINT']!,
          );
          const newContext = browser.newContext.bind(browser);
          browser.newContext = async (...args) => {
            const context = await newContext(...args);
            context.on('page', (page) => {
              page.on('pageerror', (error) => console.error('Browser page error:', error.message));
              page.on('console', (message) => {
                if (message.type() === 'error') console.error('Browser console:', message.text());
              });
            });
            return context;
          };
          try {
            await use(browser);
          } finally {
            await browser.close();
          }
        },
        { scope: 'worker' },
      ],
    })
  : base;
