function answersMatch(question, selectedAnswer) {
  const expected = String(question?.correct_answer || '').trim();
  const actual = String(selectedAnswer || '').trim();
  if (question?.question_type === 'FILL_IN_THE_BLANK') {
    return normalizeFreeTextAnswer(actual) === normalizeFreeTextAnswer(expected);
  }
  return actual === expected;
}

function normalizeFreeTextAnswer(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/,/g, '.');
}

function normalizeSubmittedAnswer(value) {
  const answer = String(value || '').trim();
  if (!answer || answer.length > 50) return null;
  return answer;
}

function normalizeTimeSpentSeconds(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.min(Math.round(seconds), 24 * 60 * 60);
}

module.exports = {
  answersMatch,
  normalizeFreeTextAnswer,
  normalizeSubmittedAnswer,
  normalizeTimeSpentSeconds
};
