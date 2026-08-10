// Dịch vụ learning mastery service đóng gói nghiệp vụ chính và phối hợp các lớp dữ liệu hoặc tích hợp bên ngoài.
const Curriculum = require('../models/Curriculum');

const MAX_ATTEMPTS_PER_LESSON = 10;
const RECENCY_DECAY = 0.85;
const MIN_ATTEMPTS_TO_COMPLETE = 5;
const MIN_WEIGHTED_ACCURACY = 0.8;
const WRONG_STREAK_FULL_SCORE = 3;
const DIFFICULTY_EVIDENCE_WEIGHTS = Object.freeze({
  EASY: Object.freeze({ correct: 0.8, wrong: 1.2 }),
  MEDIUM: Object.freeze({ correct: 1, wrong: 1 }),
  HARD: Object.freeze({ correct: 1.2, wrong: 0.8 }),
  EXPERT: Object.freeze({ correct: 1.3, wrong: 0.7 })
});

// Hàm calculateLessonMastery dùng để tính toán kết quả từ các tham số đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function calculateLessonMastery(attempts = []) {
  const recentAttempts = [...attempts]
    .sort(compareAttemptsNewestFirst)
    .slice(0, MAX_ATTEMPTS_PER_LESSON);
  const attemptCount = recentAttempts.length;
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (attemptCount === 0) return emptyMastery();

  let totalWeight = 0;
  let correctWeight = 0;
  let correctCount = 0;
  let misconceptionCount = 0;
  let wrongCount = 0;

  recentAttempts.forEach((attempt, index) => {
    const isCorrect = normalizeCorrect(attempt.is_correct);
    const difficultyWeights = DIFFICULTY_EVIDENCE_WEIGHTS[normalizeDifficulty(attempt.difficulty)];
    const evidenceWeight = isCorrect ? difficultyWeights.correct : difficultyWeights.wrong;
    const weight = (RECENCY_DECAY ** index) * evidenceWeight;
    totalWeight += weight;
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (isCorrect) {
      correctWeight += weight;
      correctCount += 1;
    } else {
      wrongCount += 1;
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (attempt.detected_misconception_id) misconceptionCount += 1;
    }
  });

  const weightedAccuracy = totalWeight > 0 ? correctWeight / totalWeight : 0;
  const wrongStreak = countNewestWrongStreak(recentAttempts);
  const wrongStreakScore = Math.min(wrongStreak / WRONG_STREAK_FULL_SCORE, 1);
  const misconceptionRate = wrongCount > 0 ? misconceptionCount / wrongCount : 0;
  const rawWeaknessScore = (
    0.7 * (1 - weightedAccuracy)
    + 0.2 * wrongStreakScore
    + 0.1 * misconceptionRate
  );
  const confidenceScore = Math.min(attemptCount / MAX_ATTEMPTS_PER_LESSON, 1);
  const weaknessScore = rawWeaknessScore * confidenceScore;
  const latestCorrect = normalizeCorrect(recentAttempts[0].is_correct);
  const completed = attemptCount >= MIN_ATTEMPTS_TO_COMPLETE
    && weightedAccuracy >= MIN_WEIGHTED_ACCURACY
    && latestCorrect;

  const status = attemptCount < MIN_ATTEMPTS_TO_COMPLETE
    ? 'insufficient_data'
    : completed ? 'completed' : 'needs_review';

  return {
    attempt_count: attemptCount,
    correct_count: correctCount,
    wrong_count: wrongCount,
    last_attempt_at: recentAttempts[0].created_at || null,
    latest_correct: latestCorrect,
    weighted_accuracy: roundScore(weightedAccuracy),
    wrong_streak: wrongStreak,
    misconception_rate: roundScore(misconceptionRate),
    confidence_score: roundScore(confidenceScore),
    raw_weakness_score: roundScore(rawWeaknessScore),
    weakness_score: roundScore(weaknessScore),
    status
  };
}

// Hàm buildLessonMasteryMap dùng để xây dựng kết quả từ các nguồn dữ liệu và quy tắc liên quan; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function buildLessonMasteryMap(attemptRows = []) {
  const attemptsByLesson = new Map();
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const attempt of attemptRows) {
    const lessonId = Number(attempt.lesson_id);
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!Number.isInteger(lessonId) || lessonId <= 0) continue;
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!attemptsByLesson.has(lessonId)) attemptsByLesson.set(lessonId, []);
    attemptsByLesson.get(lessonId).push(attempt);
  }

  return [...attemptsByLesson.entries()].reduce((result, [lessonId, attempts]) => {
    result[lessonId] = calculateLessonMastery(attempts);
    return result;
  }, {});
}

