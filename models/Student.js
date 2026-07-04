const bcrypt = require('bcryptjs');
const db = require('../config/db');
const sampleData = require('../sample-data/sampleData');

async function findByUsername(username) {
  try {
    const rows = await db.query('SELECT * FROM Students WHERE username = ? LIMIT 1', [username]);
    return rows[0] || null;
  } catch (error) {
    return sampleData.students.find((student) => student.username === username) || null;
  }
}

async function findById(id) {
  try {
    const rows = await db.query('SELECT * FROM Students WHERE id = ? LIMIT 1', [id]);
    return rows[0] || null;
  } catch (error) {
    return sampleData.students.find((student) => Number(student.id) === Number(id)) || null;
  }
}

async function createStudent({ username, password, fullname, grade }) {
  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const result = await db.query(
      `INSERT INTO Students (username, password_hash, fullname, registered_grade, current_grade)
       VALUES (?, ?, ?, ?, ?)`,
      [username, passwordHash, fullname, grade, grade]
    );

    return {
      id: result.insertId,
      username,
      password_hash: passwordHash,
      fullname,
      registered_grade: grade,
      current_grade: grade
    };
  } catch (error) {
    const duplicate = sampleData.students.some((student) => student.username === username);
    if (duplicate) {
      const duplicateError = new Error('DUPLICATE_USERNAME');
      duplicateError.code = 'DUPLICATE_USERNAME';
      throw duplicateError;
    }

    const student = {
      id: sampleData.students.length + 1,
      username,
      password_hash: passwordHash,
      fullname,
      registered_grade: grade,
      current_grade: grade
    };
    sampleData.students.push(student);
    return student;
  }
}

async function listStudents(search = '') {
  const keyword = `%${search}%`;

  try {
    return await db.query(
      `SELECT id, username, fullname, registered_grade, current_grade, created_at
       FROM Students
       WHERE username LIKE ? OR fullname LIKE ?
       ORDER BY created_at DESC`,
      [keyword, keyword]
    );
  } catch (error) {
    return sampleData.students.filter((student) => {
      const text = `${student.username} ${student.fullname}`.toLowerCase();
      return text.includes(search.toLowerCase());
    });
  }
}

async function updatePassword(studentId, password) {
  const passwordHash = await bcrypt.hash(password, 10);

  try {
    await db.query(
      'UPDATE Students SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [passwordHash, studentId]
    );
  } catch (error) {
    const student = sampleData.students.find((item) => Number(item.id) === Number(studentId));
    if (student) student.password_hash = passwordHash;
  }

  return passwordHash;
}

module.exports = {
  findByUsername,
  findById,
  createStudent,
  listStudents,
  updatePassword
};
