// Mô hình student định nghĩa truy cập, kiểm tra và biến đổi dữ liệu của một thực thể trong hệ thống.
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const sampleData = require('../sample-data/sampleData');
const { fallbackOrThrow } = require('../utils/sampleDataFallback');
const { parseInteger } = require('../utils/requestValidation');

// Hàm findByUsername dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function findByUsername(username) {
  const rows = await db.query('SELECT * FROM Students WHERE username = ? LIMIT 1', [username]);
  return rows[0] || null;
}

// Hàm findById dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function findById(id) {
  const rows = await db.query('SELECT * FROM Students WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

// Hàm createStudent dùng để tạo bản ghi hoặc tài nguyên mới sau khi kiểm tra đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
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
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  try {
    const rows = await db.query('SELECT COUNT(*) AS total FROM Students');
    return Number(rows[0]?.total || 0);
  } catch (error) {
    fallbackOrThrow(error);
    return sampleData.students.length;
  }
}

// Hàm listStudents dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function listStudents(search = '') {
  const safeSearch = typeof search === 'string' ? search.trim().slice(0, 100) : '';
  const keyword = `%${safeSearch}%`;

  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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
      return text.includes(safeSearch.toLowerCase());
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
  const safeSearch = typeof search === 'string' ? search.trim().slice(0, 100) : '';
  const keyword = `%${safeSearch}%`;
  const safePage = parseInteger(page, { min: 1, max: 100_000 }) || 1;
  const safeLimit = parseInteger(limit, { min: 5, max: 50 }) || 20;
  const safeGrade = parseInteger(grade, { min: 1, max: 5 });
  const offset = (safePage - 1) * safeLimit;

  const where = ['(s.username LIKE ? OR s.fullname LIKE ?)'];
  const params = [keyword, keyword];
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (safeGrade) {
    where.push('s.current_grade = ?');
    params.push(safeGrade);
  }
  const whereClause = where.join(' AND ');

  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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
      const matchText = text.includes(safeSearch.toLowerCase());
      const matchGrade = !safeGrade || Number(student.current_grade) === safeGrade;
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

// Hàm updatePassword dùng để cập nhật trạng thái hoặc dữ liệu theo quy tắc nghiệp vụ; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
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
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!student) return null;

    const previousGrade = Number(student.current_grade);
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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

// Hàm updateActiveStatus dùng để cập nhật trạng thái hoặc dữ liệu theo quy tắc nghiệp vụ; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
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
