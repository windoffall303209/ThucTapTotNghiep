const bcrypt = require('bcryptjs');
const Admin = require('../models/Admin');
const Student = require('../models/Student');
const { setFlash } = require('../utils/flash');
const { clearAuthCookie, getCredentialVersion, setAuthCookie } = require('../utils/authToken');
const { GRADE_RANGE_LABEL, isSupportedGrade, normalizeGrade } = require('../config/grades');
const {
  normalizeFullname,
  normalizeUsername,
  validateFullname,
  validatePassword,
  validateUsername
} = require('../utils/accountValidation');

// Bcrypt must still run when the username does not exist. Returning early makes
// the timing gap large enough to enumerate accounts despite identical messages.
const DUMMY_PASSWORD_HASH = '$2b$10$6tzMhutOT6ddxR6sSqLDiuzw409nMyXSAZW1B3GlPXpJ3cAecZiBq';

function showLogin(req, res) {
  res.render('auth/login', {
    title: 'Đăng nhập',
    role: req.query.role || 'student'
  });
}

function showRegister(req, res) {
  res.render('auth/register', {
    title: 'Đăng ký tài khoản'
  });
}

async function register(req, res, next) {
  try {
    const { password, confirmPassword, grade } = req.body;
    const username = normalizeUsername(req.body.username);
    const fullname = normalizeFullname(req.body.fullname);

    if (!username || !password || !confirmPassword || !fullname || !grade) {
      setFlash(req, 'danger', 'Vui lòng điền đầy đủ tất cả các trường.');
      return res.redirect('/auth/register');
    }

    if (password !== confirmPassword) {
      setFlash(req, 'danger', 'Mật khẩu xác nhận không trùng khớp.');
      return res.redirect('/auth/register');
    }

    const usernameError = validateUsername(username);
    const fullnameError = validateFullname(fullname);
    const passwordError = validatePassword(password);
    if (usernameError || fullnameError || passwordError) {
      setFlash(req, 'danger', usernameError || fullnameError || passwordError);
      return res.redirect('/auth/register');
    }

    const normalizedGrade = normalizeGrade(grade);
    if (!isSupportedGrade(normalizedGrade)) {
      setFlash(req, 'danger', `Khối học phải nằm trong phạm vi từ ${GRADE_RANGE_LABEL}.`);
      return res.redirect('/auth/register');
    }

    const existingStudent = await Student.findByUsername(username);
    if (existingStudent) {
      setFlash(req, 'danger', 'Tên đăng nhập đã tồn tại, vui lòng chọn tên khác.');
      return res.redirect('/auth/register');
    }

    const student = await Student.createStudent({
      username,
      password,
      fullname,
      grade: normalizedGrade
    });

    setAuthCookie(res, toStudentTokenPayload(student));
    setFlash(req, 'success', 'Đăng ký thành công. Em có thể bắt đầu ôn luyện ngay.');
    return res.redirect('/student/dashboard');
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY' || error.code === 'DUPLICATE_USERNAME') {
      setFlash(req, 'danger', 'Tên đăng nhập đã tồn tại, vui lòng chọn tên khác.');
      return res.redirect('/auth/register');
    }
    return next(error);
  }
}

async function login(req, res, next) {
  try {
    const { password, role } = req.body;
    const username = normalizeUsername(req.body.username);

    if (
      !username
      || !password
      || validateUsername(username, { login: true })
      || Buffer.byteLength(String(password), 'utf8') > 72
    ) {
      setFlash(req, 'danger', 'Vui lòng nhập tên đăng nhập và mật khẩu.');
      return res.redirect(`/auth/login${role === 'admin' ? '?role=admin' : ''}`);
    }

    if (role === 'admin') {
      return loginAdmin(req, res, username, password);
    }

    const student = await Student.findByUsername(username);
    const isValidPassword = await bcrypt.compare(
      password,
      student?.password_hash || DUMMY_PASSWORD_HASH
    );
    if (!student || !isValidPassword) {
      setFlash(req, 'danger', 'Tài khoản hoặc mật khẩu không chính xác.');
      return res.redirect('/auth/login');
    }

    if (Number(student.is_active ?? 1) !== 1) {
      setFlash(req, 'danger', 'Tài khoản đã bị tạm khóa. Vui lòng liên hệ quản trị viên để được hỗ trợ.');
      return res.redirect('/auth/login');
    }

    // Phải kiểm tra khối lớp TRƯỚC khi cấp cookie. Nếu để requireStudent chặn
    // sau thì học sinh đã có cookie hợp lệ, bị đá về trang đăng nhập, đăng nhập
    // lại thành công rồi lại bị đá tiếp: vòng lặp không có lối thoát.
    if (!isSupportedGrade(student.current_grade)) {
      setFlash(
        req,
        'danger',
        `Tài khoản đang ở lớp ${student.current_grade}, ngoài phạm vi ${GRADE_RANGE_LABEL} mà hệ thống hỗ trợ. `
        + 'Vui lòng liên hệ quản trị viên để cập nhật lại khối lớp.'
      );
      return res.redirect('/auth/login');
    }

    setAuthCookie(res, toStudentTokenPayload(student));
    setFlash(req, 'success', 'Đăng nhập thành công.', {
      transient: true,
      durationMs: 3000
    });
    return res.redirect('/student/dashboard');
  } catch (error) {
    return next(error);
  }
}

function logout(req, res, next) {
  clearAuthCookie(res);
  req.session.destroy((error) => {
    if (error) return next(error);
    return res.redirect('/');
  });
}

async function loginAdmin(req, res, username, password) {
  const admin = await verifyAdminCredentials(username, password);
  if (admin) {
    setAuthCookie(res, {
      id: admin.id,
      username: admin.username,
      fullname: admin.fullname,
      role: admin.role,
      type: 'admin',
      credential_version: getCredentialVersion(admin.password_hash)
    });
    setFlash(req, 'success', 'Đăng nhập quản trị thành công.', {
      transient: true,
      durationMs: 3000
    });
    return res.redirect('/admin/dashboard');
  }

  setFlash(req, 'danger', 'Tài khoản hoặc mật khẩu quản trị không chính xác.');
  return res.redirect('/auth/login?role=admin');
}

async function verifyAdminCredentials(username, password) {
  const admin = await Admin.findByUsername(username);
  const isValidAdminPassword = await bcrypt.compare(
    password,
    admin?.password_hash || DUMMY_PASSWORD_HASH
  );
  if (!admin || Number(admin.is_active) !== 1 || !isValidAdminPassword) {
    return null;
  }

  return admin;
}

function toStudentTokenPayload(student) {
  return {
    id: student.id,
    username: student.username,
    fullname: student.fullname,
    registered_grade: student.registered_grade,
    current_grade: student.current_grade,
    is_active: Number(student.is_active ?? 1),
    role: 'student',
    type: 'student',
    credential_version: getCredentialVersion(student.password_hash)
  };
}

module.exports = {
  showLogin,
  showRegister,
  register,
  login,
  logout
};
