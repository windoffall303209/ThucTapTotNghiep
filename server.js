// Tệp mã nguồn server thực hiện một phần chức năng của ứng dụng và phối hợp với các mô-đun liên quan.
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

// Hàm start dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function start() {
  validateProductionConfig();
  const dbState = await testConnection();
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (process.env.NODE_ENV === 'production' && !dbState.connected) {
    throw new Error(`Không thể khởi động production khi MySQL không sẵn sàng: ${dbState.reason || 'unknown'}`);
  }
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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
