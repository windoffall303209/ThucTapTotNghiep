const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  buildConnectionOptions,
  buildExecutionPlan,
  parseArguments
} = require('../scripts/run_sql_file');

function databaseEnv(overrides = {}) {
  return {
    NODE_ENV: 'development',
    DB_HOST: '127.0.0.1',
    DB_PORT: '3306',
    DB_USER: 'app',
    DB_PASSWORD: 'secret-used-only-inside-the-process',
    DB_NAME: 'math_app',
    DB_SSL_MODE: 'disabled',
    ...overrides
  };
}

test('npm scripts không đặt mật khẩu MySQL lên command line', () => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')
  );

  assert.equal(packageJson.scripts['db:init'], 'node scripts/run_sql_file.js schema');
  assert.equal(packageJson.scripts['db:seed-demo'], 'node scripts/run_sql_file.js seed');
  assert.doesNotMatch(JSON.stringify(packageJson.scripts), /-p%DB_PASSWORD%|--password=/);
});

test('khởi tạo schema mặc định chỉ preflight và cần xác nhận đúng tên database', () => {
  const env = databaseEnv();
  const preflight = buildExecutionPlan(parseArguments(['schema']), env);
  assert.equal(preflight.apply, false);
  assert.equal(preflight.destructive, true);

  assert.throws(
    () => buildExecutionPlan(parseArguments(['schema', '--apply']), env),
    /--confirm-database=math_app/
  );
  const confirmed = buildExecutionPlan(
    parseArguments(['schema', '--apply', '--confirm-database=math_app']),
    env
  );
  assert.equal(confirmed.apply, true);
});

test('reset production có thêm khóa an toàn và seed demo bị cấm', () => {
  const production = databaseEnv({ NODE_ENV: 'production' });
  const resetArgs = parseArguments([
    'schema',
    '--apply',
    '--confirm-database=math_app'
  ]);

  assert.throws(
    () => buildExecutionPlan(resetArgs, production),
    /ALLOW_PRODUCTION_DATABASE_RESET/
  );
  assert.doesNotThrow(() => buildExecutionPlan(resetArgs, {
    ...production,
    ALLOW_PRODUCTION_DATABASE_RESET: 'true'
  }));
  assert.throws(
    () => buildExecutionPlan(
      parseArguments(['seed', '--apply', '--confirm-demo-credentials']),
      production
    ),
    /Không được nạp tài khoản demo/
  );
});

test('seed demo cần cờ xác nhận rõ ràng', () => {
  const env = databaseEnv();
  assert.throws(
    () => buildExecutionPlan(parseArguments(['seed', '--apply']), env),
    /--confirm-demo-credentials/
  );
  const confirmed = buildExecutionPlan(
    parseArguments(['seed', '--apply', '--confirm-demo-credentials']),
    env
  );
  assert.equal(confirmed.apply, true);
});

test('runner giữ mật khẩu trong options nội bộ và bật multiple statements', () => {
  const options = buildConnectionOptions(databaseEnv());

  assert.equal(options.password, 'secret-used-only-inside-the-process');
  assert.equal(options.database, 'math_app');
  assert.equal(options.multipleStatements, true);
  assert.equal(Object.hasOwn(options, 'connectionLimit'), false);
  assert.equal(Object.hasOwn(options, 'queueLimit'), false);
});
