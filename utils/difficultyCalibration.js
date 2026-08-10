// Tiện ích difficulty calibration cung cấp các hàm dùng chung cho chuẩn hóa dữ liệu, bảo mật và xử lý lỗi.
const MIN_CALIBRATION_ATTEMPTS = 30;

// Hàm inferDifficultyFromAccuracy dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function inferDifficultyFromAccuracy(accuracy) {
  const normalized = Math.min(Math.max(Number(accuracy) || 0, 0), 1);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (normalized >= 0.75) return 'EASY';
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (normalized >= 0.5) return 'MEDIUM';
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (normalized >= 0.25) return 'HARD';
  return 'EXPERT';
}

// Hàm buildDifficultyWarning dùng để xây dựng kết quả từ các nguồn dữ liệu và quy tắc liên quan; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function buildDifficultyWarning(row, minimumAttempts = MIN_CALIBRATION_ATTEMPTS) {
  const attemptCount = Number(row.attempt_count || 0);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (attemptCount < minimumAttempts) return null;

  const editorialDifficulty = normalizeDifficulty(row.difficulty);
  const actualAccuracy = Math.min(Math.max(Number(row.actual_accuracy) || 0, 0), 1);
  const observedDifficulty = inferDifficultyFromAccuracy(actualAccuracy);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (editorialDifficulty === observedDifficulty) return null;

  return {
    question_id: Number(row.question_id || row.id),
    lesson_id: Number(row.lesson_id) || null,
    editorial_difficulty: editorialDifficulty,
    observed_difficulty: observedDifficulty,
    attempt_count: attemptCount,
    actual_accuracy: Number(actualAccuracy.toFixed(4))
  };
}

// Hàm normalizeDifficulty dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function normalizeDifficulty(value) {
  const difficulty = String(value || '').trim().toUpperCase();
  return ['EASY', 'MEDIUM', 'HARD', 'EXPERT'].includes(difficulty)
    ? difficulty
    : 'EASY';
}

module.exports = {
  MIN_CALIBRATION_ATTEMPTS,
  inferDifficultyFromAccuracy,
  buildDifficultyWarning
};
