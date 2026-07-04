require('dotenv').config();

const app = require('./app');
const { testConnection } = require('./config/db');

const port = Number(process.env.PORT || 3000);

async function start() {
  const dbState = await testConnection();

  app.listen(port, () => {
    const mode = dbState.connected ? 'MySQL' : 'dữ liệu mẫu';
    console.log(`Server đang chạy tại http://localhost:${port} (${mode})`);
  });
}

start().catch((error) => {
  console.error('Không thể khởi động server:', error);
  process.exit(1);
});
