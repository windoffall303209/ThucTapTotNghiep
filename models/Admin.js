// Mô hình admin định nghĩa truy cập, kiểm tra và biến đổi dữ liệu của một thực thể trong hệ thống.
const db = require('../config/db');
const bcrypt = require('bcryptjs');
// Hàm findByUsername dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function findByUsername(username) {
  const rows = await db.query(
    `SELECT id, username, password_hash, fullname, role, is_active
     FROM Admins
     WHERE username = ?
     LIMIT 1`,
    [username]
  );
  return rows[0] || null;
}

// Hàm findById dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function findById(id) {
  const rows = await db.query(
    `SELECT id, username, password_hash, fullname, role, is_active
     FROM Admins
     WHERE id = ?
     LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function updatePassword(adminId, password) {
  const passwordHash = await bcrypt.hash(password, 10);
  await db.query(
    'UPDATE Admins SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [passwordHash, adminId]
  );
  return passwordHash;
}

module.exports = {
  findByUsername,
  findById,
  updatePassword
};
