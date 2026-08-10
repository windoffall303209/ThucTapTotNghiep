// Tiện ích question bank readiness cung cấp các hàm dùng chung cho chuẩn hóa dữ liệu, bảo mật và xử lý lỗi.
const { DIFFICULTY_TARGETS } = require('./practiceQuestionSelectorV2');

// Hàm summarizeDifficulty dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function summarizeDifficulty(candidates = []) {
  return candidates.reduce((summary, question) => {
    const difficulty = normalizeDifficulty(question.difficulty);
    summary[difficulty] += 1;
    return summary;
  }, { EASY: 0, MEDIUM: 0, HARD: 0 });
}

// Hàm evaluateScopeReadiness dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function evaluateScopeReadiness(candidates = [], count, maxPerLesson = 2) {
  const requestedCount = Math.max(Number(count) || 0, 0);
  const lessonCounts = countBy(candidates, 'lesson_id');
  const difficulty = summarizeDifficulty(candidates);
  const targets = DIFFICULTY_TARGETS[requestedCount] || ratioTargets(requestedCount);
  const lessonCapacity = [...lessonCounts.values()]
    .reduce((sum, value) => sum + Math.min(value, maxPerLesson), 0);
  const issues = [];

  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (candidates.length < requestedCount) {
    issues.push({
      code: 'INSUFFICIENT_TOTAL',
      missing: requestedCount - candidates.length
    });
  }
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (lessonCapacity < requestedCount) {
    issues.push({
      code: 'INSUFFICIENT_LESSON_CAPACITY',
      missing: requestedCount - lessonCapacity,
      distinctLessons: lessonCounts.size
    });
  }
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const difficultyName of Object.keys(targets)) {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (difficulty[difficultyName] < targets[difficultyName]) {
      issues.push({
        code: `INSUFFICIENT_${difficultyName}`,
        missing: targets[difficultyName] - difficulty[difficultyName]
      });
    }
  }

  return {
    requestedCount,
    candidateCount: candidates.length,
    distinctLessons: lessonCounts.size,
    lessonCapacity,
    difficulty,
    difficultyTargets: targets,
    ready: issues.length === 0,
    issues
  };
}

// Hàm evaluateLessonReadiness dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function evaluateLessonReadiness(candidates = []) {
  const practice = evaluateScopeReadiness(candidates, 5, 5);
  const review = evaluateScopeReadiness(candidates, 8, 8);
  return {
    questionCount: candidates.length,
    difficulty: summarizeDifficulty(candidates),
    practice5: practice,
    review8: review,
    ready: practice.ready && review.ready
  };
}

// Hàm summarizeReadiness dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function summarizeReadiness(rows = []) {
  const issueCounts = {};
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const row of rows) {
    // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
    for (const issue of row.issues || []) {
      issueCounts[issue.code] = (issueCounts[issue.code] || 0) + 1;
    }
  }
  return {
    totalScopes: rows.length,
    readyScopes: rows.filter((row) => row.ready).length,
    blockedScopes: rows.filter((row) => !row.ready).length,
    issueCounts
  };
}

// Hàm normalizeDifficulty dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function normalizeDifficulty(value) {
  const difficulty = String(value || 'EASY').trim().toUpperCase();
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (difficulty === 'EXPERT') return 'HARD';
  return ['EASY', 'MEDIUM', 'HARD'].includes(difficulty) ? difficulty : 'EASY';
}

// Hàm ratioTargets dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function ratioTargets(count) {
  const easy = Math.round(count * 0.45);
  const medium = Math.round(count * 0.4);
  return { EASY: easy, MEDIUM: medium, HARD: Math.max(0, count - easy - medium) };
}

// Hàm countBy dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function countBy(items, field) {
  return (items || []).reduce((result, item) => {
    const value = Number(item?.[field]);
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (value) result.set(value, (result.get(value) || 0) + 1);
    return result;
  }, new Map());
}

module.exports = {
  summarizeDifficulty,
  evaluateScopeReadiness,
  evaluateLessonReadiness,
  summarizeReadiness
};
