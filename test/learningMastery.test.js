const test = require('node:test');
const assert = require('node:assert/strict');

const {
  calculateLessonMastery,
  buildLessonMasteryMap,
  getWeakLessonIds
} = require('../services/LearningMasteryService');

function attempts(values, { lessonId = 10, misconceptions = [] } = {}) {
  return values.map((isCorrect, index) => ({
    id: values.length - index,
    lesson_id: lessonId,
    is_correct: isCorrect,
    detected_misconception_id: misconceptions[index] ? index + 1 : null,
    created_at: new Date(Date.UTC(2026, 7, 3, 12, 0, -index)).toISOString()
  }));
}

test('chỉ dùng 10 lượt gần nhất và giảm trọng số lượt cũ theo hệ số 0,85', () => {
  const mastery = calculateLessonMastery(attempts([
    true, true, true, true, true, true, true, true, false, false, false, false
  ]));

  const expectedWeight = Array.from({ length: 10 }, (_, index) => 0.85 ** index);
  const expectedCorrectWeight = expectedWeight.slice(0, 8).reduce((sum, value) => sum + value, 0);
  assert.equal(mastery.attempt_count, 10);
  assert.equal(
    mastery.weighted_accuracy,
    Number((expectedCorrectWeight / expectedWeight.reduce((sum, value) => sum + value, 0)).toFixed(4))
  );
});

test('chỉ hoàn thành khi đủ 5 lượt, đạt 80% có trọng số và lượt mới nhất đúng', () => {
  assert.equal(calculateLessonMastery(attempts([true, true, true, true])).status, 'needs_review');
  assert.equal(calculateLessonMastery(attempts([true, true, true, true, true])).status, 'completed');
  assert.equal(calculateLessonMastery(attempts([false, true, true, true, true])).status, 'needs_review');
});

test('điểm yếu kết hợp tỷ lệ sai, chuỗi sai gần nhất và lỗi sai thường gặp', () => {
  const mastery = calculateLessonMastery(attempts(
    [false, false, true, false, true],
    { misconceptions: [true, true, false, false, false] }
  ));

  assert.equal(mastery.wrong_streak, 2);
  assert.equal(mastery.misconception_rate, 0.6667);
  assert.equal(mastery.status, 'needs_review');
  assert.ok(mastery.weakness_score > 0.5);
});

test('gom năng lực theo bài và xếp bài yếu nhất lên trước trong đúng phạm vi', () => {
  const map = buildLessonMasteryMap([
    ...attempts([false, false, false], { lessonId: 20 }),
    ...attempts([true, false, true], { lessonId: 21 }),
    ...attempts([false, false], { lessonId: 22 })
  ]);

  assert.deepEqual(getWeakLessonIds(map, [20, 21]), [20, 21]);
  assert.deepEqual(getWeakLessonIds(map, [22]), [22]);
  assert.equal(map[20].status, 'needs_review');
});

test('bài chưa có lượt làm có trạng thái not_started khi tính trực tiếp', () => {
  assert.equal(calculateLessonMastery([]).status, 'not_started');
});
