const fs = require('fs');
const path = require('path');
const net = require('net');
const http = require('http');

const log = (msg) => console.log(msg);
const error = (msg) => console.error('❌ ERROR: ' + msg);

// Set default NODE_ENV for local development
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'development';
}

function checkNodeVersion() {
  const required = '18.0.0';
  const current = process.version.slice(1);

  if (current < required) {
    error('Node.js ' + required + ' required, got ' + current);
    process.exit(1);
  }
  log('✅ Node.js ' + current);
}

function checkEnvVars() {
  const required = ['NODE_ENV'];
  const missing = required.filter((v) => !process.env[v]);

  if (missing.length > 0) {
    error('Missing environment variables: ' + missing.join(', '));
    log('Set NODE_ENV=development for local development');
    process.exit(1);
  }
  log('✅ Environment variables configured');
}

async function checkPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        resolve(true);
      }
    });
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
}

async function checkPorts() {
  const ports = {
    3000: 'Backend API',
    9000: 'Frontend',
  };

  // Skip CouchDB port check - Docker manages it
  for (const [port, service] of Object.entries(ports)) {
    const available = await checkPort(parseInt(port));
    if (!available) {
      error('Port ' + port + ' (' + service + ') is already in use');
      process.exit(1);
    }
  }
  log('✅ Required ports available (3000, 9000)');
}

async function checkCouchDB() {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:5984/_up', (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.status === 'ok') {
            log('✅ CouchDB is running and reachable');
            resolve(true);
          } else {
            resolve(false);
          }
        } catch (err) {
          resolve(false);
        }
      });
    });

    req.on('error', () => {
      resolve(false);
    });

    req.setTimeout(3000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function runPreflight() {
  log('\n🔍 Running preflight checks...\n');

  checkNodeVersion();
  checkEnvVars();
  await checkPorts();

  const dbRunning = await checkCouchDB();
  if (!dbRunning) {
    error('CouchDB is not running or not reachable at http://localhost:5984');
    log('Start Docker services first: docker-compose up -d');
    log('Or let the orchestrator start it for you.');
  }

  log('\n✅ All checks passed\n');
}

module.exports = { runPreflight };

if (require.main === module) {
  runPreflight().catch((err) => {
    error(err.message);
    process.exit(1);
  });
}
