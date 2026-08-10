// M? h?nh admin ??nh ngh?a truy c?p, ki?m tra v? bi?n ??i d? li?u c?a m?t th?c th? trong h? th?ng.
const db = require('../config/db');
// H?m findByUsername d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
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

// H?m findById d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
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

module.exports = {
  findByUsername,
  findById
};
