const db = require('../config/db');
const sampleData = require('../sample-data/sampleData');

async function findByUsername(username) {
  try {
    const rows = await db.query(
      `SELECT id, username, password_hash, fullname, role, is_active
       FROM Admins
       WHERE username = ?
       LIMIT 1`,
      [username]
    );
    return rows[0] || null;
  } catch (error) {
    return sampleData.admins.find((admin) => admin.username === username) || null;
  }
}

module.exports = {
  findByUsername
};
