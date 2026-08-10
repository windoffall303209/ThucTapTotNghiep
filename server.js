// T?p m? ngu?n server th?c hi?n m?t ph?n ch?c n?ng c?a ?ng d?ng v? ph?i h?p v?i c?c m?-?un li?n quan.
require('dotenv').config({ quiet: true });

const app = require('./app');
const { testConnection } = require('./config/db');
const { validateProductionConfig } = require('./config/runtimeSecurity');
const { assertNoDemoCredentials } = require('./services/SecurityStartupService');
const PracticeSession = require('./models/PracticeSession');
const AIConversationLog = require('./models/AIConversationLog');

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST
  || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');

// H?m start d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function start() {
  validateProductionConfig();
  const dbState = await testConnection();
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (process.env.NODE_ENV === 'production' && !dbState.connected) {
    throw new Error(`Không thể khởi động production khi MySQL không sẵn sàng: ${dbState.reason || 'unknown'}`);
  }
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (dbState.connected) {
    await Promise.all([
      PracticeSession.ensureSchema(),
      AIConversationLog.ensureSchema(),
      app.locals.sessionStore?.ensureReady(),
      ...(app.locals.rateLimitStores || []).map((store) => store.ensureReady())
    ]);
  }
  await assertNoDemoCredentials();

  app.listen(port, host, () => {
    const mode = dbState.connected ? 'MySQL' : 'dữ liệu mẫu';
    console.log(`Server đang chạy tại http://${host}:${port} (${mode})`);
  });
}

start().catch((error) => {
  console.error('Không thể khởi động server:', error);
  process.exit(1);
});
