const Curriculum = require('../models/Curriculum');

const MAX_ATTEMPTS_PER_LESSON = 10;
const RECENCY_DECAY = 0.85;
const MIN_ATTEMPTS_TO_COMPLETE = 5;
const MIN_WEIGHTED_ACCURACY = 0.8;
const WRONG_STREAK_FULL_SCORE = 3;

function calculateLessonMastery(attempts = []) {
  const recentAttempts = [...attempts]
    .sort(compareAttemptsNewestFirst)
    .slice(0, MAX_ATTEMPTS_PER_LESSON);
  const attemptCount = recentAttempts.length;
  if (attemptCount === 0) return emptyMastery();

  let totalWeight = 0;
  let correctWeight = 0;
  let correctCount = 0;
  let misconceptionCount = 0;
  let wrongCount = 0;

  recentAttempts.forEach((attempt, index) => {
    const weight = RECENCY_DECAY ** index;
    const isCorrect = normalizeCorrect(attempt.is_correct);
    totalWeight += weight;
    if (isCorrect) {
      correctWeight += weight;
      correctCount += 1;
    } else {
      wrongCount += 1;
      if (attempt.detected_misconception_id) misconceptionCount += 1;
    }
  });

  const weightedAccuracy = totalWeight > 0 ? correctWeight / totalWeight : 0;
  const wrongStreak = countNewestWrongStreak(recentAttempts);
  const wrongStreakScore = Math.min(wrongStreak / WRONG_STREAK_FULL_SCORE, 1);
  const misconceptionRate = wrongCount > 0 ? misconceptionCount / wrongCount : 0;
  const weaknessScore = (
    0.7 * (1 - weightedAccuracy)
    + 0.2 * wrongStreakScore
    + 0.1 * misconceptionRate
  );
  const latestCorrect = normalizeCorrect(recentAttempts[0].is_correct);
  const completed = attemptCount >= MIN_ATTEMPTS_TO_COMPLETE
    && weightedAccuracy >= MIN_WEIGHTED_ACCURACY
    && latestCorrect;

  return {
    attempt_count: attemptCount,
    correct_count: correctCount,
    wrong_count: wrongCount,
    last_attempt_at: recentAttempts[0].created_at || null,
    latest_correct: latestCorrect,
    weighted_accuracy: roundScore(weightedAccuracy),
    wrong_streak: wrongStreak,
    misconception_rate: roundScore(misconceptionRate),
    weakness_score: roundScore(weaknessScore),
    status: completed ? 'completed' : 'needs_review'
  };
}

function buildLessonMasteryMap(attemptRows = []) {
  const attemptsByLesson = new Map();
  for (const attempt of attemptRows) {
    const lessonId = Number(attempt.lesson_id);
    if (!Number.isInteger(lessonId) || lessonId <= 0) continue;
    if (!attemptsByLesson.has(lessonId)) attemptsByLesson.set(lessonId, []);
    attemptsByLesson.get(lessonId).push(attempt);
  }

  return [...attemptsByLesson.entries()].reduce((result, [lessonId, attempts]) => {
    result[lessonId] = calculateLessonMastery(attempts);
    return result;
  }, {});
}

async function getMasteryByGrade(studentId, grade) {
  const rows = await Curriculum.getLessonAttemptHistory(
    studentId,
    grade,
    MAX_ATTEMPTS_PER_LESSON
  );
  return buildLessonMasteryMap(rows);
}

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
    weakness_score: 0,
    status: 'not_started'
  };
}

function countNewestWrongStreak(attempts) {
  let count = 0;
  for (const attempt of attempts) {
    if (normalizeCorrect(attempt.is_correct)) break;
    count += 1;
  }
  return count;
}

function compareAttemptsNewestFirst(left, right) {
  const timeDifference = new Date(right.created_at || 0) - new Date(left.created_at || 0);
  return timeDifference || Number(right.id || 0) - Number(left.id || 0);
}

function normalizeCorrect(value) {
  return value === true || Number(value) === 1;
}

function roundScore(value) {
  return Number(Math.min(Math.max(Number(value) || 0, 0), 1).toFixed(4));
}

module.exports = {
  MAX_ATTEMPTS_PER_LESSON,
  RECENCY_DECAY,
  MIN_ATTEMPTS_TO_COMPLETE,
  MIN_WEIGHTED_ACCURACY,
  calculateLessonMastery,
  buildLessonMasteryMap,
  getMasteryByGrade,
  getWeakLessonIds,
  emptyMastery
};
