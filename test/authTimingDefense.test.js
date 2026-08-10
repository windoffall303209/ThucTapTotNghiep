// Bộ kiểm thử auth timing defense.test xác minh hành vi và các điều kiện biên quan trọng của hệ thống.
const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');

const Admin = require('../models/Admin');
const Student = require('../models/Student');
const AuthController = require('../controllers/AuthController');

// Hàm requestFor dùng để xử lý yêu cầu, điều phối các bước nghiệp vụ và phản hồi lỗi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function requestFor(role) {
  return {
    body: {
      username: 'missing-user',
      password: 'not-the-password',
      role
    },
    session: {}
  };
}

// Hàm responseRecorder dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function responseRecorder() {
  return {
    redirectedTo: '',
    // Hàm redirect dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
    redirect(url) {
      this.redirectedTo = url;
      return this;
    },
    // Hàm cookie dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
    cookie() {}
  };
}

test('đăng nhập tài khoản không tồn tại vẫn chạy bcrypt cho cả học sinh và admin', async (t) => {
  const originalStudentLookup = Student.findByUsername;
  const originalAdminLookup = Admin.findByUsername;
  const originalCompare = bcrypt.compare;
  const comparedHashes = [];
  t.after(() => {
    Student.findByUsername = originalStudentLookup;
    Admin.findByUsername = originalAdminLookup;
    bcrypt.compare = originalCompare;
  });

  Student.findByUsername = async () => null;
  Admin.findByUsername = async () => null;
  bcrypt.compare = async (password, hash) => {
    assert.equal(password, 'not-the-password');
    comparedHashes.push(hash);
    return false;
  };

  const studentResponse = responseRecorder();
  await AuthController.login(requestFor('student'), studentResponse, assert.fail);
  assert.equal(studentResponse.redirectedTo, '/auth/login');

  const adminResponse = responseRecorder();
  await AuthController.login(requestFor('admin'), adminResponse, assert.fail);
  assert.equal(adminResponse.redirectedTo, '/auth/login?role=admin');

  assert.equal(comparedHashes.length, 2);
  comparedHashes.forEach((hash) => {
    assert.match(hash, /^\$2[aby]\$10\$/);
  });
});
