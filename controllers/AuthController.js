// Bộ điều khiển auth controller tiếp nhận yêu cầu, kiểm tra dữ liệu và điều phối phản hồi cho người dùng.
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
const { normalizeEmail, validateEmail } = require('../utils/emailValidation');
const AccountRecoveryService = require('../services/AccountRecoveryService');
const EmailService = require('../services/EmailService');
const LoginAttemptService = require('../services/LoginAttemptService');

// Bcrypt must still run when the username does not exist. Returning early makes
// the timing gap large enough to enumerate accounts despite identical messages.
const DUMMY_PASSWORD_HASH = '$2b$10$6tzMhutOT6ddxR6sSqLDiuzw409nMyXSAZW1B3GlPXpJ3cAecZiBq';

// Hàm showLogin dùng để chuẩn bị và hiển thị kết quả cho người dùng; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function showLogin(req, res, role) {
  res.render('auth/login', {
    title: 'Đăng nhập',
    role
  });
}

function showStudentLogin(req, res) {
  return showLogin(req, res, 'student');
}

function showAdminLogin(req, res) {
  return showLogin(req, res, 'admin');
}

function redirectLegacyLogin(req, res) {
  return res.redirect(req.query.role === 'admin' ? '/auth/admin/login' : '/auth/student/login');
}

// Hàm showRegister dùng để chuẩn bị và hiển thị kết quả cho người dùng; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function showRegister(req, res) {
  res.render('auth/register', {
    title: 'Đăng ký tài khoản'
  });
}

// Hàm register dùng để tạo bản ghi hoặc tài nguyên mới sau khi kiểm tra đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function register(req, res, next) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  try {
    const { password, confirmPassword, grade } = req.body;
    const username = normalizeUsername(req.body.username);
    const fullname = normalizeFullname(req.body.fullname);

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (
      !username || typeof password !== 'string' || typeof confirmPassword !== 'string'
      || !password || !confirmPassword || !fullname || !grade
    ) {
      setFlash(req, 'danger', 'Vui lòng điền đầy đủ tất cả các trường.');
      return res.redirect('/auth/register');
    }

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (password !== confirmPassword) {
      setFlash(req, 'danger', 'Mật khẩu xác nhận không trùng khớp.');
      return res.redirect('/auth/register');
    }

    const usernameError = validateUsername(username);
    const fullnameError = validateFullname(fullname);
    const passwordError = validatePassword(password);
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (usernameError || fullnameError || passwordError) {
      setFlash(req, 'danger', usernameError || fullnameError || passwordError);
      return res.redirect('/auth/register');
    }

    const normalizedGrade = normalizeGrade(grade);
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!isSupportedGrade(normalizedGrade)) {
      setFlash(req, 'danger', `Khối học phải nằm trong phạm vi từ ${GRADE_RANGE_LABEL}.`);
      return res.redirect('/auth/register');
    }

    const existingStudent = await Student.findByUsername(username);
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (error.code === 'ER_DUP_ENTRY' || error.code === 'DUPLICATE_USERNAME') {
      setFlash(req, 'danger', 'Tên đăng nhập đã tồn tại, vui lòng chọn tên khác.');
      return res.redirect('/auth/register');
    }
    return next(error);
  }
}

// Hàm login dùng để xử lý xác thực và cập nhật trạng thái phiên người dùng; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function loginForRole(req, res, next, role) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  try {
    const { password } = req.body;
    const username = normalizeUsername(req.body.username);

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (
      !username
      || typeof password !== 'string'
      || !password
      || validateUsername(username, { login: true })
      || Buffer.byteLength(String(password), 'utf8') > 72
    ) {
      setFlash(req, 'danger', 'Vui lòng nhập tên đăng nhập và mật khẩu.');
      return res.redirect(role === 'admin' ? '/auth/admin/login' : '/auth/student/login');
    }

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (role === 'admin') {
      return loginAdmin(req, res, username, password);
    }

    const student = await Student.findByUsername(username);
    const isValidPassword = await bcrypt.compare(
      password,
      student?.password_hash || DUMMY_PASSWORD_HASH
    );
    const lockState = LoginAttemptService.getLockState(student);
    if (lockState.locked) {
      setFlash(req, 'danger', LoginAttemptService.lockMessage(lockState));
      return res.redirect('/auth/student/login');
    }
    if (!student || !isValidPassword) {
      const failure = student
        ? await LoginAttemptService.recordFailure('student', student.id)
        : null;
      if (failure?.locked) {
        setFlash(req, 'danger', LoginAttemptService.lockMessage(failure));
        return res.redirect('/auth/student/login');
      }
      setFlash(req, 'danger', 'Tài khoản hoặc mật khẩu không chính xác.');
      return res.redirect('/auth/student/login');
    }

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (Number(student.is_active ?? 1) !== 1) {
      setFlash(req, 'danger', 'Tài khoản đã bị tạm khóa. Vui lòng liên hệ quản trị viên để được hỗ trợ.');
      return res.redirect('/auth/student/login');
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
      return res.redirect('/auth/student/login');
    }

    await LoginAttemptService.clearFailures('student', student.id);
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

function showForgotPassword(req, res) {
  res.render('auth/forgot-password', { title: 'Quên mật khẩu' });
}

function showResetPassword(req, res) {
  if (!req.session.passwordResetEmail) return res.redirect('/auth/forgot-password');
  res.render('auth/reset-password', { title: 'Đặt lại mật khẩu' });
}

