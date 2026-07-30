const bcrypt = require('bcryptjs');
const db = require('../config/db');

const KNOWN_DEMO_PASSWORDS = new Map([
  ['admin', ['admin123']],
  ['content', ['content123']],
  ['annguyen', ['matkhau123']],
  ['binhtran', ['matkhau123']],
  ['chilam', ['matkhau123']]
]);

async function assertNoDemoCredentials() {
  if (process.env.NODE_ENV !== 'production') return;

  const [admins, students] = await Promise.all([
    db.query('SELECT username, password_hash FROM Admins WHERE is_active = 1'),
    db.query('SELECT username, password_hash FROM Students WHERE is_active = 1')
  ]);
  const unsafeAccounts = await findKnownDemoAccounts([...admins, ...students]);
  if (unsafeAccounts.length > 0) {
    const error = new Error(
      `Production còn tài khoản dùng mật khẩu demo công khai: ${unsafeAccounts.join(', ')}. `
      + 'Hãy đổi hoặc khóa các tài khoản này trước khi khởi động.'
    );
    error.code = 'DEMO_CREDENTIALS_ENABLED';
    throw error;
  }
}

async function findKnownDemoAccounts(accounts = []) {
  const unsafe = [];
  for (const account of accounts) {
    const candidates = KNOWN_DEMO_PASSWORDS.get(String(account.username || '')) || [];
    for (const password of candidates) {
      if (await bcrypt.compare(password, String(account.password_hash || ''))) {
        unsafe.push(account.username);
        break;
      }
    }
  }
  return unsafe;
}

module.exports = {
  assertNoDemoCredentials,
  findKnownDemoAccounts
};
