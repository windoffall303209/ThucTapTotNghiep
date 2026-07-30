const { GRADE_RANGE_LABEL, isSupportedGrade } = require('../config/grades');
const Admin = require('../models/Admin');
const Student = require('../models/Student');
const { clearAuthCookie, getCredentialVersion } = require('../utils/authToken');

// Trang luyện tập nộp đáp án bằng fetch. Nếu chặn bằng redirect thì fetch đi
// theo chuyển hướng, nhận về HTML trang đăng nhập kèm mã 200, rồi response.json()
// ném lỗi và phía client hiểu sai thành lỗi mạng. Với request JSON phải trả mã
// 401 kèm mã lỗi rõ ràng để client phân biệt được.
function wantsJson(req) {
  return Boolean(
    req.xhr
    || req.is('application/json')
    || String(req.get('accept') || '').includes('application/json')
  );
}

async function requireStudent(req, res, next) {
  if (!req.auth || req.auth.role !== 'student') {
    if (wantsJson(req)) {
      return res.status(401).json({
        ok: false,
        code: 'SESSION_EXPIRED',
        message: 'Phiên học đã hết hạn. Em đăng nhập lại rồi làm tiếp nhé.'
      });
    }
    req.session.flash = {
      type: 'warning',
      message: 'Vui lòng đăng nhập để tiếp tục học tập.'
    };
    return res.redirect('/auth/login');
  }

  try {
    const student = await Student.findById(req.auth.id);
    if (
      !student
      || Number(student.is_active ?? 1) !== 1
      || req.auth.type !== 'student'
      || req.auth.credential_version !== getCredentialVersion(student.password_hash)
    ) {
      clearAuthCookie(res);
      if (wantsJson(req)) {
        return res.status(403).json({
          ok: false,
          code: 'ACCOUNT_DISABLED',
          message: 'Tài khoản đã bị tạm khóa. Vui lòng liên hệ quản trị viên.'
        });
      }
      req.session.flash = {
        type: 'danger',
        message: 'Tài khoản đã bị tạm khóa. Vui lòng liên hệ quản trị viên để được hỗ trợ.'
      };
      return res.redirect('/auth/login');
    }

    if (!isSupportedGrade(student.current_grade)) {
      clearAuthCookie(res);
      req.session.flash = {
        type: 'danger',
        message: `Tài khoản đang có khối học ngoài phạm vi ${GRADE_RANGE_LABEL}. Vui lòng liên hệ quản trị viên để cập nhật.`
      };
      return res.redirect('/auth/login');
    }

    req.auth.current_grade = student.current_grade;
    return next();
  } catch (error) {
    return next(error);
  }
}

async function requireAdmin(req, res, next) {
  if (!req.auth || req.auth.type !== 'admin' || !['SYSADMIN', 'CONTENT_ADMIN'].includes(req.auth.role)) {
    req.session.flash = {
      type: 'warning',
      message: 'Vui lòng đăng nhập bằng tài khoản quản trị.'
    };
    return res.redirect('/auth/login?role=admin');
  }

  try {
    const admin = await Admin.findById(req.auth.id);
    if (
      !admin
      || Number(admin.is_active) !== 1
      || !['SYSADMIN', 'CONTENT_ADMIN'].includes(admin.role)
      || req.auth.credential_version !== getCredentialVersion(admin.password_hash)
    ) {
      clearAuthCookie(res);
      req.session.flash = {
        type: 'warning',
        message: 'Phiên quản trị không còn hợp lệ. Vui lòng đăng nhập lại.'
      };
      return res.redirect('/auth/login?role=admin');
    }

    req.auth.username = admin.username;
    req.auth.fullname = admin.fullname;
    req.auth.role = admin.role;
    return next();
  } catch (error) {
    return next(error);
  }
}

function requireRoles(roles) {
  return (req, res, next) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      req.session.flash = {
        type: 'danger',
        message: 'Tài khoản của bạn không có quyền truy cập chức năng này.'
      };
      return res.redirect('/admin/dashboard');
    }

    return next();
  };
}

module.exports = {
  requireStudent,
  requireAdmin,
  requireRoles
};
