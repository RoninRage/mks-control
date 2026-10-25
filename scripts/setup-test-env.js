#!/usr/bin/env node

/**
 * Pre-test setup script
 * Runs BEFORE Playwright to create test environment
 */

const { writeFileSync } = require('fs');
const { join } = require('path');

// Generate unique database names
const timestamp = Date.now();
const pid = process.pid;

const membersDbName = `mks_members_test_${timestamp}_${pid}`;
const tagsDbName = `mks_tags_test_${timestamp}_${pid}`;
const usageDbName = `mks_usage_test_${timestamp}_${pid}`;

console.log('\n📦 Generating test database names:');
console.log(`   Members: ${membersDbName}`);
console.log(`   Tags: ${tagsDbName}\n`);

// Write .env.test file
const envContent = `# Auto-generated test environment - DO NOT EDIT
# Generated at: ${new Date().toISOString()}
COUCHDB_DB_NAME=${membersDbName}
COUCHDB_TAGS_DB_NAME=${tagsDbName}
COUCHDB_USAGE_DB_NAME=${usageDbName}
TEST_MEMBERS_DB_NAME=${membersDbName}
TEST_TAGS_DB_NAME=${tagsDbName}
NODE_ENV=test
ADMIN_TAG_UIDS=test-admin-tag-001
MONOREPO_DEV=true
COUCHDB_URL=http://localhost:5984
COUCHDB_USER=admin
COUCHDB_PASSWORD=password
SHELLY_PASSWORD=test-shelly-secret
TERMINAL_IDLE_TIMEOUT_MS=10000
# Machine control timings are configured in minutes; in tests one "minute" is one second.
TERMINAL_MINUTE_MS=1000
TERMINAL_OFFLINE_AFTER_MS=5000
MACHINE_TICK_MS=250
# Usage retention cleanup runs every 2 s in tests
USAGE_CLEANUP_INTERVAL_MS=2000
`;

const envPath = join(process.cwd(), '.env.test');
writeFileSync(envPath, envContent, 'utf-8');

console.log(`✅ Test environment written to: .env.test\n`);

// Output for scripts to read
process.stdout.write(
  JSON.stringify({
    membersDbName,
    tagsDbName,
  })
);
