const { spawn } = require('node:child_process');
const path = require('node:path');
const dotenv = require('../server/node_modules/dotenv');

dotenv.config({ path: path.join(__dirname, '..', 'server', '.env') });

const root = path.resolve(__dirname, '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const activeProcesses = new Set();
let stopping = false;

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || root,
      env: process.env,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    activeProcesses.add(child);
    child.once('error', (error) => {
      activeProcesses.delete(child);
      reject(error);
    });
    child.once('exit', (code, signal) => {
      activeProcesses.delete(child);
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} failed (${signal || code})`));
    });
  });
}

function start(command, args, label) {
  const child = spawn(command, args, {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  activeProcesses.add(child);
  child.once('exit', (code, signal) => {
    const wasActive = activeProcesses.has(child);
    activeProcesses.delete(child);
    if (!stopping && wasActive) {
      console.error(`${label} stopped unexpectedly (${signal || code}).`);
      stopAll();
      process.exitCode = code || 1;
    }
  });
  child.once('error', (error) => {
    console.error(`${label} failed to start: ${error.message}`);
    activeProcesses.delete(child);
    stopAll();
    process.exitCode = 1;
  });
  return child;
}

function stopAll() {
  if (stopping) return;
  stopping = true;
  for (const child of activeProcesses) child.kill('SIGTERM');
}

async function prepareDatabase() {
  console.log('\n[1/3] Starting PostgreSQL and waiting until healthy…');
  await run('docker', ['compose', 'up', '-d', '--wait']);
  console.log('\n[2/3] Applying schema and preparing activation-required demo identities…');
  await run(npm, ['--prefix', 'server', 'run', 'migrate']);
  await run(npm, ['--prefix', 'server', 'run', 'seed']);
}

async function waitForApi(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch('http://127.0.0.1:4000/api/health');
      if (response.ok) return;
    } catch {
      // The API process has not bound its port yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error('InfraShield API did not become healthy within 30 seconds.');
}

async function dev() {
  await prepareDatabase();
  console.log('\n[3/3] Launching API and web app. Each role automatically opens its own dashboard after sign-in.');
  start(npm, ['--prefix', 'server', 'run', 'start'], 'InfraShield API');
  start(npm, ['--prefix', 'client', 'run', 'dev', '--', '--host', '127.0.0.1', '--port', '5175'], 'InfraShield web app');
  await waitForApi();
  console.log('\nAPI: http://127.0.0.1:4000/api/health\nApp: http://127.0.0.1:5175/login\nPress Ctrl+C to stop both app processes.');
}

async function check() {
  await prepareDatabase();
  const apiProcess = start(npm, ['--prefix', 'server', 'run', 'start'], 'InfraShield API');
  try {
    await waitForApi();
    console.log('\nRunning API/database/authentication checks…');
    await run(process.execPath, ['scripts/verify.js']);
    console.log('\nBuilding the production web app…');
    await run(npm, ['--prefix', 'client', 'run', 'build']);
    console.log('\nAll InfraShield checks passed.');
  } finally {
    activeProcesses.delete(apiProcess);
    apiProcess.kill('SIGTERM');
  }
}

process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);

const mode = process.argv[2];
if (!['dev', 'check'].includes(mode)) {
  console.error('Usage: npm run dev:all | npm run check');
  process.exitCode = 2;
} else {
  (mode === 'dev' ? dev() : check()).catch((error) => {
    console.error(`\nInfraShield ${mode} failed: ${error.message}`);
    stopAll();
    process.exitCode = 1;
  });
}
