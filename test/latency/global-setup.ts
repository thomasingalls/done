import { rmSync } from 'node:fs';
import { join } from 'node:path';

/** A run reports its own measurements, never the previous run's. */
export default (): void => {
  rmSync(process.env['LATENCY_RESULTS_FILE'] ?? join('test-results', 'latency.jsonl'), {
    force: true,
  });
};
