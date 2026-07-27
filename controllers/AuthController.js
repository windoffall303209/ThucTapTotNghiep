const bcrypt = require('bcryptjs');
const Admin = require('../models/Admin');
const Student = require('../models/Student');
const { setFlash } = require('../utils/flash');
const { clearAuthCookie, setAuthCookie } = require('../utils/authToken');
const { GRADE_RANGE_LABEL, isSupportedGrade, normalizeGrade } = require('../config/grades');

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
    const { username, password, confirmPassword, fullname, grade } = req.body;

    if (!username || !password || !confirmPassword || !fullname || !grade) {
      setFlash(req, 'danger', 'Vui lòng điền đầy đủ tất cả các trường.');
      return res.redirect('/auth/register');
    }

    if (password !== confirmPassword) {
      setFlash(req, 'danger', 'Mật khẩu xác nhận không trùng khớp.');
      return res.redirect('/auth/register');
    }

    if (password.length < 8) {
      setFlash(req, 'danger', 'Mật khẩu phải có ít nhất 8 ký tự.');
      return res.redirect('/auth/register');
    }

    const normalizedGrade = normalizeGrade(grade);
    if (!isSupportedGrade(normalizedGrade)) {
      setFlash(req, 'danger', `Khối học phải nằm trong phạm vi từ ${GRADE_RANGE_LABEL}.`);
      return res.redirect('/auth/register');
    }

    const existingStudent = await Student.findByUsername(username.trim());
    if (existingStudent) {
      setFlash(req, 'danger', 'Tên đăng nhập đã tồn tại, vui lòng chọn tên khác.');
      return res.redirect('/auth/register');
    }

    const student = await Student.createStudent({
      username: username.trim(),
      password,
      fullname: fullname.trim(),
      grade: normalizedGrade
    });

    setAuthCookie(res, toStudentTokenPayload(student));
    setFlash(req, 'success', 'Đăng ký thành công. Em có thể bắt đầu ôn luyện ngay.');
    return res.redirect('/student/dashboard');
  } catch (error) {
    return next(error);
  }
}

async function login(req, res, next) {
  try {
    const { username, password, role } = req.body;

    if (!username || !password) {
      setFlash(req, 'danger', 'Vui lòng nhập tên đăng nhập và mật khẩu.');
      return res.redirect(`/auth/login${role === 'admin' ? '?role=admin' : ''}`);
    }

    if (role === 'admin') {
      return loginAdmin(req, res, username.trim(), password);
    }

    const student = await Student.findByUsername(username.trim());
    if (!student) {
      setFlash(req, 'danger', 'Tài khoản hoặc mật khẩu không chính xác.');
      return res.redirect('/auth/login');
    }

    const isValidPassword = await bcrypt.compare(password, student.password_hash);
    if (!isValidPassword) {
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
    setFlash(req, 'success', 'Đăng nhập thành công.');
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
      type: 'admin'
    });
    setFlash(req, 'success', 'Đăng nhập quản trị thành công.');
    return res.redirect('/admin/dashboard');
  }

  setFlash(req, 'danger', 'Tài khoản hoặc mật khẩu quản trị không chính xác.');
  return res.redirect('/auth/login?role=admin');
}

async function verifyAdminCredentials(username, password) {
  const admin = await Admin.findByUsername(username);
  if (!admin || Number(admin.is_active) !== 1) {
    return null;
  }

  const isValidAdminPassword = await bcrypt.compare(password, admin.password_hash);
  if (!isValidAdminPassword) {
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
    type: 'student'
  };
}

module.exports = {
  showLogin,
  showRegister,
  register,
  login,
  logout
};