// Hàm getMasteryByGrade dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function getMasteryByGrade(studentId, grade) {
  const rows = await Curriculum.getLessonAttemptHistory(
    studentId,
    grade,
    MAX_ATTEMPTS_PER_LESSON
  );
  return buildLessonMasteryMap(rows);
}

// Hàm getWeakLessonIds dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function getWeakLessonIds(masteryByLesson = {}, allowedLessonIds = []) {
  const allowed = new Set(
    (allowedLessonIds || []).map(Number).filter((id) => Number.isInteger(id) && id > 0)
  );
  return Object.entries(masteryByLesson)
    .filter(([lessonId, mastery]) => (
      mastery?.status === 'needs_review'
      && (allowed.size === 0 || allowed.has(Number(lessonId)))
    ))
    .sort((left, right) => (
      Number(right[1].weakness_score || 0) - Number(left[1].weakness_score || 0)
      || Number(left[0]) - Number(right[0])
    ))
    .map(([lessonId]) => Number(lessonId));
}

// Hàm buildGradeProgress dùng để xây dựng kết quả từ các nguồn dữ liệu và quy tắc liên quan; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function buildGradeProgress(chapters = [], masteryByLesson = {}) {
  const lessons = (chapters || []).flatMap((chapter) => chapter.lessons || []);
  const completed = lessons.filter(
    (lesson) => masteryByLesson[lesson.id]?.status === 'completed'
  ).length;
  return {
    total: lessons.length,
    completed,
    percent: lessons.length > 0 ? Math.round((completed / lessons.length) * 100) : 0
  };
}

// Hàm findWeakestLesson dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function findWeakestLesson(chapters = [], masteryByLesson = {}) {
  return (chapters || [])
    .flatMap((chapter) => (chapter.lessons || []).map((lesson) => ({
      id: lesson.id,
      lesson_name: lesson.lesson_name,
      chapter_name: chapter.chapter_name,
      ...(masteryByLesson[lesson.id] || emptyMastery())
    })))
    .filter((lesson) => lesson.status === 'needs_review')
    .sort((left, right) => (
      Number(right.weakness_score || 0) - Number(left.weakness_score || 0)
      || Number(left.id) - Number(right.id)
    ))[0] || null;
}

// Hàm emptyMastery dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function emptyMastery() {
  return {
    attempt_count: 0,
    correct_count: 0,
    wrong_count: 0,
    last_attempt_at: null,
    latest_correct: false,
    weighted_accuracy: 0,
    wrong_streak: 0,
    misconception_rate: 0,
    confidence_score: 0,
    raw_weakness_score: 0,
    weakness_score: 0,
    status: 'not_started'
  };
}

// Hàm countNewestWrongStreak dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function countNewestWrongStreak(attempts) {
  let count = 0;
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const attempt of attempts) {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (normalizeCorrect(attempt.is_correct)) break;
    count += 1;
  }
  return count;
}

// Hàm compareAttemptsNewestFirst dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function compareAttemptsNewestFirst(left, right) {
  const timeDifference = new Date(right.created_at || 0) - new Date(left.created_at || 0);
  return timeDifference || Number(right.id || 0) - Number(left.id || 0);
}

// Hàm normalizeCorrect dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function normalizeCorrect(value) {
  return value === true || Number(value) === 1;
}

// Hàm normalizeDifficulty dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function normalizeDifficulty(value) {
  const difficulty = String(value || 'MEDIUM').trim().toUpperCase();
  return Object.hasOwn(DIFFICULTY_EVIDENCE_WEIGHTS, difficulty) ? difficulty : 'MEDIUM';
}

// Hàm roundScore dùng để tính toán kết quả từ các tham số đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function roundScore(value) {
  return Number(Math.min(Math.max(Number(value) || 0, 0), 1).toFixed(4));
}

module.exports = {
  MAX_ATTEMPTS_PER_LESSON,
  RECENCY_DECAY,
  MIN_ATTEMPTS_TO_COMPLETE,
  MIN_WEIGHTED_ACCURACY,
  DIFFICULTY_EVIDENCE_WEIGHTS,
  calculateLessonMastery,
  buildLessonMasteryMap,
  getMasteryByGrade,
  getWeakLessonIds,
  buildGradeProgress,
  findWeakestLesson,
  emptyMastery
};
