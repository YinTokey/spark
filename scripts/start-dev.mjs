import { spawn } from 'node:child_process';

try {
  process.loadEnvFile('.env.local');
} catch (error) {
  if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') throw error;
}

const child = spawn(process.execPath, [
  '--use-env-proxy',
  'node_modules/next/dist/bin/next',
  'dev',
], { stdio: 'inherit' });

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

child.on('error', (error) => {
  console.error('Could not start the development server.', error.message);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
