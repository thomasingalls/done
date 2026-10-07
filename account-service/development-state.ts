/** One directory owner shared by the private service and its offline upgrader. */
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

export function lockDevelopmentState(directory: string) {
  const path = join(directory, 'maintenance.lock');
  try {
    writeFileSync(path, JSON.stringify({ pid: process.pid }), { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    throw Error(
      `Preview state is in use. Stop its service or upgrade first. If a process crashed, verify it has stopped before removing ${path}.`,
    );
  }
  let released = false;
  return () => {
    if (released) return;
    unlinkSync(path);
    released = true;
  };
}
