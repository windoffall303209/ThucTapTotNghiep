// Ti?n ?ch answer validation cung c?p c?c h?m d?ng chung cho chu?n h?a d? li?u, b?o m?t v? x? l? l?i.
function answersMatch(question, selectedAnswer) {
  const expected = String(question?.correct_answer || '').trim();
  const actual = String(selectedAnswer || '').trim();
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (question?.question_type === 'FILL_IN_THE_BLANK') {
    return normalizeFreeTextAnswer(actual) === normalizeFreeTextAnswer(expected);
  }
  return actual === expected;
}

// H?m normalizeFreeTextAnswer d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function normalizeFreeTextAnswer(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/,/g, '.');
}

// H?m normalizeSubmittedAnswer d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function normalizeSubmittedAnswer(value) {
  const answer = String(value || '').trim();
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!answer || answer.length > 50) return null;
  return answer;
}

// H?m normalizeTimeSpentSeconds d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function normalizeTimeSpentSeconds(value) {
  const seconds = Number(value);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.min(Math.round(seconds), 24 * 60 * 60);
}

module.exports = {
  answersMatch,
  normalizeFreeTextAnswer,
  normalizeSubmittedAnswer,
  normalizeTimeSpentSeconds
};
