#!/usr/bin/env node

/**
 * Simplified dev script for E2E tests
 * Starts only essential services with minimal logging
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const http = require('http');

const log = (msg) => console.log(`[E2E] ${msg}`);
const error = (msg) => console.error(`[E2E] ❌ ${msg}`);

async function checkPort(port) {
  return new Promise((resolve) => {
    const net = require('net');
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
}

async function waitForEndpoint(url, timeout = 60000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return true;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error('Timeout waiting for ' + url);
}

async function checkCouchDB() {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:5984/_up', (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.status === 'ok');
        } catch {
          resolve(false);
        }
      });
    });
    req.on('error', () => resolve(false));
    req.setTimeout(3000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function startDocker() {
  log('Checking Docker services...');
  try {
    execSync('docker ps', { stdio: 'ignore' });
  } catch {
    error('Docker is not running. Please start Docker Desktop.');
    process.exit(1);
  }

  const dbRunning = await checkCouchDB();
  if (!dbRunning) {
    log('Starting CouchDB...');
    try {
      execSync('docker-compose up -d', {
        stdio: 'ignore',
        cwd: path.join(__dirname, '..'),
      });
    } catch (err) {
      error('Failed to start Docker: ' + err.message);
      process.exit(1);
    }
  } else {
    log('CouchDB already running');
  }
}

function startService(name, cmd, args, cwd) {
  return new Promise((resolve) => {
    log(`Starting ${name}...`);
    const proc = spawn(cmd, args, {
      cwd: path.join(__dirname, '..', cwd),
      stdio: ['ignore', 'pipe', 'pipe'], // Capture stdout and stderr
      shell: true,
      env: {
        ...process.env,
        MONOREPO_DEV: 'true',
        NODE_ENV: 'test',
        CI: 'true',
      },
    });

    // Log errors
    proc.stderr.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg) {
        console.error(`[${name}] ${msg}`);
      }
    });

    proc.on('error', (err) => {
      error(`Failed to start ${name}: ${err.message}`);
      process.exit(1);
    });

    resolve(proc);
  });
}

async function main() {
  try {
    log('Starting E2E environment...');

    // Check ports are available
    const port3000Available = await checkPort(3000);
    const port9000Available = await checkPort(9000);

    if (!port3000Available) {
      error('Port 3000 is already in use. Please stop existing backend.');
      process.exit(1);
    }

    if (!port9000Available) {
      error('Port 9000 is already in use. Please stop existing frontend.');
      process.exit(1);
    }

    // Start Docker
    await startDocker();

    // Wait for CouchDB
    log('Waiting for CouchDB...');
    await waitForEndpoint('http://localhost:5984/_up', 30000);
    log('CouchDB ready');

    // Start Backend
    const backendProc = await startService('Backend', 'npm.cmd', ['run', 'dev'], 'apps/backend');

    // Wait for Backend
    log('Waiting for Backend...');
    await new Promise((r) => setTimeout(r, 5000)); // Give backend time to initialize DB
    log('Backend ready');

    // Start Frontend
    const frontendProc = await startService('Frontend', 'npm.cmd', ['run', 'dev'], 'apps/frontend');

    // Wait for Frontend
    log('Waiting for Frontend...');
    await waitForEndpoint('http://localhost:9000/', 60000);
    log('Frontend ready');

    log('All services started successfully');

    // Handle shutdown
    const cleanup = () => {
      log('Shutting down...');
      backendProc.kill();
      frontendProc.kill();
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    // Keep alive
    process.stdin.resume();
  } catch (err) {
    error('Failed to start: ' + err.message);
    process.exit(1);
  }
}

main();