async function requestPasswordReset(req, res, next) {
  const genericMessage = 'Nếu email đã được xác minh, hệ thống đã gửi mã đặt lại mật khẩu gồm 6 số.';
  try {
    const email = normalizeEmail(req.body.email);
    if (validateEmail(email)) {
      setFlash(req, 'success', genericMessage);
      return res.redirect('/auth/forgot-password');
    }
    req.session.passwordResetEmail = email;
    if (!EmailService.isConfigured()) {
      setFlash(req, 'warning', 'Dịch vụ gửi email tạm thời chưa sẵn sàng. Vui lòng liên hệ quản trị viên.');
      return res.redirect('/auth/forgot-password');
    }
    const student = await Student.findByVerifiedEmail(email);
    if (student) {
      setImmediate(async () => {
        try {
          const code = await AccountRecoveryService.issueCode({
            studentId: student.id,
            purpose: 'RESET_PASSWORD',
            email
          });
          await EmailService.sendVerificationCode({ to: email, code, purpose: 'RESET_PASSWORD' });
        } catch (error) {
          if (error.code !== 'OTP_COOLDOWN') {
            await AccountRecoveryService.invalidateActiveCodes({
              studentId: student.id,
              purpose: 'RESET_PASSWORD'
            }).catch(() => {});
            console.error('Không thể phát hành email đặt lại mật khẩu.');
          }
        }
      });
    }
    setFlash(req, 'success', genericMessage);
    return res.redirect('/auth/reset-password');
  } catch (error) {
    if (error.code === 'OTP_COOLDOWN') {
      setFlash(req, 'success', genericMessage);
      return res.redirect('/auth/reset-password');
    }
    if (error.code === 'EMAIL_NOT_CONFIGURED') {
      setFlash(req, 'warning', 'Dịch vụ gửi email tạm thời chưa sẵn sàng. Vui lòng liên hệ quản trị viên.');
      return res.redirect('/auth/forgot-password');
    }
    return next(error);
  }
}

async function resetPassword(req, res, next) {
  try {
    const email = normalizeEmail(req.session.passwordResetEmail);
    const code = typeof req.body.verification_code === 'string' ? req.body.verification_code.trim() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const confirmPassword = typeof req.body.confirm_password === 'string' ? req.body.confirm_password : '';
    const passwordError = validatePassword(password);
    if (!email || !/^\d{6}$/.test(code) || passwordError || password !== confirmPassword) {
      setFlash(
        req,
        'danger',
        password !== confirmPassword
          ? 'Hai mật khẩu chưa trùng khớp.'
          : passwordError || 'Mã xác thực phải gồm đúng 6 chữ số.'
      );
      return res.redirect('/auth/reset-password');
    }
    // Băm cả khi email không tồn tại để giảm chênh lệch thời gian có thể dùng dò tài khoản.
    const passwordHash = await bcrypt.hash(password, 10);
    const student = await Student.findByVerifiedEmail(email);
    const result = student
      ? await AccountRecoveryService.resetPasswordWithCode({
          studentId: student.id,
          email,
          code,
          passwordHash
        })
      : { ok: false };
    if (!student || !result.ok) {
      setFlash(req, 'danger', 'Mã xác thực không đúng, đã hết hạn hoặc đã vượt quá số lần thử.');
      return res.redirect('/auth/reset-password');
    }
    delete req.session.passwordResetEmail;
    clearAuthCookie(res);
    setFlash(req, 'success', 'Mật khẩu đã được đặt lại. Em có thể đăng nhập bằng mật khẩu mới.');
    return res.redirect('/auth/student/login');
  } catch (error) {
    return next(error);
  }
}

function studentLogin(req, res, next) {
  return loginForRole(req, res, next, 'student');
}

function adminLogin(req, res, next) {
  return loginForRole(req, res, next, 'admin');
}

// Giữ endpoint POST cũ để các bookmark/form phiên bản trước tiếp tục hoạt động,
// nhưng vai trò chỉ được chọn tại route mới chứ không còn hiển thị trên giao diện.
function login(req, res, next) {
  return loginForRole(req, res, next, req.body?.role === 'admin' ? 'admin' : 'student');
}

// Hàm logout dùng để xử lý xác thực và cập nhật trạng thái phiên người dùng; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function logout(req, res, next) {
  clearAuthCookie(res);
  req.session.destroy((error) => {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (error) return next(error);
    return res.redirect('/');
  });
}

// Hàm loginAdmin xác thực và áp dụng cùng chính sách khóa tạm cho tài khoản quản trị.
async function loginAdmin(req, res, username, password) {
  const admin = await Admin.findByUsername(username);
  const isValidPassword = await bcrypt.compare(
    password,
    admin?.password_hash || DUMMY_PASSWORD_HASH
  );
  const lockState = LoginAttemptService.getLockState(admin);
  if (lockState.locked) {
    setFlash(req, 'danger', LoginAttemptService.lockMessage(lockState));
    return res.redirect('/auth/admin/login');
  }

  if (!admin || !isValidPassword) {
    const failure = admin
      ? await LoginAttemptService.recordFailure('admin', admin.id)
      : null;
    if (failure?.locked) {
      setFlash(req, 'danger', LoginAttemptService.lockMessage(failure));
      return res.redirect('/auth/admin/login');
    }
    setFlash(req, 'danger', 'Tài khoản hoặc mật khẩu quản trị không chính xác.');
    return res.redirect('/auth/admin/login');
  }

  if (Number(admin.is_active) !== 1) {
    setFlash(req, 'danger', 'Tài khoản quản trị đã bị tạm khóa.');
    return res.redirect('/auth/admin/login');
  }

  await LoginAttemptService.clearFailures('admin', admin.id);
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

// Hàm toStudentTokenPayload dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
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
  redirectLegacyLogin,
  showStudentLogin,
  showAdminLogin,
  showRegister,
  showForgotPassword,
  showResetPassword,
  register,
  requestPasswordReset,
  resetPassword,
  login,
  studentLogin,
  adminLogin,
  logout
};
