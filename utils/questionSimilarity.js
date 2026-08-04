const DEFAULT_SIMILARITY_THRESHOLD = 0.9;

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

function questionSimilarity(left, right) {
  const leftText = questionText(left);
  const rightText = questionText(right);
  if (!leftText || !rightText) return 0;
  if (leftText === rightText) return 1;
  if (Math.min(leftText.length, rightText.length) < 12) return 0;
  return diceCoefficient(characterBigrams(leftText), characterBigrams(rightText));
}

function areQuestionsNearDuplicate(left, right, threshold = DEFAULT_SIMILARITY_THRESHOLD) {
  return questionSimilarity(left, right) >= threshold;
}

function countNearDuplicatePairs(questions = [], threshold = DEFAULT_SIMILARITY_THRESHOLD) {
  let pairs = 0;
  for (let leftIndex = 0; leftIndex < questions.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < questions.length; rightIndex += 1) {
      if (areQuestionsNearDuplicate(questions[leftIndex], questions[rightIndex], threshold)) {
        pairs += 1;
      }
    }
  }
  return pairs;
}

function questionText(question) {
  if (typeof question === 'string') return normalizeQuestionTextForSimilarity(question);
  const content = question?.content_text
    ?? question?.content?.text
    ?? (typeof question?.content === 'string' ? question.content : '');
  return normalizeQuestionTextForSimilarity(content);
}

function characterBigrams(value) {
  const compact = ` ${value} `;
  const counts = new Map();
  for (let index = 0; index < compact.length - 1; index += 1) {
    const gram = compact.slice(index, index + 2);
    counts.set(gram, (counts.get(gram) || 0) + 1);
  }
  return counts;
}

function diceCoefficient(left, right) {
  const leftTotal = [...left.values()].reduce((sum, count) => sum + count, 0);
  const rightTotal = [...right.values()].reduce((sum, count) => sum + count, 0);
  if (leftTotal === 0 || rightTotal === 0) return 0;
  let overlap = 0;
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
