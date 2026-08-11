// Giới hạn dùng chung cho dữ liệu do quản trị viên nhập. Kiểm tra ở server là
// nguồn sự thật; maxlength trong form chỉ giúp phản hồi sớm cho người dùng.
const CONTENT_LIMITS = Object.freeze({
  chapterName: 255,
  lessonName: 255,
  questionContent: 10_000,
  choiceText: 2_000,
  correctAnswer: 50,
  explanation: 20_000,
  misconceptionName: 255,
  misconception: 5_000,
  altText: 255,
  searchKeyword: 200,
  theoryTitle: 255,
  theoryDisplayText: 2_000,
  theoryBody: 20_000,
  theoryExample: 10_000,
  theoryStudentTask: 2_000,
  theoryRemember: 5_000,
  sortOrder: 1_000_000
});

function validateTextLength(value, label, maxLength) {
  const values = Array.isArray(value) ? value : [value];
  if (values.some((item) => item != null && typeof item !== 'string')) {
    return `${label} không đúng định dạng.`;
  }
  if (values.some((item) => String(item || '').length > maxLength)) {
    return `${label} không được vượt quá ${maxLength.toLocaleString('vi-VN')} ký tự.`;
  }
  return null;
}

function validateSortOrder(value) {
  if (value == null) return null;
  if (!['string', 'number'].includes(typeof value)) return 'Thứ tự không đúng định dạng.';
  if (String(value).trim() === '') return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > CONTENT_LIMITS.sortOrder) {
    return `Thứ tự phải là số nguyên từ 1 đến ${CONTENT_LIMITS.sortOrder.toLocaleString('vi-VN')}.`;
  }
  return null;
}

function normalizeSearchKeyword(value) {
  return typeof value === 'string'
    ? value.trim().slice(0, CONTENT_LIMITS.searchKeyword)
    : '';
}

function isPositiveInteger(value) {
  if (!['string', 'number'].includes(typeof value)) return false;
  if (!/^\d+$/.test(String(value).trim())) return false;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0;
}

module.exports = {
  CONTENT_LIMITS,
  isPositiveInteger,
  normalizeSearchKeyword,
  validateSortOrder,
  validateTextLength
};
