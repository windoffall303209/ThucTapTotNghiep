// Bộ kiểm thử admin student management.test xác minh hành vi và các điều kiện biên quan trọng của hệ thống.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcryptjs');

const db = require('../config/db');
const Student = require('../models/Student');
const AdminController = require('../controllers/AdminController');
const { getCredentialVersion } = require('../utils/authToken');

// Hàm makeRequest dùng để xử lý yêu cầu, điều phối các bước nghiệp vụ và phản hồi lỗi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function makeRequest(body = {}) {
  return {
    auth: { id: 1, role: 'SYSADMIN', type: 'admin' },
    params: { id: '81' },
    body,
    session: {}
  };
}

// Hàm makeResponse dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function makeResponse() {
  return {
    redirectedTo: '',
    // Hàm redirect dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
    redirect(url) {
      this.redirectedTo = url;
      return url;
    }
  };
}

test('đổi khối đóng phiên đang làm và cập nhật học sinh trong cùng transaction', async (t) => {
  const originalTransaction = db.transaction;
  const statements = [];
  let transactionCount = 0;
  t.after(() => {
    db.transaction = originalTransaction;
  });

  db.transaction = async (callback) => {
    transactionCount += 1;
    return callback({
      // Hàm execute dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
      async execute(sql, params) {
        statements.push({ sql, params });
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (/SELECT id, current_grade/i.test(sql)) {
          return [[{ id: 81, current_grade: 4 }]];
        }
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (/UPDATE PracticeSessions/i.test(sql)) {
          return [{ affectedRows: 2 }];
        }
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (/UPDATE Students/i.test(sql)) {
          return [{ affectedRows: 1 }];
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      }
    });
  };

  const result = await Student.updateCurrentGrade(81, 5);
  const sql = statements.map((statement) => statement.sql).join('\n');

  assert.equal(transactionCount, 1);
  assert.deepEqual(result, {
    changed: true,
    previousGrade: 4,
    currentGrade: 5,
    completedSessionCount: 2
  });
  assert.match(sql, /status = 'COMPLETED'/);
  assert.match(sql, /completion_reason = 'ACCOUNT_GRADE_CHANGED'/);
  assert.match(sql, /active_key = NULL/);
  assert.match(sql, /status = 'IN_PROGRESS'/);
  assert.match(sql, /SET current_grade = \?/);
  assert.doesNotMatch(sql, /\bDELETE\b/i);
  assert.deepEqual(statements.at(-1).params, [5, 81]);
});

test('model từ chối khối ngoài 1-5 trước khi mở transaction', async (t) => {
  const originalTransaction = db.transaction;
  let called = false;
  t.after(() => {
    db.transaction = originalTransaction;
  });
  db.transaction = async () => {
    called = true;
  };

  await assert.rejects(
    () => Student.updateCurrentGrade(81, 6),
    (error) => error.code === 'INVALID_STUDENT_GRADE'
  );
  assert.equal(called, false);
});

test('đặt mật khẩu tạo bcrypt hash mới và làm credential version JWT cũ mất hiệu lực', async (t) => {
  const originalQuery = db.query;
  const temporaryPassword = 'TamThoi-2026!';
  const oldHash = await bcrypt.hash('MatKhauCu-2025!', 4);
  let storedHash = '';
  t.after(() => {
    db.query = originalQuery;
  });

  db.query = async (sql, params) => {
    assert.match(sql, /UPDATE Students SET password_hash = \?/);
    storedHash = params[0];
    assert.notEqual(storedHash, temporaryPassword);
    return { affectedRows: 1 };
  };

  const returnedHash = await Student.updatePassword(81, temporaryPassword);

  assert.equal(returnedHash, storedHash);
  assert.equal(await bcrypt.compare(temporaryPassword, storedHash), true);
  assert.notEqual(getCredentialVersion(oldHash), getCredentialVersion(storedHash));
});

test('controller dùng validation, bắt buộc xác nhận và không làm lộ mật khẩu khi redirect/flash', async (t) => {
  const originalFindById = Student.findById;
  const originalUpdatePassword = Student.updatePassword;
  const savedPasswords = [];
  t.after(() => {
    Student.findById = originalFindById;
    Student.updatePassword = originalUpdatePassword;
  });
  Student.findById = async () => ({ id: 81, username: 'hs81' });
  Student.updatePassword = async (studentId, password) => {
    savedPasswords.push({ studentId, password });
  };

  const invalidRequest = makeRequest({
    temporary_password: 'ngan',
    confirm_password: 'ngan',
    q: 'an',
    grade: '4',
    page: '5'
  });
  const invalidResponse = makeResponse();
  await AdminController.resetStudentPassword(invalidRequest, invalidResponse, assert.fail);
  assert.equal(savedPasswords.length, 0);
  assert.match(invalidRequest.session.flash.message, /ít nhất 8 ký tự/);

  const mismatchRequest = makeRequest({
    temporary_password: 'TamThoi-2026!',
    confirm_password: 'KhongTrung-2026!',
    q: 'an',
    grade: '4',
    page: '5'
  });
  const mismatchResponse = makeResponse();
  await AdminController.resetStudentPassword(mismatchRequest, mismatchResponse, assert.fail);
  assert.equal(savedPasswords.length, 0);
  assert.match(mismatchRequest.session.flash.message, /không khớp/);

  const temporaryPassword = 'TamThoi-2026!';
  const successRequest = makeRequest({
    temporary_password: temporaryPassword,
    confirm_password: temporaryPassword,
    q: 'an',
    grade: '4',
    page: '5'
  });
  const successResponse = makeResponse();
  await AdminController.resetStudentPassword(successRequest, successResponse, assert.fail);

  assert.deepEqual(savedPasswords, [{ studentId: 81, password: temporaryPassword }]);
  assert.equal(successResponse.redirectedTo, '/admin/students?q=an&grade=4&page=5');
  assert.equal(successResponse.redirectedTo.includes(temporaryPassword), false);
  assert.equal(successRequest.session.flash.message.includes(temporaryPassword), false);
});

test('controller kiểm tra khối và giữ bộ lọc, trang sau khi đổi thành công', async (t) => {
  const originalFindById = Student.findById;
  const originalUpdateCurrentGrade = Student.updateCurrentGrade;
  let updateCalls = 0;
  t.after(() => {
    Student.findById = originalFindById;
    Student.updateCurrentGrade = originalUpdateCurrentGrade;
  });
  Student.findById = async () => ({ id: 81, username: 'hs81', current_grade: 4 });
  Student.updateCurrentGrade = async () => {
    updateCalls += 1;
    return {
      changed: true,
      previousGrade: 4,
      currentGrade: 5,
      completedSessionCount: 2
    };
  };

  const invalidRequest = makeRequest({ current_grade: '0', q: 'an', grade: '4', page: '5' });
  const invalidResponse = makeResponse();
  await AdminController.updateStudentGrade(invalidRequest, invalidResponse, assert.fail);
  assert.equal(updateCalls, 0);
  assert.match(invalidRequest.session.flash.message, /Khối lớp/);

  const successRequest = makeRequest({ current_grade: '5', q: 'an', grade: '4', page: '5' });
  const successResponse = makeResponse();
  await AdminController.updateStudentGrade(successRequest, successResponse, assert.fail);

  assert.equal(updateCalls, 1);
  assert.equal(successResponse.redirectedTo, '/admin/students?q=an&grade=4&page=5');
  assert.match(successRequest.session.flash.message, /2 bài đang làm/);
  assert.match(successRequest.session.flash.message, /lịch sử học tập vẫn được giữ nguyên/i);
});

test('hai endpoint nhạy cảm chỉ được gắn với quyền SYSADMIN', () => {
  const routes = fs.readFileSync(
    path.join(__dirname, '..', 'routes', 'adminRoutes.js'),
    'utf8'
  );

  assert.match(
    routes,
    /router\.post\('\/students\/:id\/password', requireRoles\(\['SYSADMIN'\]\), AdminController\.resetStudentPassword\)/
  );
  assert.match(
    routes,
    /router\.post\('\/students\/:id\/grade', requireRoles\(\['SYSADMIN'\]\), AdminController\.updateStudentGrade\)/
  );
});
