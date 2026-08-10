// Middleware auth ki?m tra ho?c b? sung ng? c?nh tr??c khi y?u c?u ?i v?o b? x? l? ti?p theo.
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
    || ['fetch', 'xmlhttprequest'].includes(String(req.get('x-requested-with') || '').toLowerCase())
  );
}

// H?m requireStudent d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function requireStudent(req, res, next) {
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!req.auth || req.auth.role !== 'student') {
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (wantsJson(req)) {
      return sendAuthJson(
        res,
        401,
        'SESSION_EXPIRED',
        'Phiên học đã hết hạn. Em đăng nhập lại rồi làm tiếp nhé.',
        '/auth/login'
      );
    }
    req.session.flash = {
      type: 'warning',
      message: 'Vui lòng đăng nhập để tiếp tục học tập.'
    };
    return res.redirect('/auth/login');
  }

  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    const student = await Student.findById(req.auth.id);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (
      !student
      || Number(student.is_active ?? 1) !== 1
      || req.auth.type !== 'student'
      || req.auth.credential_version !== getCredentialVersion(student.password_hash)
    ) {
      clearAuthCookie(res);
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (wantsJson(req)) {
        return sendAuthJson(
          res,
          403,
          'ACCOUNT_DISABLED',
          'Tài khoản đã bị tạm khóa. Vui lòng liên hệ quản trị viên.',
          '/auth/login'
        );
      }
      req.session.flash = {
        type: 'danger',
        message: 'Tài khoản đã bị tạm khóa. Vui lòng liên hệ quản trị viên để được hỗ trợ.'
      };
      return res.redirect('/auth/login');
    }

    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
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

// H?m requireAdmin d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function requireAdmin(req, res, next) {
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!req.auth || req.auth.type !== 'admin' || !['SYSADMIN', 'CONTENT_ADMIN'].includes(req.auth.role)) {
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (wantsJson(req)) {
      return sendAuthJson(
        res,
        401,
        'SESSION_EXPIRED',
        'Phiên quản trị đã hết hạn. Vui lòng đăng nhập lại.',
        '/auth/login?role=admin'
      );
    }
    req.session.flash = {
      type: 'warning',
      message: 'Vui lòng đăng nhập bằng tài khoản quản trị.'
    };
    return res.redirect('/auth/login?role=admin');
  }

  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    const admin = await Admin.findById(req.auth.id);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (
      !admin
      || Number(admin.is_active) !== 1
      || !['SYSADMIN', 'CONTENT_ADMIN'].includes(admin.role)
      || req.auth.credential_version !== getCredentialVersion(admin.password_hash)
    ) {
      clearAuthCookie(res);
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (wantsJson(req)) {
        return sendAuthJson(
          res,
          401,
          'SESSION_INVALID',
          'Phiên quản trị không còn hợp lệ. Vui lòng đăng nhập lại.',
          '/auth/login?role=admin'
        );
      }
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

// H?m requireRoles d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function requireRoles(roles) {
  return (req, res, next) => {
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!req.auth || !roles.includes(req.auth.role)) {
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (wantsJson(req)) {
        return res.status(403).json({
          ok: false,
          code: 'FORBIDDEN',
          message: 'Tài khoản không có quyền truy cập chức năng này.'
        });
      }
      req.session.flash = {
        type: 'danger',
        message: 'Tài khoản của bạn không có quyền truy cập chức năng này.'
      };
      return res.redirect('/admin/dashboard');
    }

    return next();
  };
}

// H?m sendAuthJson d?ng ?? x? l? x?c th?c v? c?p nh?t tr?ng th?i phi?n ng??i d?ng; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function sendAuthJson(res, status, code, message, redirectTo) {
  res.set('X-Auth-Redirect', redirectTo);
  return res.status(status).json({
    ok: false,
    code,
    message,
    redirectTo
  });
}

module.exports = {
  requireStudent,
  requireAdmin,
  requireRoles,
  wantsJson
};
