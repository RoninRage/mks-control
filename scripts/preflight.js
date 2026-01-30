const fs = require('fs');
const path = require('path');
const net = require('net');

const log = (msg) => console.log(msg);
const error = (msg) => console.error('❌ ERROR: ' + msg);

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

  for (const [port, service] of Object.entries(ports)) {
    const available = await checkPort(parseInt(port));
    if (!available) {
      error('Port ' + port + ' (' + service + ') is already in use');
      process.exit(1);
    }
  }
  log('✅ Required ports available (3000, 9000)');
}

async function runPreflight() {
  log('\n🔍 Running preflight checks...\n');

  checkNodeVersion();
  checkEnvVars();
  await checkPorts();

  log('\n✅ All checks passed\n');
}

module.exports = { runPreflight };

if (require.main === module) {
  runPreflight().catch((err) => {
    error(err.message);
    process.exit(1);
  });
}
