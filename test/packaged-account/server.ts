import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
export const port = '53221';
export const origin = 'http://localhost:' + port;
export async function startService(state: string, build = resolve('dist')) {
  const child = spawn(process.execPath, ['scripts/dev-account-setup.mjs'], {
    env: {
      ...process.env,
      ACCOUNT_SETUP_PORT: port,
      ACCOUNT_SETUP_ORIGIN: origin,
      ACCOUNT_SETUP_STATE: state,
      ACCOUNT_SETUP_DIST: build,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise<void>((accept, reject) => {
    let output = '';
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
      if (output.includes('Account packaged development:')) {
        clearTimeout(timer);
        accept();
      }
    };
    child.stdout!.on('data', data);
    child.stderr!.on('data', data);
  });
  return child;
}
export async function stopService(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((accept, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(Error('Service shutdown timeout'));
    }, 10000);
    child.once('exit', () => {
      clearTimeout(timer);
      accept();
    });
    child.kill('SIGTERM');
  });
}
