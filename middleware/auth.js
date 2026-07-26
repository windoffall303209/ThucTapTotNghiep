const { GRADE_RANGE_LABEL, isSupportedGrade } = require('../config/grades');

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

function requireStudent(req, res, next) {
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

  if (!isSupportedGrade(req.auth.current_grade)) {
    req.session.flash = {
      type: 'danger',
      message: `Tài khoản đang có khối học ngoài phạm vi ${GRADE_RANGE_LABEL}. Vui lòng liên hệ quản trị viên để cập nhật.`
    };
    return res.redirect('/auth/login');
  }

  return next();
}

function requireAdmin(req, res, next) {
  if (!req.auth || !['SYSADMIN', 'CONTENT_ADMIN'].includes(req.auth.role)) {
    req.session.flash = {
      type: 'warning',
      message: 'Vui lòng đăng nhập bằng tài khoản quản trị.'
    };
    return res.redirect('/auth/login?role=admin');
  }

  return next();
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
