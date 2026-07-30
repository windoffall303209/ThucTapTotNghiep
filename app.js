const express = require('express');
const path = require('path');
const session = require('express-session');
const expressLayouts = require('express-ejs-layouts');
const methodOverride = require('method-override');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const compression = require('compression');
const { attachAuthUser } = require('./utils/authToken');
const { gradeOptions, GRADE_RANGE_LABEL, SHORT_GRADE_RANGE_LABEL } = require('./config/grades');
const contentRenderer = require('./public/js/content-renderer');

const homeRoutes = require('./routes/homeRoutes');
const authRoutes = require('./routes/authRoutes');
const studentRoutes = require('./routes/studentRoutes');
const adminRoutes = require('./routes/adminRoutes');
const apiRoutes = require('./routes/apiRoutes');

const app = express();
const isProduction = process.env.NODE_ENV === 'production';
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
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  maxAge: isProduction ? '7d' : 0
}));
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: Number(process.env.GLOBAL_RATE_LIMIT || 5000),
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Quá nhiều request trong thời gian ngắn. Vui lòng thử lại sau.',
    skip: (req) => !isProduction && isLocalRequest(req)
  })
);
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT || 30),
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method !== 'POST',
  message: 'Quá nhiều lần thử đăng nhập. Vui lòng thử lại sau.'
});
const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: Number(process.env.REGISTRATION_RATE_LIMIT || 10),
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method !== 'POST',
  message: 'Quá nhiều tài khoản được tạo từ kết nối này. Vui lòng thử lại sau.'
});
const aiLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: Number(process.env.AI_RATE_LIMIT || 30),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (
    req.auth?.role === 'student'
      ? `student:${req.auth.id}`
      : ipKeyGenerator(req.ip)
  ),
  message: 'Em đã gửi quá nhiều yêu cầu gợi ý trong thời gian ngắn. Hãy thử lại sau ít phút.'
});
app.use(express.urlencoded({ extended: true, limit: process.env.BODY_LIMIT || '2mb' }));
app.use(express.json({ limit: process.env.BODY_LIMIT || '2mb' }));
app.use(methodOverride('_method'));
app.use(cookieParser());

app.use(
  session({
    name: 'math_revision_session',
    secret: process.env.SESSION_SECRET || 'dev-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
      maxAge: 1000 * 60 * 60 * 8
    }
  })
);

app.use(attachAuthUser);

app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  res.locals.student = req.auth?.role === 'student' ? req.auth : null;
  res.locals.admin = ['SYSADMIN', 'CONTENT_ADMIN'].includes(req.auth?.role) ? req.auth : null;
  res.locals.flash = req.session.flash || null;
  res.locals.pageStyles = [];
  res.locals.pageScripts = [];
  res.locals.gradeOptions = gradeOptions();
  res.locals.gradeRangeLabel = GRADE_RANGE_LABEL;
  res.locals.shortGradeRangeLabel = SHORT_GRADE_RANGE_LABEL;
  res.locals.contentRenderer = contentRenderer;
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
  res.status(404).render('error', {
    title: 'Không tìm thấy trang',
    message: 'Trang bạn đang tìm không tồn tại hoặc đã được di chuyển.'
  });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', {
    title: 'Lỗi hệ thống',
    message: 'Hệ thống đang gặp lỗi. Vui lòng thử lại sau.'
  });
});

module.exports = app;
