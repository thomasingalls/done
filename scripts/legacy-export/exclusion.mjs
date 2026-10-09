/** Test-controller exclusion for a disposable context, never an in-page production capability. */
export class ExclusionLost extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'ExclusionLost';
  }
}
export class SeededExclusion {
  #context;
  #url;
  #page = null;
  #active = false;
  #reason = null;
  #epoch = 0;
  #onLoss;
  events = [];
  constructor(context, url, { onLoss } = {}) {
    this.#context = context;
    this.#url = url;
    this.#onLoss = onLoss;
    context.on('page', (page) => {
      if (this.#active) this.#invalidate('unexpected-page');
      page.on('crash', () => {
        if (this.#active) this.#invalidate('renderer-crash');
      });
      page.on('close', () => {
        if (this.#active) this.#invalidate('page-closed');
      });
      page.on('worker', () => {
        if (this.#active) this.#invalidate('unexpected-worker');
      });
      page.on('framenavigated', (frame) => {
        if (
          this.#active &&
          (page !== this.#page || frame !== page.mainFrame() || frame.url() !== this.#url)
        )
          this.#invalidate('unexpected-navigation');
      });
    });
    context.on('serviceworker', () => {
      if (this.#active) this.#invalidate('unexpected-service-worker');
    });
  }
  #invalidate(reason) {
    const first = this.#reason === null;
    this.#reason ??= reason;
    this.events.push({ epoch: this.#epoch, event: reason });
    if (first) this.#onLoss?.({ epoch: this.#epoch, reason });
  }
  async installRoutes() {
    const origin = new URL(this.#url).origin;
    await this.#context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      const forbidden =
        url.origin !== origin ||
        (this.#active &&
          (url.pathname === '/' ||
            url.pathname.endsWith('/old.html') ||
            url.pathname.endsWith('/worker.mjs')));
      if (forbidden) {
        if (this.#active) this.#invalidate('forbidden-route');
        return route.abort();
      }
      return route.continue();
    });
    await this.#context.routeWebSocket('**/*', (socket) => {
      if (this.#active) this.#invalidate('forbidden-websocket');
      socket.close();
    });
  }
  /** Fixture reseeding ends the previous observation epoch. */
  pause() {
    this.#active = false;
  }
  async establish() {
    this.#active = false;
    this.#reason = null;
    const pages = this.#context.pages();
    const workerCloses = pages.flatMap((page) =>
      page.workers().map((worker) => worker.waitForEvent('close', { timeout: 15000 })),
    );
    await Promise.all(pages.map((page) => page.close()));
    await Promise.all(workerCloses);
    if (this.#context.pages().length || this.#context.serviceWorkers().length)
      throw new ExclusionLost('old-context-survived');
    const page = await this.#context.newPage();
    page.setDefaultTimeout(15000);
    await page.goto(this.#url);
    await page.waitForFunction(() => window.captureFixture);
    this.#page = page;
    this.#epoch++;
    this.#active = true;
    this.events.push({
      epoch: this.#epoch,
      event: 'established',
      closedPages: pages.length,
      closedWorkers: workerCloses.length,
    });
    return this.current();
  }
  current() {
    const epoch = this.#epoch,
      page = this.#page;
    return {
      page,
      assert: () => {
        if (
          !this.#active ||
          epoch !== this.#epoch ||
          this.#reason ||
          !page ||
          page.isClosed() ||
          page.url() !== this.#url ||
          this.#context.pages().length !== 1 ||
          this.#context.pages()[0] !== page ||
          page.workers().length ||
          this.#context.serviceWorkers().length
        )
          throw new ExclusionLost(this.#reason ?? 'exclusion-ended');
      },
    };
  }
  async close() {
    this.#active = false;
    await this.#context.close();
  }
}
