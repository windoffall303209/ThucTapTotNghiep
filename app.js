const express = require('express');
const crypto = require('crypto');
const path = require('path');
const session = require('express-session');
const expressLayouts = require('express-ejs-layouts');
const methodOverride = require('method-override');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const compression = require('compression');
const db = require('./config/db');
const { MySQLSessionStore } = require('./stores/MySQLSessionStore');
const { MySQLRateLimitStore } = require('./stores/MySQLRateLimitStore');
const { attachAuthUser } = require('./utils/authToken');
const { csrfProtection } = require('./middleware/csrf');
const { safeJsonForHtml } = require('./utils/safeJson');
const { gradeOptions, GRADE_RANGE_LABEL, SHORT_GRADE_RANGE_LABEL } = require('./config/grades');
const contentRenderer = require('./public/js/content-renderer');

const homeRoutes = require('./routes/homeRoutes');
const authRoutes = require('./routes/authRoutes');
const studentRoutes = require('./routes/studentRoutes');
const adminRoutes = require('./routes/adminRoutes');
const apiRoutes = require('./routes/apiRoutes');

const app = express();
const isProduction = process.env.NODE_ENV === 'production';
const sessionMaxAgeMs = 1000 * 60 * 60 * 8;
const sessionStore = db.isDatabaseConfigured()
  ? new MySQLSessionStore({ ttlMs: sessionMaxAgeMs })
  : undefined;
const rateLimitStores = db.isDatabaseConfigured()
  ? {
    global: new MySQLRateLimitStore('global'),
    auth: new MySQLRateLimitStore('auth'),
    registration: new MySQLRateLimitStore('registration'),
    ai: new MySQLRateLimitStore('ai')
  }
  : {};
app.locals.sessionStore = sessionStore || null;
app.locals.rateLimitStores = Object.values(rateLimitStores);
if (isProduction) {
  const trustProxyHops = Number(process.env.TRUST_PROXY);
  if (Number.isInteger(trustProxyHops) && trustProxyHops > 0) {
    app.set('trust proxy', trustProxyHops);
  }
}

function isLocalRequest(req) {
  const ip = req.ip || req.socket?.remoteAddress || '';
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip);
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('layout', 'layouts/main');

app.use(expressLayouts);
app.use((req, res, next) => {
  req.requestId = String(req.get('x-request-id') || '').slice(0, 100) || crypto.randomUUID();
  res.set('X-Request-Id', req.requestId);
  next();
});
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", 'data:'],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      upgradeInsecureRequests: isProduction ? [] : null
    }
  },
  crossOriginEmbedderPolicy: false
}));
app.use((req, res, next) => {
  res.set(
    'Permissions-Policy',
    'camera=(), geolocation=(), microphone=(), payment=(), usb=()'
  );
  next();
});
app.use(compression());
app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  maxAge: isProduction ? '7d' : 0
}));
const vendorStaticOptions = {
  etag: true,
  immutable: isProduction,
  maxAge: isProduction ? '30d' : 0
};
app.use(
  '/vendor/katex',
  express.static(path.join(__dirname, 'node_modules', 'katex', 'dist'), vendorStaticOptions)
);
app.use(
  '/vendor/lucide',
  express.static(path.join(__dirname, 'node_modules', 'lucide', 'dist', 'umd'), vendorStaticOptions)
);
app.use(
  '/vendor/nunito',
  express.static(path.join(__dirname, 'node_modules', '@fontsource', 'nunito'), vendorStaticOptions)
);
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: Number(process.env.GLOBAL_RATE_LIMIT || 5000),
    standardHeaders: true,
    legacyHeaders: false,
    store: rateLimitStores.global,
    message: 'Quá nhiều request trong thời gian ngắn. Vui lòng thử lại sau.',
    skip: (req) => !isProduction && isLocalRequest(req)
  })
);
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT || 30),
  standardHeaders: true,
  legacyHeaders: false,
  store: rateLimitStores.auth,
  skip: (req) => req.method !== 'POST',
  message: 'Quá nhiều lần thử đăng nhập. Vui lòng thử lại sau.'
});
const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: Number(process.env.REGISTRATION_RATE_LIMIT || 10),
  standardHeaders: true,
  legacyHeaders: false,
  store: rateLimitStores.registration,
  skip: (req) => req.method !== 'POST',
  message: 'Quá nhiều tài khoản được tạo từ kết nối này. Vui lòng thử lại sau.'
});
const aiLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: Number(process.env.AI_RATE_LIMIT || 30),
  standardHeaders: true,
  legacyHeaders: false,
  store: rateLimitStores.ai,
  keyGenerator: (req) => (
    req.auth?.role === 'student'
      ? `student:${req.auth.id}`
      : ipKeyGenerator(req.ip)
  ),
  handler: (req, res) => res.status(429).json({
    ok: false,
    code: 'AI_RATE_LIMITED',
    message: 'Em đã gửi quá nhiều yêu cầu gợi ý trong thời gian ngắn. Hãy thử lại sau ít phút.',
    requestId: req.requestId
  })
});
app.use(express.urlencoded({ extended: true, limit: process.env.BODY_LIMIT || '2mb' }));
app.use(express.json({ limit: process.env.BODY_LIMIT || '2mb' }));
app.use(methodOverride('_method'));
app.use(cookieParser());

