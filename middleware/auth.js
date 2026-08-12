// Middleware auth kiểm tra hoặc bổ sung ngữ cảnh trước khi yêu cầu đi vào bộ xử lý tiếp theo.
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

// Hàm requireStudent dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function requireStudent(req, res, next) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!req.auth || req.auth.role !== 'student') {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (wantsJson(req)) {
      return sendAuthJson(
        res,
        401,
        'SESSION_EXPIRED',
        'Phiên học đã hết hạn. Em đăng nhập lại rồi làm tiếp nhé.',
        '/auth/student/login'
      );
    }
    req.session.flash = {
      type: 'warning',
      message: 'Vui lòng đăng nhập để tiếp tục học tập.'
    };
    return res.redirect('/auth/student/login');
  }

  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  try {
    const student = await Student.findById(req.auth.id);
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (
      !student
      || Number(student.is_active ?? 1) !== 1
      || req.auth.type !== 'student'
      || req.auth.credential_version !== getCredentialVersion(student.password_hash)
    ) {
      clearAuthCookie(res);
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (wantsJson(req)) {
        return sendAuthJson(
          res,
          403,
          'ACCOUNT_DISABLED',
          'Tài khoản đã bị tạm khóa. Vui lòng liên hệ quản trị viên.',
          '/auth/student/login'
        );
      }
      req.session.flash = {
        type: 'danger',
        message: 'Tài khoản đã bị tạm khóa. Vui lòng liên hệ quản trị viên để được hỗ trợ.'
      };
      return res.redirect('/auth/student/login');
    }

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!isSupportedGrade(student.current_grade)) {
      clearAuthCookie(res);
      req.session.flash = {
        type: 'danger',
        message: `Tài khoản đang có khối học ngoài phạm vi ${GRADE_RANGE_LABEL}. Vui lòng liên hệ quản trị viên để cập nhật.`
      };
      return res.redirect('/auth/student/login');
    }

    req.auth.current_grade = student.current_grade;
    return next();
  } catch (error) {
    return next(error);
  }
}

// Hàm requireAdmin dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function requireAdmin(req, res, next) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!req.auth || req.auth.type !== 'admin' || !['SYSADMIN', 'CONTENT_ADMIN'].includes(req.auth.role)) {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (wantsJson(req)) {
      return sendAuthJson(
        res,
        401,
        'SESSION_EXPIRED',
        'Phiên quản trị đã hết hạn. Vui lòng đăng nhập lại.',
        '/auth/admin/login'
      );
    }
    req.session.flash = {
      type: 'warning',
      message: 'Vui lòng đăng nhập bằng tài khoản quản trị.'
    };
    return res.redirect('/auth/admin/login');
  }

  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  try {
    const admin = await Admin.findById(req.auth.id);
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (
      !admin
      || Number(admin.is_active) !== 1
      || !['SYSADMIN', 'CONTENT_ADMIN'].includes(admin.role)
      || req.auth.credential_version !== getCredentialVersion(admin.password_hash)
    ) {
      clearAuthCookie(res);
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (wantsJson(req)) {
        return sendAuthJson(
          res,
          401,
          'SESSION_INVALID',
          'Phiên quản trị không còn hợp lệ. Vui lòng đăng nhập lại.',
          '/auth/admin/login'
        );
      }
      req.session.flash = {
        type: 'warning',
        message: 'Phiên quản trị không còn hợp lệ. Vui lòng đăng nhập lại.'
      };
      return res.redirect('/auth/admin/login');
    }

    req.auth.username = admin.username;
    req.auth.fullname = admin.fullname;
    req.auth.role = admin.role;
    return next();
  } catch (error) {
    return next(error);
  }
}

// Hàm requireRoles dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function requireRoles(roles) {
  return (req, res, next) => {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!req.auth || !roles.includes(req.auth.role)) {
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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

// Hàm sendAuthJson dùng để xử lý xác thực và cập nhật trạng thái phiên người dùng; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
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
