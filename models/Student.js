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
      current_grade: grade,
      is_active: 1
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
      current_grade: grade,
      is_active: 1
    };
    sampleData.students.push(student);
    return student;
  }
}

// Đếm tổng số học sinh cho khối thống kê. Dashboard chỉ cần con số, không
// được kéo toàn bộ bảng Students về chỉ để lấy .length.
async function countStudents() {
  try {
    const rows = await db.query('SELECT COUNT(*) AS total FROM Students');
    return Number(rows[0]?.total || 0);
  } catch (error) {
    return sampleData.students.length;
  }
}

async function listStudents(search = '') {
  const keyword = `%${search}%`;

  try {
    return await db.query(
      `SELECT id, username, fullname, registered_grade, current_grade, is_active, created_at
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

/**
 * Danh sách học sinh có phân trang, lọc theo lớp và kèm lần làm bài gần nhất.
 *
 * last_activity_at lấy từ StudentLogs để admin phân biệt được tài khoản đang
 * học thật với tài khoản tạo ra rồi bỏ; danh sách vài trăm em mà đổ hết ra một
 * trang thì vừa chậm vừa không tra cứu nổi.
 */
async function listStudentsPaged({ search = '', grade = null, page = 1, limit = 20 } = {}) {
  const keyword = `%${search}%`;
  const safePage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 5), 50);
  const offset = (safePage - 1) * safeLimit;

  const where = ['(s.username LIKE ? OR s.fullname LIKE ?)'];
  const params = [keyword, keyword];
  if (Number(grade) > 0) {
    where.push('s.current_grade = ?');
    params.push(Number(grade));
  }
  const whereClause = where.join(' AND ');

  try {
    const [rows, countRows] = await Promise.all([
      db.query(
        `SELECT s.id, s.username, s.fullname, s.registered_grade, s.current_grade, s.is_active, s.created_at,
                (SELECT MAX(sl.created_at) FROM StudentLogs sl WHERE sl.student_id = s.id) AS last_activity_at
         FROM Students s
         WHERE ${whereClause}
         ORDER BY s.created_at DESC
         LIMIT ${safeLimit} OFFSET ${offset}`,
        params
      ),
      db.query(`SELECT COUNT(*) AS total FROM Students s WHERE ${whereClause}`, params)
    ]);

    const total = Number(countRows[0]?.total || 0);
    return {
      students: rows,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.max(Math.ceil(total / safeLimit), 1)
      }
    };
  } catch (error) {
    const filtered = sampleData.students.filter((student) => {
      const text = `${student.username} ${student.fullname}`.toLowerCase();
      const matchText = text.includes(String(search).toLowerCase());
      const matchGrade = !Number(grade) || Number(student.current_grade) === Number(grade);
      return matchText && matchGrade;
    });
    return {
      students: filtered.slice(offset, offset + safeLimit),
      pagination: {
        page: safePage,
        limit: safeLimit,
        total: filtered.length,
        totalPages: Math.max(Math.ceil(filtered.length / safeLimit), 1)
      }
    };
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

async function updateActiveStatus(studentId, isActive) {
  const normalizedStatus = isActive ? 1 : 0;

  try {
    await db.query(
      'UPDATE Students SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [normalizedStatus, studentId]
    );
  } catch (error) {
    const student = sampleData.students.find((item) => Number(item.id) === Number(studentId));
    if (!student) throw error;
    student.is_active = normalizedStatus;
  }

  return normalizedStatus;
}

module.exports = {
  findByUsername,
  findById,
  createStudent,
  countStudents,
  listStudents,
  listStudentsPaged,
  updatePassword,
  updateActiveStatus
};
