require('dotenv').config();

const app = require('./app');
const { testConnection } = require('./config/db');
const { validateProductionConfig } = require('./config/runtimeSecurity');
const { assertNoDemoCredentials } = require('./services/SecurityStartupService');
const PracticeSession = require('./models/PracticeSession');
const AIConversationLog = require('./models/AIConversationLog');

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST
  || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');

async function start() {
  validateProductionConfig();
  const dbState = await testConnection();
  if (process.env.NODE_ENV === 'production' && !dbState.connected) {
    throw new Error(`Không thể khởi động production khi MySQL không sẵn sàng: ${dbState.reason || 'unknown'}`);
  }
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
