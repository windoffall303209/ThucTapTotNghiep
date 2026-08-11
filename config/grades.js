// Cấu hình grades tập trung các hằng số và quy tắc khởi chạy dùng chung của ứng dụng.
const MIN_GRADE = 1;
const MAX_GRADE = 5;
const PRIMARY_GRADES = Array.from(
  { length: MAX_GRADE - MIN_GRADE + 1 },
  (_, index) => MIN_GRADE + index
);
const GRADE_RANGE_LABEL = `lớp ${MIN_GRADE} đến lớp ${MAX_GRADE}`;
const SHORT_GRADE_RANGE_LABEL = `${MIN_GRADE}-${MAX_GRADE}`;

// Hàm normalizeGrade dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function normalizeGrade(value) {
  if (!['string', 'number'].includes(typeof value)) return null;
  const raw = String(value).trim();
  if (!/^\d+$/.test(raw)) return null;
  const grade = Number(raw);
  return Number.isInteger(grade) ? grade : null;
}

// Hàm isSupportedGrade dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function isSupportedGrade(value) {
  const grade = normalizeGrade(value);
  return grade !== null && grade >= MIN_GRADE && grade <= MAX_GRADE;
}

// Hàm gradeOptions dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function gradeOptions() {
  return PRIMARY_GRADES.map((grade) => ({
    value: grade,
    label: `Lớp ${grade}`
  }));
}

module.exports = {
  MIN_GRADE,
  MAX_GRADE,
  PRIMARY_GRADES,
  GRADE_RANGE_LABEL,
  SHORT_GRADE_RANGE_LABEL,
  normalizeGrade,
  isSupportedGrade,
  gradeOptions
};
