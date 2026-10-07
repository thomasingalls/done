import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
export const port = '53221';
export const origin = 'http://localhost:' + port;
const servicePort = '53222';
const processOutput = new WeakMap<ChildProcess, () => string>();
async function startProcess(
  script: string,
  ready: string,
  state?: string,
  build = resolve('dist'),
) {
  const child = spawn(process.execPath, [script], {
    env: {
      ...process.env,
      ACCOUNT_SETUP_PORT: port,
      ACCOUNT_SETUP_ORIGIN: origin,
      ACCOUNT_SERVICE_PORT: servicePort,
      ...(state ? { ACCOUNT_SETUP_STATE: state } : {}),
      ACCOUNT_SETUP_DIST: build,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  processOutput.set(child, () => output);
  await new Promise<void>((accept, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(Error('Service startup timeout: ' + output));
    }, 15000);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(Error(`Service exited ${code}: ${output}`));
    });
    const data = (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-8000);
      if (output.includes(ready)) {
        clearTimeout(timer);
        accept();
      }
    };
    child.stdout!.on('data', data);
    child.stderr!.on('data', data);
  });
  return child;
}
export async function stopProcess(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((accept, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(
        Error(
          `Service shutdown timeout: ${child.spawnargs.join(' ')}\n${processOutput.get(child)?.()}`,
        ),
      );
    }, 10000);
    child.once('exit', () => {
      clearTimeout(timer);
      accept();
    });
    child.kill('SIGTERM');
  });
}

export const startBackend = (state: string) =>
  startProcess('scripts/serve-account-service.mjs', 'Account API development:', state);
export const startApplication = (build = resolve('dist')) =>
  startProcess('scripts/serve-account.mjs', 'Account packaged development:', undefined, build);
export async function startService(state: string, build = resolve('dist')) {
  const backend = await startBackend(state);
  try {
    return { backend, app: await startApplication(build) };
  } catch (cause) {
    await stopProcess(backend);
    throw cause;
  }
}
export async function stopService(service: Awaited<ReturnType<typeof startService>>) {
  await Promise.all([stopProcess(service.app), stopProcess(service.backend)]);
}
