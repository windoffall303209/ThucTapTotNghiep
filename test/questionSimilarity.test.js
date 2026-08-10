// Bộ kiểm thử question similarity.test xác minh hành vi và các điều kiện biên quan trọng của hệ thống.
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeQuestionTextForSimilarity,
  questionSimilarity,
  areQuestionsNearDuplicate,
  countNearDuplicatePairs
} = require('../utils/questionSimilarity');
const { selectQuestionsV2 } = require('../utils/practiceQuestionSelectorV2');

test('chuẩn hóa dấu tiếng Việt, khoảng trắng và ký hiệu toán tương đương', () => {
  assert.equal(
    normalizeQuestionTextForSimilarity('Tính:  12 × 3  = ?'),
    normalizeQuestionTextForSimilarity('Tinh 12 * 3 = ?')
  );
});

test('nhận diện câu gần giống nhưng không gom các câu ngắn khác nhau', () => {
  const first = 'Một cửa hàng có 125 kg gạo và bán đi 25 kg. Hỏi còn lại bao nhiêu ki-lô-gam gạo?';
  const duplicate = 'Một cửa hàng có 125kg gạo, bán đi 25kg. Hỏi còn lại bao nhiêu ki-lô-gam gạo?';
  assert.ok(questionSimilarity(first, duplicate) >= 0.9);
  assert.equal(areQuestionsNearDuplicate('2 + 3', '2 + 4'), false);
});

test('bộ chọn tránh hai câu gần trùng khi ngân hàng còn phương án thay thế', () => {
  const candidates = [
    { id: 1, lesson_id: 1, chapter_id: 1, difficulty: 'EASY', content_text: 'Tính 12 × 3 bằng bao nhiêu?' },
    { id: 2, lesson_id: 1, chapter_id: 1, difficulty: 'EASY', content_text: 'Tính 12 * 3 bằng bao nhiêu?' },
    { id: 3, lesson_id: 3, chapter_id: 1, difficulty: 'MEDIUM', content_text: 'Số nào lớn hơn 125 và nhỏ hơn 130?' },
    { id: 4, lesson_id: 4, chapter_id: 1, difficulty: 'MEDIUM', content_text: 'Một hình vuông có bao nhiêu cạnh?' },
    { id: 5, lesson_id: 5, chapter_id: 1, difficulty: 'HARD', content_text: 'Tìm số bị chia khi biết thương là 4 và số chia là 5.' },
    { id: 6, lesson_id: 6, chapter_id: 1, difficulty: 'EASY', content_text: 'Viết số gồm ba trăm, hai chục và năm đơn vị.' }
  ];
  const result = selectQuestionsV2(candidates, {
    count: 5,
    mode: 'CHAPTER',
    seed: '7100000000000001',
    maxPerLesson: 2
  });

  assert.equal(result.questions.length, 5);
  assert.equal(countNearDuplicatePairs(result.questions), 0);
  assert.equal(result.selection.metadata.nearDuplicatePairs, 0);
  assert.ok(!(result.questions.some((item) => item.id === 1) && result.questions.some((item) => item.id === 2)));
});

test('ghi rõ fallback khi nguồn chỉ gồm các câu gần trùng', () => {
  const candidates = Array.from({ length: 5 }, (_, index) => ({
    id: index + 1,
    lesson_id: index + 1,
    chapter_id: 1,
    difficulty: index < 2 ? 'EASY' : index < 4 ? 'MEDIUM' : 'HARD',
    content_text: `Tính 12 × 3 bằng bao nhiêu${'.'.repeat(index + 1)}`
  }));
  const result = selectQuestionsV2(candidates, {
    count: 5,
    mode: 'CHAPTER',
    seed: '7200000000000001'
  });

  assert.equal(result.questions.length, 5);
  assert.ok(result.selection.metadata.fallbackReasons.includes('SIMILARITY_RELAXED'));
  assert.ok(result.selection.metadata.nearDuplicatePairs > 0);
});
