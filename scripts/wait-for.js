const http = require('http');

async function waitForPort(port, timeout = 30000) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get('http://localhost:' + port + '/health', (res) => {
          if (res.statusCode === 200) {
            resolve();
          } else {
            reject(new Error('Status ' + res.statusCode));
          }
        });
        req.on('error', reject);
        req.setTimeout(1000);
      });
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  throw new Error('Timeout waiting for port ' + port);
}

async function waitForEndpoint(url, timeout = 30000) {
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

module.exports = { waitForPort, waitForEndpoint };
