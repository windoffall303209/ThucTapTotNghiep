// M? h?nh student ??nh ngh?a truy c?p, ki?m tra v? bi?n ??i d? li?u c?a m?t th?c th? trong h? th?ng.
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const sampleData = require('../sample-data/sampleData');
const { fallbackOrThrow } = require('../utils/sampleDataFallback');

// H?m findByUsername d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function findByUsername(username) {
  const rows = await db.query('SELECT * FROM Students WHERE username = ? LIMIT 1', [username]);
  return rows[0] || null;
}

// H?m findById d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function findById(id) {
  const rows = await db.query('SELECT * FROM Students WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

// H?m createStudent d?ng ?? t?o b?n ghi ho?c t?i nguy?n m?i sau khi ki?m tra ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function createStudent({ username, password, fullname, grade }) {
  const passwordHash = await bcrypt.hash(password, 10);

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
}

// Đếm tổng số học sinh cho khối thống kê. Dashboard chỉ cần con số, không
// được kéo toàn bộ bảng Students về chỉ để lấy .length.
async function countStudents() {
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    const rows = await db.query('SELECT COUNT(*) AS total FROM Students');
    return Number(rows[0]?.total || 0);
  } catch (error) {
    fallbackOrThrow(error);
    return sampleData.students.length;
  }
}

// H?m listStudents d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function listStudents(search = '') {
  const keyword = `%${search}%`;

  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    return await db.query(
      `SELECT id, username, fullname, registered_grade, current_grade, is_active, created_at
       FROM Students
       WHERE username LIKE ? OR fullname LIKE ?
       ORDER BY created_at DESC`,
      [keyword, keyword]
    );
  } catch (error) {
    fallbackOrThrow(error);
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
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (Number(grade) > 0) {
    where.push('s.current_grade = ?');
    params.push(Number(grade));
  }
  const whereClause = where.join(' AND ');

  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
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
    fallbackOrThrow(error);
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

// H?m updatePassword d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function updatePassword(studentId, password) {
  const passwordHash = await bcrypt.hash(password, 10);

  await db.query(
    'UPDATE Students SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [passwordHash, studentId]
  );

  return passwordHash;
}

// Chỉ thay đổi current_grade và giữ nguyên registered_grade/lịch sử. Mọi phiên đang làm
// thuộc chương trình lớp cũ phải được đóng trong cùng transaction để học sinh không thể
// tiếp tục một snapshot không còn phù hợp sau khi đăng nhập ở lớp mới.
async function updateCurrentGrade(studentId, grade) {
  const normalizedStudentId = Number(studentId);
  const normalizedGrade = Number(grade);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (
    !Number.isInteger(normalizedStudentId)
    || normalizedStudentId <= 0
    || !Number.isInteger(normalizedGrade)
    || normalizedGrade < 1
    || normalizedGrade > 5
  ) {
    const error = new Error('INVALID_STUDENT_GRADE');
    error.code = 'INVALID_STUDENT_GRADE';
    throw error;
  }

  return db.transaction(async (connection) => {
    const [studentRows] = await connection.execute(
      `SELECT id, current_grade
       FROM Students
       WHERE id = ?
       LIMIT 1
       FOR UPDATE`,
      [normalizedStudentId]
    );
    const student = studentRows[0] || null;
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!student) return null;

    const previousGrade = Number(student.current_grade);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (previousGrade === normalizedGrade) {
      return {
        changed: false,
        previousGrade,
        currentGrade: normalizedGrade,
        completedSessionCount: 0
      };
    }

    const [sessionResult] = await connection.execute(
      `UPDATE PracticeSessions
       SET status = 'COMPLETED',
           completion_reason = 'ACCOUNT_GRADE_CHANGED',
           completed_at = CURRENT_TIMESTAMP,
           active_key = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE student_id = ?
         AND status = 'IN_PROGRESS'`,
      [normalizedStudentId]
    );

    const [studentResult] = await connection.execute(
      `UPDATE Students
       SET current_grade = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [normalizedGrade, normalizedStudentId]
    );
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (Number(studentResult.affectedRows) !== 1) {
      const error = new Error('STUDENT_GRADE_UPDATE_FAILED');
      error.code = 'STUDENT_GRADE_UPDATE_FAILED';
      throw error;
    }

    return {
      changed: true,
      previousGrade,
      currentGrade: normalizedGrade,
      completedSessionCount: Number(sessionResult.affectedRows || 0)
    };
  });
}

// H?m updateActiveStatus d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function updateActiveStatus(studentId, isActive) {
  const normalizedStatus = isActive ? 1 : 0;

  await db.query(
    'UPDATE Students SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [normalizedStatus, studentId]
  );

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
  updateCurrentGrade,
  updateActiveStatus
};
