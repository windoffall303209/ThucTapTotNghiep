// Dịch vụ security startup service đóng gói nghiệp vụ chính và phối hợp các lớp dữ liệu hoặc tích hợp bên ngoài.
const bcrypt = require('bcryptjs');
const db = require('../config/db');

const KNOWN_DEMO_PASSWORDS = new Map([
  ['admin', ['admin123']],
  ['content', ['content123']],
  ['annguyen', ['matkhau123']],
  ['binhtran', ['matkhau123']],
  ['chilam', ['matkhau123']]
]);

// Hàm assertNoDemoCredentials dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function assertNoDemoCredentials() {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (process.env.NODE_ENV !== 'production') return;

  const [admins, students] = await Promise.all([
    db.query('SELECT username, password_hash FROM Admins WHERE is_active = 1'),
    db.query('SELECT username, password_hash FROM Students WHERE is_active = 1')
  ]);
  const unsafeAccounts = await findKnownDemoAccounts([...admins, ...students]);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (unsafeAccounts.length > 0) {
    const error = new Error(
      `Production còn tài khoản dùng mật khẩu demo công khai: ${unsafeAccounts.join(', ')}. `
      + 'Hãy đổi hoặc khóa các tài khoản này trước khi khởi động.'
    );
    error.code = 'DEMO_CREDENTIALS_ENABLED';
    throw error;
  }
}

// Hàm findKnownDemoAccounts dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function findKnownDemoAccounts(accounts = []) {
  const unsafe = [];
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const account of accounts) {
    const candidates = KNOWN_DEMO_PASSWORDS.get(String(account.username || '')) || [];
    // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
    for (const password of candidates) {
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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
