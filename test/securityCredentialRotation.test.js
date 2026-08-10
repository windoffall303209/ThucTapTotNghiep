// Bộ kiểm thử security credential rotation.test xác minh hành vi và các điều kiện biên quan trọng của hệ thống.
const test = require('node:test');
const assert = require('node:assert/strict');

const Rotation = require('../scripts/rotate_security_credentials');

// Hàm createHarness dùng để tạo bản ghi hoặc tài nguyên mới sau khi kiểm tra đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
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
      // Hàm readFile dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
      async readFile() {
        calls.reads += 1;
        return [
          'SESSION_SECRET=old-session-secret-never-log',
          'JWT_SECRET=old-jwt-secret-never-log',
          'API_KEY_ENCRYPTION_SECRET=old-encryption-secret-never-log',
          ''
        ].join('\n');
      },
      // Hàm writeFile dùng để cập nhật trạng thái hoặc dữ liệu theo quy tắc nghiệp vụ; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
      async writeFile(file, content) {
        calls.writes.push({ file, content });
      }
    },
    db: {
      // Hàm testConnection dùng để đối chiếu kết quả với các điều kiện mong đợi và báo cáo sai lệch; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
      async testConnection() {
        return { connected: true };
      },
      // Hàm query dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
      async query(sql) {
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (/SELECT DATABASE\(\)/.test(sql)) {
          return [{ database_name: databaseName }];
        }
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (/FROM SystemSettings/.test(sql)) {
          return [{
            setting_key: 'openai_api_key',
            setting_value: 'provider-secret-never-log'
          }];
        }
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (/SELECT username, password_hash/.test(sql)) return [];
        throw new Error(`Unexpected query: ${sql}`);
      },
      // Hàm transaction dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
      async transaction(callback) {
        calls.transactions += 1;
        return callback({
          // Hàm execute dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
          async execute(sql, params = []) {
            calls.executes.push({ sql, params });
            // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
            if (/SELECT DATABASE\(\)/.test(sql)) {
              return [[{ database_name: databaseName }]];
            }
            return [{ affectedRows: 1 }];
          }
        });
      }
    },
    bcrypt: {
      // Hàm compare dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
      async compare() {
        return false;
      },
      // Hàm hash dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
      async hash() {
        calls.hashes += 1;
        return 'password-hash-never-log';
      }
    },
    // Hàm randomSecret dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
    randomSecret() {
      calls.randomSecrets += 1;
      return `generated-secret-${calls.randomSecrets}-never-log`;
    },
    logger: {
      // Hàm log dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
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
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
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
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
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
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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
