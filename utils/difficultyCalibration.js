const MIN_CALIBRATION_ATTEMPTS = 30;

function inferDifficultyFromAccuracy(accuracy) {
  const normalized = Math.min(Math.max(Number(accuracy) || 0, 0), 1);
  if (normalized >= 0.75) return 'EASY';
  if (normalized >= 0.5) return 'MEDIUM';
  if (normalized >= 0.25) return 'HARD';
  return 'EXPERT';
}

function buildDifficultyWarning(row, minimumAttempts = MIN_CALIBRATION_ATTEMPTS) {
  const attemptCount = Number(row.attempt_count || 0);
  if (attemptCount < minimumAttempts) return null;

  const editorialDifficulty = normalizeDifficulty(row.difficulty);
  const actualAccuracy = Math.min(Math.max(Number(row.actual_accuracy) || 0, 0), 1);
  const observedDifficulty = inferDifficultyFromAccuracy(actualAccuracy);
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
