const { spawn, execSync } = require('child_process');
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
    name: 'CouchDB',
    type: 'docker',
    port: 5984,
  },
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

async function startDocker() {
  log('\n🐳 Starting Docker services...');

  try {
    // Check if Docker is running
    execSync('docker ps', { stdio: 'ignore' });
  } catch (err) {
    error('Docker is not running. Please start Docker Desktop.');
    process.exit(1);
  }

  if (RESET) {
    log('🔄 Resetting database (--reset flag detected)...');
    try {
      execSync('docker-compose down -v', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
    } catch (err) {
      // Ignore errors if containers don't exist
    }
  }

  try {
    execSync('docker-compose up -d', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  } catch (err) {
    error('Failed to start Docker services: ' + err.message);
    process.exit(1);
  }
}

async function startService(service) {
  if (service.type === 'docker') {
    // Docker services are started separately
    return null;
  }

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

    // Start Docker services
    await startDocker();

    // Start all services in parallel
    log('\n📦 Starting all services...\n');
    const processes = await Promise.all(services.map(startService));

    // Wait for readiness
    await waitForServices();

    success('\n✨ MKS Control development environment started!\n');
    log('🗄️  Database:  http://localhost:5984/_utils');
    log('🌐 Frontend:  http://localhost:9000');
    log('🔌 Backend:   http://localhost:3000');
    log('📡 WebSocket: ws://localhost:3000/ws/auth\n');
    log('Press Ctrl+C to stop all services\n');

    // Handle shutdown
    const cleanup = () => {
      log('\n🛑 Shutting down services...');
      processes.filter((p) => p).forEach((proc) => proc.kill());
      try {
        execSync('docker-compose down', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
      } catch (err) {
        // Ignore errors during cleanup
      }
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    // Keep process alive
    process.stdin.resume();
  } catch (err) {
    error('Failed to start development environment: ' + err.message);
    process.exit(1);
  }
}

main();
