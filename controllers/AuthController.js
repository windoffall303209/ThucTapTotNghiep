// B? ?i?u khi?n auth controller ti?p nh?n y?u c?u, ki?m tra d? li?u v? ?i?u ph?i ph?n h?i cho ng??i d?ng.
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

// H?m showLogin d?ng ?? chu?n b? v? hi?n th? k?t qu? cho ng??i d?ng; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function showLogin(req, res) {
  res.render('auth/login', {
    title: 'Đăng nhập',
    role: req.query.role || 'student'
  });
}

// H?m showRegister d?ng ?? chu?n b? v? hi?n th? k?t qu? cho ng??i d?ng; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function showRegister(req, res) {
  res.render('auth/register', {
    title: 'Đăng ký tài khoản'
  });
}

// H?m register d?ng ?? t?o b?n ghi ho?c t?i nguy?n m?i sau khi ki?m tra ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function register(req, res, next) {
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    const { password, confirmPassword, grade } = req.body;
    const username = normalizeUsername(req.body.username);
    const fullname = normalizeFullname(req.body.fullname);

    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!username || !password || !confirmPassword || !fullname || !grade) {
      setFlash(req, 'danger', 'Vui lòng điền đầy đủ tất cả các trường.');
      return res.redirect('/auth/register');
    }

    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (password !== confirmPassword) {
      setFlash(req, 'danger', 'Mật khẩu xác nhận không trùng khớp.');
      return res.redirect('/auth/register');
    }

    const usernameError = validateUsername(username);
    const fullnameError = validateFullname(fullname);
    const passwordError = validatePassword(password);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (usernameError || fullnameError || passwordError) {
      setFlash(req, 'danger', usernameError || fullnameError || passwordError);
      return res.redirect('/auth/register');
    }

    const normalizedGrade = normalizeGrade(grade);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!isSupportedGrade(normalizedGrade)) {
      setFlash(req, 'danger', `Khối học phải nằm trong phạm vi từ ${GRADE_RANGE_LABEL}.`);
      return res.redirect('/auth/register');
    }

    const existingStudent = await Student.findByUsername(username);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
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
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (error.code === 'ER_DUP_ENTRY' || error.code === 'DUPLICATE_USERNAME') {
      setFlash(req, 'danger', 'Tên đăng nhập đã tồn tại, vui lòng chọn tên khác.');
      return res.redirect('/auth/register');
    }
    return next(error);
  }
}

// H?m login d?ng ?? x? l? x?c th?c v? c?p nh?t tr?ng th?i phi?n ng??i d?ng; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function login(req, res, next) {
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    const { password, role } = req.body;
    const username = normalizeUsername(req.body.username);

    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (
      !username
      || !password
      || validateUsername(username, { login: true })
      || Buffer.byteLength(String(password), 'utf8') > 72
    ) {
      setFlash(req, 'danger', 'Vui lòng nhập tên đăng nhập và mật khẩu.');
      return res.redirect(`/auth/login${role === 'admin' ? '?role=admin' : ''}`);
    }

    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (role === 'admin') {
      return loginAdmin(req, res, username, password);
    }

    const student = await Student.findByUsername(username);
    const isValidPassword = await bcrypt.compare(
      password,
      student?.password_hash || DUMMY_PASSWORD_HASH
    );
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!student || !isValidPassword) {
      setFlash(req, 'danger', 'Tài khoản hoặc mật khẩu không chính xác.');
      return res.redirect('/auth/login');
    }

    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
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

// H?m logout d?ng ?? x? l? x?c th?c v? c?p nh?t tr?ng th?i phi?n ng??i d?ng; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function logout(req, res, next) {
  clearAuthCookie(res);
  req.session.destroy((error) => {
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (error) return next(error);
    return res.redirect('/');
  });
}

// H?m loginAdmin d?ng ?? x? l? x?c th?c v? c?p nh?t tr?ng th?i phi?n ng??i d?ng; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function loginAdmin(req, res, username, password) {
  const admin = await verifyAdminCredentials(username, password);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
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

// H?m verifyAdminCredentials d?ng ?? ??i chi?u k?t qu? v?i c?c ?i?u ki?n mong ??i v? b?o c?o sai l?ch; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function verifyAdminCredentials(username, password) {
  const admin = await Admin.findByUsername(username);
  const isValidAdminPassword = await bcrypt.compare(
    password,
    admin?.password_hash || DUMMY_PASSWORD_HASH
  );
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!admin || Number(admin.is_active) !== 1 || !isValidAdminPassword) {
    return null;
  }

  return admin;
}

// H?m toStudentTokenPayload d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
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
