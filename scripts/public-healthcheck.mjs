/** Exec probe for a same-pod process, including the API's loopback-only listener. */
const mode = process.argv[2];
const port = Number(
  mode === 'app' ? (process.env.DONE_APP_PORT ?? 8080) : (process.env.DONE_API_PORT ?? 8081),
);
if (
  process.argv.length !== 3 ||
  !['api', 'app', 'backup'].includes(mode) ||
  !Number.isInteger(port) ||
  port < 1024 ||
  port > 65535
) {
  console.error('Usage: node scripts/public-healthcheck.mjs api|app|backup');
  process.exitCode = 1;
} else {
  try {
    const response = await fetch(
      `http://127.0.0.1:${port}/${mode === 'backup' ? 'backupz' : 'readyz'}`,
      {
        signal: AbortSignal.timeout(2000),
      },
    );
    await response.arrayBuffer();
    if (response.status !== 200) throw Error('not ready');
  } catch {
    console.error(`Public ${mode} is not ready`);
    process.exitCode = 1;
  }
}
