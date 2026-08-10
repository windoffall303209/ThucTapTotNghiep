// D?ch v? security startup service ??ng g?i nghi?p v? ch?nh v? ph?i h?p c?c l?p d? li?u ho?c t?ch h?p b?n ngo?i.
const bcrypt = require('bcryptjs');
const db = require('../config/db');

const KNOWN_DEMO_PASSWORDS = new Map([
  ['admin', ['admin123']],
  ['content', ['content123']],
  ['annguyen', ['matkhau123']],
  ['binhtran', ['matkhau123']],
  ['chilam', ['matkhau123']]
]);

// H?m assertNoDemoCredentials d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function assertNoDemoCredentials() {
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (process.env.NODE_ENV !== 'production') return;

  const [admins, students] = await Promise.all([
    db.query('SELECT username, password_hash FROM Admins WHERE is_active = 1'),
    db.query('SELECT username, password_hash FROM Students WHERE is_active = 1')
  ]);
  const unsafeAccounts = await findKnownDemoAccounts([...admins, ...students]);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (unsafeAccounts.length > 0) {
    const error = new Error(
      `Production còn tài khoản dùng mật khẩu demo công khai: ${unsafeAccounts.join(', ')}. `
      + 'Hãy đổi hoặc khóa các tài khoản này trước khi khởi động.'
    );
    error.code = 'DEMO_CREDENTIALS_ENABLED';
    throw error;
  }
}

// H?m findKnownDemoAccounts d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function findKnownDemoAccounts(accounts = []) {
  const unsafe = [];
  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const account of accounts) {
    const candidates = KNOWN_DEMO_PASSWORDS.get(String(account.username || '')) || [];
    // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
    for (const password of candidates) {
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
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
