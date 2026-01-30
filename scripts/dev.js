const { spawn } = require('child_process');
const path = require('path');
const { runPreflight } = require('./preflight');
const { waitForPort } = require('./wait-for');

const RESET = process.argv.includes('--reset');
const DEBUG = process.argv.includes('--debug');

const log = (msg) => console.log(msg);
const error = (msg) => console.error('❌ ' + msg);
const success = (msg) => console.log('✅ ' + msg);

const services = [
  {
    name: 'Backend',
    cmd: 'npm.cmd',
    args: ['run', 'dev'],
    cwd: 'apps/backend',
    port: 3000,
    env: {},
  },
  {
    name: 'Frontend',
    cmd: 'npm.cmd',
    args: ['run', 'dev'],
    cwd: 'apps/frontend',
    port: 9000,
    env: {},
  },
  {
    name: 'NFC Bridge',
    cmd: 'npm.cmd',
    args: ['run', 'dev'],
    cwd: 'nfc-bridge',
    port: null,
    env: {},
  },
];

async function startService(service) {
  return new Promise((resolve, reject) => {
    log('\n🚀 Starting ' + service.name + '...');

    const proc = spawn(service.cmd, service.args, {
      cwd: path.join(__dirname, '..', service.cwd),
      stdio: 'inherit',
      shell: true,
      env: {
        ...process.env,
        ...service.env,
        MONOREPO_DEV: 'true',
        FRONTEND_URL: 'http://localhost:9000',
      },
    });

    proc.on('error', (err) => {
      error('Failed to start ' + service.name + ': ' + err.message);
      reject(err);
    });

    proc.on('exit', (code) => {
      if (code !== 0) {
        error(service.name + ' exited with code ' + code);
        reject(new Error(service.name + ' failed'));
      }
    });

    resolve(proc);
  });
}

async function waitForServices() {
  log('\n⏳ Waiting for services to be ready...\n');

  for (const service of services) {
    try {
      if (service.port) {
        await waitForPort(service.port, 60000);
        success(service.name + ' ready on port ' + service.port);
      } else {
        log('ℹ️  ' + service.name + ' started (no port check)');
      }
    } catch (err) {
      error(service.name + ' failed to start: ' + err.message);
      process.exit(1);
    }
  }
}

async function main() {
  try {
    // Run preflight checks
    await runPreflight();

    // Set default NODE_ENV
    if (!process.env.NODE_ENV) {
      process.env.NODE_ENV = 'development';
    }

    // Start all services in parallel
    log('\n📦 Starting all services...\n');
    const processes = await Promise.all(services.map(startService));

    // Wait for readiness
    await waitForServices();

    success('\n✨ MKS Control development environment started!\n');
    log('🌐 Frontend:  http://localhost:9000');
    log('🔌 Backend:   http://localhost:3000');
    log('📡 WebSocket: ws://localhost:3000/ws/auth\n');
    log('Press Ctrl+C to stop all services\n');

    // Keep process alive
    process.stdin.resume();
  } catch (err) {
    error('Failed to start development environment: ' + err.message);
    process.exit(1);
  }
}

main();
