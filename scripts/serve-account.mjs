/** Compiled PWA entry, sharing account ownership without importing the Vite entry. */
import { runAccountApplication } from './lib/account-application.mjs';
await runAccountApplication({ packaged: process.env.ACCOUNT_SETUP_DIST ?? 'dist' });
