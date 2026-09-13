export const groupState = (pid) => {
  try {
    process.kill(-pid, 0);
    return 'alive';
  } catch (e) {
    if (e.code === 'ESRCH') return 'gone';
    if (e.code === 'EPERM') return 'unknown';
    throw e;
  }
};
export const signalGroup = (pid, signal) => {
  try {
    process.kill(-pid, signal);
  } catch (e) {
    if (e.code !== 'ESRCH') throw e;
  }
};
