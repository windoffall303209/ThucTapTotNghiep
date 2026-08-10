// Tiện ích answer validation cung cấp các hàm dùng chung cho chuẩn hóa dữ liệu, bảo mật và xử lý lỗi.
function answersMatch(question, selectedAnswer) {
  const expected = String(question?.correct_answer || '').trim();
  const actual = String(selectedAnswer || '').trim();
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (question?.question_type === 'FILL_IN_THE_BLANK') {
    return normalizeFreeTextAnswer(actual) === normalizeFreeTextAnswer(expected);
  }
  return actual === expected;
}

// Hàm normalizeFreeTextAnswer dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function normalizeFreeTextAnswer(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/,/g, '.');
}

// Hàm normalizeSubmittedAnswer dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function normalizeSubmittedAnswer(value) {
  const answer = String(value || '').trim();
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!answer || answer.length > 50) return null;
  return answer;
}

// Hàm normalizeTimeSpentSeconds dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function normalizeTimeSpentSeconds(value) {
  const seconds = Number(value);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.min(Math.round(seconds), 24 * 60 * 60);
}

module.exports = {
  answersMatch,
  normalizeFreeTextAnswer,
  normalizeSubmittedAnswer,
  normalizeTimeSpentSeconds
};
