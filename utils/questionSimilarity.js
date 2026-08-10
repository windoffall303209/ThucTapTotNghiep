// Ti?n ?ch question similarity cung c?p c?c h?m d?ng chung cho chu?n h?a d? li?u, b?o m?t v? x? l? l?i.
const DEFAULT_SIMILARITY_THRESHOLD = 0.9;
const fingerprintCache = new Map();

// H?m normalizeQuestionTextForSimilarity d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function normalizeQuestionTextForSimilarity(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[×∙⋅]/g, '*')
    .replace(/(\d)\s*:\s*(\d)/g, '$1/$2')
    .replace(/÷/g, '/')
    .replace(/[–—−]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\s*([+*/=<>-])\s*/g, '$1')
    .replace(/[^a-z0-9+*/=<>.,%-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// H?m questionSimilarity d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function questionSimilarity(left, right) {
  const leftText = questionText(left);
  const rightText = questionText(right);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!leftText || !rightText) return 0;
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (leftText === rightText) return 1;
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (Math.min(leftText.length, rightText.length) < 12) return 0;
  return diceCoefficient(fingerprint(leftText), fingerprint(rightText));
}

// H?m areQuestionsNearDuplicate d?ng ?? x? l? y?u c?u, ?i?u ph?i c?c b??c nghi?p v? v? ph?n h?i l?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function areQuestionsNearDuplicate(left, right, threshold = DEFAULT_SIMILARITY_THRESHOLD) {
  return questionSimilarity(left, right) >= threshold;
}

// H?m countNearDuplicatePairs d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function countNearDuplicatePairs(questions = [], threshold = DEFAULT_SIMILARITY_THRESHOLD) {
  let pairs = 0;
  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (let leftIndex = 0; leftIndex < questions.length; leftIndex += 1) {
    // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
    for (let rightIndex = leftIndex + 1; rightIndex < questions.length; rightIndex += 1) {
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (areQuestionsNearDuplicate(questions[leftIndex], questions[rightIndex], threshold)) {
        pairs += 1;
      }
    }
  }
  return pairs;
}

// H?m questionText d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function questionText(question) {
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (typeof question === 'string') return normalizeQuestionTextForSimilarity(question);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (typeof question?.similarity_text === 'string') return question.similarity_text;
  const content = question?.content_text
    ?? question?.content?.text
    ?? (typeof question?.content === 'string' ? question.content : '');
  return normalizeQuestionTextForSimilarity(content);
}

// H?m fingerprint d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function fingerprint(value) {
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!fingerprintCache.has(value)) {
    fingerprintCache.set(value, characterBigrams(value));
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (fingerprintCache.size > 20000) {
      const oldestKey = fingerprintCache.keys().next().value;
      fingerprintCache.delete(oldestKey);
    }
  }
  return fingerprintCache.get(value);
}

// H?m characterBigrams d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function characterBigrams(value) {
  const compact = ` ${value} `;
  const counts = new Map();
  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (let index = 0; index < compact.length - 1; index += 1) {
    const gram = compact.slice(index, index + 2);
    counts.set(gram, (counts.get(gram) || 0) + 1);
  }
  return counts;
}

// H?m diceCoefficient d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function diceCoefficient(left, right) {
  const leftTotal = [...left.values()].reduce((sum, count) => sum + count, 0);
  const rightTotal = [...right.values()].reduce((sum, count) => sum + count, 0);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (leftTotal === 0 || rightTotal === 0) return 0;
  let overlap = 0;
  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const [gram, leftCount] of left.entries()) {
    overlap += Math.min(leftCount, right.get(gram) || 0);
  }
  return (2 * overlap) / (leftTotal + rightTotal);
}

module.exports = {
  DEFAULT_SIMILARITY_THRESHOLD,
  normalizeQuestionTextForSimilarity,
  questionSimilarity,
  areQuestionsNearDuplicate,
  countNearDuplicatePairs
};
