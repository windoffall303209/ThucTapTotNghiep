// Ti?n ?ch difficulty calibration cung c?p c?c h?m d?ng chung cho chu?n h?a d? li?u, b?o m?t v? x? l? l?i.
const MIN_CALIBRATION_ATTEMPTS = 30;

// H?m inferDifficultyFromAccuracy d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function inferDifficultyFromAccuracy(accuracy) {
  const normalized = Math.min(Math.max(Number(accuracy) || 0, 0), 1);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (normalized >= 0.75) return 'EASY';
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (normalized >= 0.5) return 'MEDIUM';
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (normalized >= 0.25) return 'HARD';
  return 'EXPERT';
}

// H?m buildDifficultyWarning d?ng ?? x?y d?ng k?t qu? t? c?c ngu?n d? li?u v? quy t?c li?n quan; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function buildDifficultyWarning(row, minimumAttempts = MIN_CALIBRATION_ATTEMPTS) {
  const attemptCount = Number(row.attempt_count || 0);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (attemptCount < minimumAttempts) return null;

  const editorialDifficulty = normalizeDifficulty(row.difficulty);
  const actualAccuracy = Math.min(Math.max(Number(row.actual_accuracy) || 0, 0), 1);
  const observedDifficulty = inferDifficultyFromAccuracy(actualAccuracy);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
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

// H?m normalizeDifficulty d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
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
