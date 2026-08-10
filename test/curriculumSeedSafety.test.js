// B? ki?m th? curriculum seed safety.test x?c minh h?nh vi v? c?c ?i?u ki?n bi?n quan tr?ng c?a h? th?ng.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  buildExecutionPlan,
  executePlan,
  parseArguments,
  parseCurriculum
} = require('../scripts/seed_curriculum');

const scriptPath = path.join(__dirname, '..', 'scripts', 'seed_curriculum.js');
const packagePath = path.join(__dirname, '..', 'package.json');

// H?m databaseEnv d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function databaseEnv(overrides = {}) {
  return {
    DB_HOST: '127.0.0.1',
    DB_PORT: '3306',
    DB_USER: 'app',
    DB_PASSWORD: 'secret',
    DB_NAME: 'math_test',
    DB_SSL_MODE: 'disabled',
    ...overrides
  };
}

// H?m sourceReader d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function sourceReader() {
  return [
    'LỚP 3 - SÁCH TOÁN',
    '--- GIẢI TOÁN 3 TẬP 1 ---',
    'CHƯƠNG 1: SỐ HỌC',
    '+ Bài 1',
    '+ Bài 2'
  ].join('\n');
}

test('parser nhận đúng tiêu đề tiếng Việt và học kỳ', () => {
  const chapters = parseCurriculum(sourceReader());
  assert.equal(chapters.length, 1);
  assert.deepEqual(chapters[0], {
    grade: 3,
    semester: 1,
    name: 'CHƯƠNG 1: SỐ HỌC',
    sortOrder: 1,
    lessons: [
      { name: 'Bài 1', sortOrder: 1 },
      { name: 'Bài 2', sortOrder: 2 }
    ]
  });
});

test('seed mặc định chỉ preflight và không mở kết nối database', async () => {
  const args = parseArguments([]);
  const plan = buildExecutionPlan(args, databaseEnv(), {
    readFileSync: sourceReader,
    projectRoot: __dirname
  });
  let connectionRequested = false;
  const result = await executePlan(plan, databaseEnv(), {
    createConnection: async () => {
      connectionRequested = true;
      throw new Error('không được gọi');
    }
  });

  assert.equal(plan.apply, false);
  assert.equal(result.applied, false);
  assert.equal(connectionRequested, false);
});

test('chế độ apply bắt buộc xác nhận chính xác tên database', () => {
  const options = {
    readFileSync: sourceReader,
    projectRoot: __dirname
  };
  assert.throws(
    () => buildExecutionPlan(
      parseArguments(['--apply', '--confirm-database=wrong_database']),
      databaseEnv(),
      options
    ),
    /--confirm-database=math_test/
  );
  assert.doesNotThrow(() => buildExecutionPlan(
    parseArguments(['--apply', '--confirm-database=math_test']),
    databaseEnv(),
    options
  ));
});

test('script không xóa chương/bài và dùng cấu hình TLS database chung', () => {
  const source = fs.readFileSync(scriptPath, 'utf8');
  assert.doesNotMatch(source, /\bDELETE\s+FROM\s+(?:Lessons|Chapters)\b/i);
  assert.match(source, /buildDatabasePoolOptions/);
  assert.match(source, /loadDatabaseSslMaterial/);
  assert.match(source, /multipleStatements:\s*false/);
});

test('npm script giữ preflight làm hành vi mặc định', () => {
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  assert.equal(
    packageJson.scripts['db:seed-curriculum'],
    'node scripts/seed_curriculum.js'
  );
  assert.equal(parseArguments([]).apply, false);
});

test('từ chối tham số seed không xác định', () => {
  assert.throws(
    () => parseArguments(['--force']),
    /Tham số không được hỗ trợ/
  );
});
