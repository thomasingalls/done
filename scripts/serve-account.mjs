/** Serve the compiled PWA with the retained private development account service. */
process.env.ACCOUNT_SETUP_DIST ??= 'dist';
await import('./dev-account-setup.mjs');
