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
  if (typeof value !== 'string') return null;
  const answer = value.trim();
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!answer || answer.length > 50) return null;
  return answer;
}

// Hàm normalizeTimeSpentSeconds dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function normalizeTimeSpentSeconds(value) {
  if (!['string', 'number'].includes(typeof value)) return null;
  const seconds = Number(value);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.min(Math.round(seconds), 24 * 60 * 60);
}

function normalizeFinishAnswers(value, { maxItems = 100 } = {}) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > maxItems) return null;

  const answers = [];
  const seenQuestionIds = new Set();
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const questionId = Number(item.questionId);
    const selectedAnswer = normalizeSubmittedAnswer(item.selectedAnswer);
    if (!Number.isSafeInteger(questionId) || questionId <= 0 || !selectedAnswer) return null;
    if (seenQuestionIds.has(questionId)) continue;
    seenQuestionIds.add(questionId);
    answers.push({
      questionId,
      selectedAnswer,
      timeSpentSeconds: normalizeTimeSpentSeconds(item.timeSpentSeconds)
    });
  }
  return answers;
}

module.exports = {
  answersMatch,
  normalizeFinishAnswers,
  normalizeFreeTextAnswer,
  normalizeSubmittedAnswer,
  normalizeTimeSpentSeconds
};
