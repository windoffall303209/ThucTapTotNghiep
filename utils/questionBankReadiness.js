// Ti?n ?ch question bank readiness cung c?p c?c h?m d?ng chung cho chu?n h?a d? li?u, b?o m?t v? x? l? l?i.
const { DIFFICULTY_TARGETS } = require('./practiceQuestionSelectorV2');

// H?m summarizeDifficulty d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function summarizeDifficulty(candidates = []) {
  return candidates.reduce((summary, question) => {
    const difficulty = normalizeDifficulty(question.difficulty);
    summary[difficulty] += 1;
    return summary;
  }, { EASY: 0, MEDIUM: 0, HARD: 0 });
}

// H?m evaluateScopeReadiness d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function evaluateScopeReadiness(candidates = [], count, maxPerLesson = 2) {
  const requestedCount = Math.max(Number(count) || 0, 0);
  const lessonCounts = countBy(candidates, 'lesson_id');
  const difficulty = summarizeDifficulty(candidates);
  const targets = DIFFICULTY_TARGETS[requestedCount] || ratioTargets(requestedCount);
  const lessonCapacity = [...lessonCounts.values()]
    .reduce((sum, value) => sum + Math.min(value, maxPerLesson), 0);
  const issues = [];

  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (candidates.length < requestedCount) {
    issues.push({
      code: 'INSUFFICIENT_TOTAL',
      missing: requestedCount - candidates.length
    });
  }
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (lessonCapacity < requestedCount) {
    issues.push({
      code: 'INSUFFICIENT_LESSON_CAPACITY',
      missing: requestedCount - lessonCapacity,
      distinctLessons: lessonCounts.size
    });
  }
  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const difficultyName of Object.keys(targets)) {
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
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

// H?m evaluateLessonReadiness d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
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

// H?m summarizeReadiness d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function summarizeReadiness(rows = []) {
  const issueCounts = {};
  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const row of rows) {
    // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
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

// H?m normalizeDifficulty d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function normalizeDifficulty(value) {
  const difficulty = String(value || 'EASY').trim().toUpperCase();
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (difficulty === 'EXPERT') return 'HARD';
  return ['EASY', 'MEDIUM', 'HARD'].includes(difficulty) ? difficulty : 'EASY';
}

// H?m ratioTargets d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function ratioTargets(count) {
  const easy = Math.round(count * 0.45);
  const medium = Math.round(count * 0.4);
  return { EASY: easy, MEDIUM: medium, HARD: Math.max(0, count - easy - medium) };
}

// H?m countBy d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function countBy(items, field) {
  return (items || []).reduce((result, item) => {
    const value = Number(item?.[field]);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
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