app.use(
  session({
    name: 'math_revision_session',
    secret: process.env.SESSION_SECRET || 'dev-session-secret',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
      maxAge: sessionMaxAgeMs
    }
  })
);

app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  res.locals.student = null;
  res.locals.admin = null;
  res.locals.flash = null;
  res.locals.pageStyles = [];
  res.locals.pageScripts = [];
  res.locals.gradeOptions = gradeOptions();
  res.locals.gradeRangeLabel = GRADE_RANGE_LABEL;
  res.locals.shortGradeRangeLabel = SHORT_GRADE_RANGE_LABEL;
  res.locals.contentRenderer = contentRenderer;
  res.locals.safeJsonForHtml = safeJsonForHtml;
  next();
});

app.use(csrfProtection);
app.use(attachAuthUser);
app.use((req, res, next) => {
  // Every dynamic page carries a session-bound CSRF token in the layout. Static
  // assets have already been served above, so the remaining responses must never
  // be shared by browsers or intermediary caches between users.
  res.set('Cache-Control', 'private, no-store, max-age=0');
  res.set('Pragma', 'no-cache');
  next();
});

app.use((req, res, next) => {
  res.locals.student = req.auth?.role === 'student' ? req.auth : null;
  res.locals.admin = ['SYSADMIN', 'CONTENT_ADMIN'].includes(req.auth?.role) ? req.auth : null;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
});

app.use('/', homeRoutes);
app.use('/auth/login', authLimiter);
app.use('/auth/register', registrationLimiter);
app.use('/auth', authRoutes);
app.use('/student/theory/help', aiLimiter);
app.use('/api/ai', aiLimiter);
app.use('/student', studentRoutes);
app.use('/admin', adminRoutes);
app.use('/api', apiRoutes);

app.use((req, res) => {
  if (requestWantsJson(req)) {
    return res.status(404).json({
      ok: false,
      code: 'NOT_FOUND',
      message: 'Không tìm thấy tài nguyên được yêu cầu.',
      requestId: req.requestId
    });
  }
  res.status(404).render('error', {
    title: 'Không tìm thấy trang',
    message: 'Trang bạn đang tìm không tồn tại hoặc đã được di chuyển.'
  });
});

app.use((err, req, res, next) => {
  console.error(err);
  const status = normalizeErrorStatus(err);
  if (requestWantsJson(req)) {
    return res.status(status).json({
      ok: false,
      code: err.code || (status === 500 ? 'INTERNAL_ERROR' : 'REQUEST_REJECTED'),
      message: status === 500
        ? 'Hệ thống đang gặp lỗi. Vui lòng thử lại sau.'
        : err.message,
      requestId: req.requestId
    });
  }
  res.status(status).render('error', {
    title: 'Lỗi hệ thống',
    message: status === 500
      ? 'Hệ thống đang gặp lỗi. Vui lòng thử lại sau.'
      : err.message
  });
});

function requestWantsJson(req) {
  return Boolean(
    req.path.startsWith('/api/')
    || req.xhr
    || req.is('application/json')
    || String(req.get('accept') || '').includes('application/json')
    || ['fetch', 'xmlhttprequest'].includes(String(req.get('x-requested-with') || '').toLowerCase())
  );
}

function normalizeErrorStatus(error) {
  if (error?.name === 'MulterError') return 400;
  const status = Number(error?.status || error?.statusCode || 500);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
}

module.exports = app;
