// D?ch v? learning mastery service ??ng g?i nghi?p v? ch?nh v? ph?i h?p c?c l?p d? li?u ho?c t?ch h?p b?n ngo?i.
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

// H?m calculateLessonMastery d?ng ?? t?nh to?n k?t qu? t? c?c tham s? ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function calculateLessonMastery(attempts = []) {
  const recentAttempts = [...attempts]
    .sort(compareAttemptsNewestFirst)
    .slice(0, MAX_ATTEMPTS_PER_LESSON);
  const attemptCount = recentAttempts.length;
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
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
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (isCorrect) {
      correctWeight += weight;
      correctCount += 1;
    } else {
      wrongCount += 1;
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
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

// H?m buildLessonMasteryMap d?ng ?? x?y d?ng k?t qu? t? c?c ngu?n d? li?u v? quy t?c li?n quan; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function buildLessonMasteryMap(attemptRows = []) {
  const attemptsByLesson = new Map();
  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const attempt of attemptRows) {
    const lessonId = Number(attempt.lesson_id);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!Number.isInteger(lessonId) || lessonId <= 0) continue;
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!attemptsByLesson.has(lessonId)) attemptsByLesson.set(lessonId, []);
    attemptsByLesson.get(lessonId).push(attempt);
  }

  return [...attemptsByLesson.entries()].reduce((result, [lessonId, attempts]) => {
    result[lessonId] = calculateLessonMastery(attempts);
    return result;
  }, {});
}

// H?m getMasteryByGrade d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function getMasteryByGrade(studentId, grade) {
  const rows = await Curriculum.getLessonAttemptHistory(
    studentId,
    grade,
    MAX_ATTEMPTS_PER_LESSON
  );
  return buildLessonMasteryMap(rows);
}

// H?m getWeakLessonIds d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
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

// H?m buildGradeProgress d?ng ?? x?y d?ng k?t qu? t? c?c ngu?n d? li?u v? quy t?c li?n quan; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
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

// H?m findWeakestLesson d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
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

// H?m emptyMastery d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
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

// H?m countNewestWrongStreak d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function countNewestWrongStreak(attempts) {
  let count = 0;
  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const attempt of attempts) {
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (normalizeCorrect(attempt.is_correct)) break;
    count += 1;
  }
  return count;
}

// H?m compareAttemptsNewestFirst d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function compareAttemptsNewestFirst(left, right) {
  const timeDifference = new Date(right.created_at || 0) - new Date(left.created_at || 0);
  return timeDifference || Number(right.id || 0) - Number(left.id || 0);
}

// H?m normalizeCorrect d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function normalizeCorrect(value) {
  return value === true || Number(value) === 1;
}

// H?m normalizeDifficulty d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function normalizeDifficulty(value) {
  const difficulty = String(value || 'MEDIUM').trim().toUpperCase();
  return Object.hasOwn(DIFFICULTY_EVIDENCE_WEIGHTS, difficulty) ? difficulty : 'MEDIUM';
}

// H?m roundScore d?ng ?? t?nh to?n k?t qu? t? c?c tham s? ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
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
