// B? ki?m th? auth timing defense.test x?c minh h?nh vi v? c?c ?i?u ki?n bi?n quan tr?ng c?a h? th?ng.
const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');

const Admin = require('../models/Admin');
const Student = require('../models/Student');
const AuthController = require('../controllers/AuthController');

// H?m requestFor d?ng ?? x? l? y?u c?u, ?i?u ph?i c?c b??c nghi?p v? v? ph?n h?i l?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
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

// H?m responseRecorder d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function responseRecorder() {
  return {
    redirectedTo: '',
    // H?m redirect d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
    redirect(url) {
      this.redirectedTo = url;
      return this;
    },
    // H?m cookie d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
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
