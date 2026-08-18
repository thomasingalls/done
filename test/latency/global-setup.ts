import { rmSync } from 'node:fs';
import { join } from 'node:path';

/** A run reports its own measurements, never the previous run's. */
export default (): void => {
  rmSync(join('test-results', 'latency.jsonl'), { force: true });
};
