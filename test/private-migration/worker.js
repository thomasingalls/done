// Inert disposable fixture used to verify that a retained service-worker registration blocks the utility.
self.addEventListener('install', () => self.skipWaiting());
