const { DIFFICULTY_TARGETS } = require('./practiceQuestionSelectorV2');

function summarizeDifficulty(candidates = []) {
  return candidates.reduce((summary, question) => {
    const difficulty = normalizeDifficulty(question.difficulty);
    summary[difficulty] += 1;
    return summary;
  }, { EASY: 0, MEDIUM: 0, HARD: 0 });
}

function evaluateScopeReadiness(candidates = [], count, maxPerLesson = 2) {
  const requestedCount = Math.max(Number(count) || 0, 0);
  const lessonCounts = countBy(candidates, 'lesson_id');
  const difficulty = summarizeDifficulty(candidates);
  const targets = DIFFICULTY_TARGETS[requestedCount] || ratioTargets(requestedCount);
  const lessonCapacity = [...lessonCounts.values()]
    .reduce((sum, value) => sum + Math.min(value, maxPerLesson), 0);
  const issues = [];

  if (candidates.length < requestedCount) {
    issues.push({
      code: 'INSUFFICIENT_TOTAL',
      missing: requestedCount - candidates.length
    });
  }
  if (lessonCapacity < requestedCount) {
    issues.push({
      code: 'INSUFFICIENT_LESSON_CAPACITY',
      missing: requestedCount - lessonCapacity,
      distinctLessons: lessonCounts.size
    });
  }
  for (const difficultyName of Object.keys(targets)) {
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

function summarizeReadiness(rows = []) {
  const issueCounts = {};
  for (const row of rows) {
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

function normalizeDifficulty(value) {
  const difficulty = String(value || 'EASY').trim().toUpperCase();
  if (difficulty === 'EXPERT') return 'HARD';
  return ['EASY', 'MEDIUM', 'HARD'].includes(difficulty) ? difficulty : 'EASY';
}

function ratioTargets(count) {
  const easy = Math.round(count * 0.45);
  const medium = Math.round(count * 0.4);
  return { EASY: easy, MEDIUM: medium, HARD: Math.max(0, count - easy - medium) };
}

function countBy(items, field) {
  return (items || []).reduce((result, item) => {
    const value = Number(item?.[field]);
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
