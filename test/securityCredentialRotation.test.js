const test = require('node:test');
const assert = require('node:assert/strict');

const Rotation = require('../scripts/rotate_security_credentials');

function createHarness() {
  const calls = {
    reads: 0,
    writes: [],
    transactions: 0,
    randomSecrets: 0,
    hashes: 0,
    logs: [],
    executes: []
  };
  const databaseName = 'safe_test_db';
  const dependencies = {
    env: {
      API_KEY_ENCRYPTION_SECRET: 'old-encryption-secret-never-log'
    },
    envPath: 'virtual/.env',
    fs: {
      async readFile() {
        calls.reads += 1;
        return [
          'SESSION_SECRET=old-session-secret-never-log',
          'JWT_SECRET=old-jwt-secret-never-log',
          'API_KEY_ENCRYPTION_SECRET=old-encryption-secret-never-log',
          ''
        ].join('\n');
      },
      async writeFile(file, content) {
        calls.writes.push({ file, content });
      }
    },
    db: {
      async testConnection() {
        return { connected: true };
      },
      async query(sql) {
        if (/SELECT DATABASE\(\)/.test(sql)) {
          return [{ database_name: databaseName }];
        }
        if (/FROM SystemSettings/.test(sql)) {
          return [{
            setting_key: 'openai_api_key',
            setting_value: 'provider-secret-never-log'
          }];
        }
        if (/SELECT username, password_hash/.test(sql)) return [];
        throw new Error(`Unexpected query: ${sql}`);
      },
      async transaction(callback) {
        calls.transactions += 1;
        return callback({
          async execute(sql, params = []) {
            calls.executes.push({ sql, params });
            if (/SELECT DATABASE\(\)/.test(sql)) {
              return [[{ database_name: databaseName }]];
            }
            return [{ affectedRows: 1 }];
          }
        });
      }
    },
    bcrypt: {
      async compare() {
        return false;
      },
      async hash() {
        calls.hashes += 1;
        return 'password-hash-never-log';
      }
    },
    randomSecret() {
      calls.randomSecrets += 1;
      return `generated-secret-${calls.randomSecrets}-never-log`;
    },
    logger: {
      log(value) {
        calls.logs.push(String(value));
      }
    }
  };
  return { calls, databaseName, dependencies };
}

test('CLI xoay credentials mặc định là preflight và xác nhận database phải đi cùng --apply', () => {
  assert.deepEqual(Rotation.parseArgs([]), {
    apply: false,
    confirmDatabase: ''
  });
  assert.deepEqual(
    Rotation.parseArgs(['--apply', '--confirm-database=safe_test_db']),
    { apply: true, confirmDatabase: 'safe_test_db' }
  );
  assert.throws(
    () => Rotation.parseArgs(['--confirm-database=safe_test_db']),
    /chỉ được dùng cùng --apply/
  );
  assert.throws(
    () => Rotation.parseArgs(['--apply', '--confirm-database=db;danger']),
    /xác nhận an toàn/
  );
  assert.throws(
    () => Rotation.parseArgs(['--force']),
    /không được hỗ trợ/
  );
});

test('preflight chỉ đọc và không sinh secret, ghi file hoặc mở transaction', async () => {
  const { calls, dependencies } = createHarness();
  const result = await Rotation.main([], dependencies);

  assert.equal(result.mode, 'preflight');
  assert.equal(calls.reads, 1);
  assert.equal(calls.writes.length, 0);
  assert.equal(calls.transactions, 0);
  assert.equal(calls.randomSecrets, 0);
  assert.equal(calls.hashes, 0);

  const output = calls.logs.join('\n');
  for (const secret of [
    'old-encryption-secret-never-log',
    'old-session-secret-never-log',
    'old-jwt-secret-never-log',
    'provider-secret-never-log'
  ]) {
    assert.equal(output.includes(secret), false);
  }
});

test('--apply thiếu hoặc sai xác nhận database vẫn không tạo hay ghi secret', async () => {
  for (const args of [
    ['--apply'],
    ['--apply', '--confirm-database=wrong_db']
  ]) {
    const { calls, dependencies } = createHarness();
    await assert.rejects(
      Rotation.main(args, dependencies),
      /Để áp dụng/
    );
    assert.equal(calls.writes.length, 0);
    assert.equal(calls.transactions, 0);
    assert.equal(calls.randomSecrets, 0);
    assert.equal(calls.hashes, 0);
  }
});

test('--apply với xác nhận đúng mới cập nhật và output không chứa secret', async () => {
  const { calls, databaseName, dependencies } = createHarness();
  const result = await Rotation.main(
    ['--apply', `--confirm-database=${databaseName}`],
    dependencies
  );

  assert.equal(result.mode, 'post-apply');
  assert.equal(calls.transactions, 1);
  assert.equal(calls.writes.length, 1);
  assert.equal(calls.randomSecrets, 3);
  assert.ok(calls.executes.some((entry) => /UPDATE SystemSettings/.test(entry.sql)));

  const output = calls.logs.join('\n');
  assert.equal(output.includes('provider-secret-never-log'), false);
  assert.equal(output.includes('old-encryption-secret-never-log'), false);
  assert.equal(output.includes('generated-secret-'), false);
});

test('ghi .env loại bỏ secret trùng và khôi phục nội dung cũ nếu lần ghi mới lỗi', async () => {
  const updated = Rotation.updateEnv(
    [
      'SESSION_SECRET=old-first',
      'UNCHANGED=value',
      'SESSION_SECRET=old-duplicate',
      ''
    ].join('\n'),
    { SESSION_SECRET: 'new-secret' }
  );
  assert.equal((updated.match(/^SESSION_SECRET=/gm) || []).length, 1);
  assert.match(updated, /^SESSION_SECRET=new-secret$/m);
  assert.doesNotMatch(updated, /old-first|old-duplicate/);

  const { calls, databaseName, dependencies } = createHarness();
  let writeAttempt = 0;
  dependencies.fs.writeFile = async (file, content) => {
    writeAttempt += 1;
    calls.writes.push({ file, content });
    if (writeAttempt === 1) throw new Error('simulated write failure');
  };

  await assert.rejects(
    Rotation.main(
      ['--apply', `--confirm-database=${databaseName}`],
      dependencies
    ),
    /simulated write failure/
  );
  assert.equal(writeAttempt, 2);
  assert.match(calls.writes[1].content, /SESSION_SECRET=old-session-secret-never-log/);
});
