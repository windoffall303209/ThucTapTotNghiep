const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');

const db = require('../config/db');
const Admin = require('../models/Admin');
const AdminController = require('../controllers/AdminController');

function makeResponse() {
  return {
    redirectedTo: '',
    cookieCleared: false,
    clearCookie() {
      this.cookieCleared = true;
    },
    redirect(url) {
      this.redirectedTo = url;
      return url;
    }
  };
}

function makeRequest(body) {
  return {
    auth: { id: 7, role: 'SYSADMIN', type: 'admin' },
    body,
    session: {}
  };
}

test('model quản trị băm mật khẩu trước khi lưu', async (t) => {
  const originalQuery = db.query;
  let storedHash = '';
  t.after(() => {
    db.query = originalQuery;
  });
  db.query = async (sql, params) => {
    assert.match(sql, /UPDATE Admins SET password_hash = \?/);
    storedHash = params[0];
    assert.equal(params[1], 7);
    return { affectedRows: 1 };
  };

  const returnedHash = await Admin.updatePassword(7, 'MatKhauMoi-2026!');
  assert.equal(returnedHash, storedHash);
  assert.notEqual(storedHash, 'MatKhauMoi-2026!');
  assert.equal(await bcrypt.compare('MatKhauMoi-2026!', storedHash), true);
});

test('đổi mật khẩu quản trị bắt buộc mật khẩu hiện tại và chính sách mạnh', async (t) => {
  const originalFindById = Admin.findById;
  const originalUpdatePassword = Admin.updatePassword;
  const currentHash = await bcrypt.hash('MatKhauCu-2026!', 4);
  const updates = [];
  t.after(() => {
    Admin.findById = originalFindById;
    Admin.updatePassword = originalUpdatePassword;
  });
  Admin.findById = async () => ({ id: 7, password_hash: currentHash });
  Admin.updatePassword = async (id, password) => updates.push({ id, password });

  const wrongCurrent = makeRequest({
    current_password: 'SaiMatKhau-2026!',
    new_password: 'MatKhauMoi-2026!',
    confirm_password: 'MatKhauMoi-2026!'
  });
  const wrongResponse = makeResponse();
  await AdminController.updateOwnPassword(wrongCurrent, wrongResponse, assert.fail);
  assert.equal(updates.length, 0);
  assert.equal(wrongResponse.redirectedTo, '/admin/dashboard?account=password');
  assert.match(wrongCurrent.session.flash.message, /hiện tại không đúng/);

  const weakPassword = makeRequest({
    current_password: 'MatKhauCu-2026!',
    new_password: 'yeu',
    confirm_password: 'yeu'
  });
  const weakResponse = makeResponse();
  await AdminController.updateOwnPassword(weakPassword, weakResponse, assert.fail);
  assert.equal(updates.length, 0);
  assert.match(weakPassword.session.flash.message, /ít nhất 10 ký tự/);
});

test('đổi mật khẩu quản trị thành công làm phiên đăng nhập cũ mất hiệu lực', async (t) => {
  const originalFindById = Admin.findById;
  const originalUpdatePassword = Admin.updatePassword;
  const currentHash = await bcrypt.hash('MatKhauCu-2026!', 4);
  const updates = [];
  t.after(() => {
    Admin.findById = originalFindById;
    Admin.updatePassword = originalUpdatePassword;
  });
  Admin.findById = async () => ({ id: 7, password_hash: currentHash });
  Admin.updatePassword = async (id, password) => updates.push({ id, password });

  const request = makeRequest({
    current_password: 'MatKhauCu-2026!',
    new_password: 'MatKhauMoi-2026!',
    confirm_password: 'MatKhauMoi-2026!'
  });
  const response = makeResponse();
  await AdminController.updateOwnPassword(request, response, assert.fail);

  assert.deepEqual(updates, [{ id: 7, password: 'MatKhauMoi-2026!' }]);
  assert.equal(response.cookieCleared, true);
  assert.equal(response.redirectedTo, '/auth/admin/login');
  assert.match(request.session.flash.message, /đăng nhập lại/);
});
