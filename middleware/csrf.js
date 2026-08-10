// Middleware csrf kiểm tra hoặc bổ sung ngữ cảnh trước khi yêu cầu đi vào bộ xử lý tiếp theo.
const crypto = require('crypto');

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const TOKEN_BYTES = 32;

// Hàm csrfProtection dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function csrfProtection(req, res, next) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!req.session) {
    return next(new Error('CSRF protection requires express-session.'));
  }

  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(TOKEN_BYTES).toString('base64url');
  }
  res.locals.csrfToken = req.session.csrfToken;

  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!UNSAFE_METHODS.has(req.method)) return next();

  const expectedOrigin = requestOrigin(req);
  const suppliedOrigin = req.get('origin');
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (
    suppliedOrigin
    && suppliedOrigin !== expectedOrigin
    && !allowsOpaqueLoopbackOrigin(req, suppliedOrigin)
  ) {
    return rejectCsrf(req, res, 'CROSS_SITE_ORIGIN');
  }

  const fetchSite = String(req.get('sec-fetch-site') || '').toLowerCase();
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (fetchSite === 'cross-site') {
    return rejectCsrf(req, res, 'CROSS_SITE_REQUEST');
  }

  const contentType = String(req.get('content-type') || '').toLowerCase();
  const suppliedToken = req.get('x-csrf-token') || req.body?._csrf;
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (tokensMatch(req.session.csrfToken, suppliedToken)) return next();

  // Multer parses multipart bodies at route level, after this middleware. Requiring a
  // same-origin browser signal here blocks cross-site upload forms before any bytes
  // are written to disk. JavaScript-enhanced uploads still send the token header.
  if (
    contentType.startsWith('multipart/form-data')
    && suppliedOrigin === expectedOrigin
    && fetchSite !== 'cross-site'
  ) {
    return next();
  }

  return rejectCsrf(req, res, 'INVALID_CSRF_TOKEN');
}

// Trình duyệt nhúng có thể sandbox tài liệu local và gửi Origin: null cho form
// POST. Chỉ nới kiểm tra origin khi chạy development trên loopback; request vẫn
// phải mang đúng CSRF token của phiên ở bước tokensMatch bên dưới.
function allowsOpaqueLoopbackOrigin(req, suppliedOrigin) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (process.env.NODE_ENV === 'production' || suppliedOrigin !== 'null') return false;
  const hostname = String(req.hostname || '').toLowerCase();
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

// Hàm requestOrigin dùng để xử lý yêu cầu, điều phối các bước nghiệp vụ và phản hồi lỗi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function requestOrigin(req) {
  const configured = String(process.env.APP_ORIGIN || '').trim();
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (process.env.NODE_ENV === 'production' && configured) {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    try {
      return new URL(configured).origin;
    } catch (error) {
      // Production startup validation reports malformed APP_ORIGIN. Development
      // can safely fall back to the actual request host.
    }
  }
  return `${req.protocol}://${req.get('host')}`;
}

// Hàm tokensMatch dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function tokensMatch(expected, supplied) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (typeof expected !== 'string' || typeof supplied !== 'string') return false;
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  return (
    expectedBuffer.length === suppliedBuffer.length
    && crypto.timingSafeEqual(expectedBuffer, suppliedBuffer)
  );
}

// Hàm rejectCsrf dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function rejectCsrf(req, res, code) {
  const message = 'Yêu cầu không hợp lệ hoặc trang đã hết hạn. Vui lòng tải lại trang rồi thử lại.';
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (requestWantsJson(req)) {
    return res.status(403).json({ ok: false, code, message });
  }
  return res.status(403).render('error', {
    title: 'Yêu cầu bị từ chối',
    message
  });
}

// Hàm requestWantsJson dùng để xử lý yêu cầu, điều phối các bước nghiệp vụ và phản hồi lỗi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function requestWantsJson(req) {
  return Boolean(
    req.path.startsWith('/api/')
    || req.xhr
    || req.is('application/json')
    || String(req.get('accept') || '').includes('application/json')
    || ['fetch', 'xmlhttprequest'].includes(String(req.get('x-requested-with') || '').toLowerCase())
  );
}

module.exports = {
  csrfProtection,
  allowsOpaqueLoopbackOrigin,
  requestOrigin,
  tokensMatch
};
