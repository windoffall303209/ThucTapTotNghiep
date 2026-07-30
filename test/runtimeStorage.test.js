const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  getSessionExpiry,
  parseSessionData
} = require('../stores/MySQLSessionStore');
const { hashKey } = require('../stores/MySQLRateLimitStore');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('session store đọc JSON an toàn và tôn trọng hạn cookie', () => {
  assert.deepEqual(parseSessionData('{"flash":{"type":"success"}}'), {
    flash: { type: 'success' }
  });
  assert.equal(parseSessionData('{invalid'), null);

  const expires = new Date(Date.now() + 60_000);
  assert.equal(
    getSessionExpiry({ cookie: { expires: expires.toISOString() } }).getTime(),
    expires.getTime()
  );
  assert.ok(getSessionExpiry({}, 5000).getTime() > Date.now());
});

test('production session dùng MySQL store và schema có index dọn phiên hết hạn', () => {
  const appSource = read('app.js');
  const schema = read('database/database_schema.sql');
  const migration = read('scripts/apply_runtime_storage.js');

  assert.match(appSource, /new MySQLSessionStore/);
  assert.match(appSource, /store: sessionStore/);
  assert.match(appSource, /new MySQLRateLimitStore\('auth'\)/);
  assert.match(appSource, /new MySQLRateLimitStore\('registration'\)/);
  assert.match(appSource, /new MySQLRateLimitStore\('ai'\)/);
  assert.match(schema, /CREATE TABLE AppSessions/);
  assert.match(schema, /CREATE TABLE RequestRateLimits/);
  assert.match(schema, /idx_app_sessions_expiry/);
  assert.match(migration, /DELETE FROM AppSessions WHERE expires_at <= CURRENT_TIMESTAMP/);
  assert.match(migration, /DELETE FROM RequestRateLimits WHERE reset_at <= CURRENT_TIMESTAMP/);
});

test('rate-limit chỉ lưu hash ổn định, không lưu IP hoặc ID thô', () => {
  assert.equal(hashKey('client:1'), hashKey('client:1'));
  assert.notEqual(hashKey('client:1'), hashKey('client:2'));
  assert.equal(hashKey('client:1').length, 64);
});

test('model chỉ kiểm tra schema, không chạy DDL trong request', () => {
  for (const file of [
    'models/PracticeSession.js',
    'models/AIConversationLog.js',
    'models/SystemSetting.js'
  ]) {
    const source = read(file);
    assert.doesNotMatch(source, /CREATE TABLE|ALTER TABLE|CREATE INDEX/, file);
  }
});
