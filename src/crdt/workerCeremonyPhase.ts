/** Keep native setup work tracked, then yield only at its trusted final opening hook. */
import {
  requireCeremonyWorkerLifetime,
  type openCeremonyWorkerLifetime,
} from './ceremonyWorkerLifetime';
const deferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void, reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  void promise.catch(() => {});
  return { promise, resolve, reject };
};
export function createWorkerCeremonyPhase(
  root: Awaited<ReturnType<typeof openCeremonyWorkerLifetime>>,
) {
  requireCeremonyWorkerLifetime(root);
  let current:
    | {
        yield: ReturnType<typeof deferred<void>>;
        released: ReturnType<typeof deferred<void>>;
        accepting: boolean;
      }
    | undefined;
  let yielded = false;
  return Object.freeze({
    get handingOff() {
      return yielded;
    },
    run<T>(operation: () => Promise<T>): Promise<T> {
      requireCeremonyWorkerLifetime(root);
      if (current || yielded) throw Error('Ceremony phase unavailable');
      const flight = { yield: deferred<void>(), released: deferred<void>(), accepting: false },
        result = deferred<T>();
      current = flight;
      let released = false,
        outcome: { ok: true; value: T } | { ok: false; cause: unknown } | undefined;
      const publish = () => {
        if (!released || !outcome) return;
        if (outcome.ok) result.resolve(outcome.value);
        else result.reject(outcome.cause);
      };
      const job = root.run(async () => {
        const work = Promise.resolve().then(() => {
          flight.accepting = true;
          return operation();
        });
        void work.then(
          (value) => {
            flight.accepting = false;
            outcome = { ok: true, value };
            publish();
          },
          (cause) => {
            flight.accepting = false;
            outcome = { ok: false, cause };
            publish();
          },
        );
        await Promise.race([
          work.then(
            () => {},
            () => {},
          ),
          flight.yield.promise,
        ]);
      });
      void job.then(
        () => {
          released = true;
          flight.released.resolve();
          publish();
        },
        (cause) => {
          result.reject(cause);
          flight.released.reject(cause);
        },
      );
      return result.promise.finally(() => {
        if (!yielded && current === flight) current = undefined;
      });
    },
    async yieldToAccount() {
      requireCeremonyWorkerLifetime(root);
      if (!current || !current.accepting || yielded)
        throw Error('Ceremony opening hook unavailable');
      const flight = current;
      yielded = true;
      flight.yield.resolve();
      await flight.released.promise;
      requireCeremonyWorkerLifetime(root);
    },
  });
}
