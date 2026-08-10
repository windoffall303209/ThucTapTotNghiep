// Bộ kiểm thử learning mastery.test xác minh hành vi và các điều kiện biên quan trọng của hệ thống.
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  calculateLessonMastery,
  buildLessonMasteryMap,
  getWeakLessonIds,
  buildGradeProgress,
  findWeakestLesson
} = require('../services/LearningMasteryService');

// Hàm attempts dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function attempts(values, { lessonId = 10, misconceptions = [], difficulties = [] } = {}) {
  return values.map((isCorrect, index) => ({
    id: values.length - index,
    lesson_id: lessonId,
    is_correct: isCorrect,
    difficulty: difficulties[index] || 'MEDIUM',
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
  assert.equal(calculateLessonMastery(attempts([true, true, true, true])).status, 'insufficient_data');
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
  assert.ok(mastery.raw_weakness_score > 0.5);
  assert.equal(mastery.confidence_score, 0.5);
  assert.ok(mastery.weakness_score < mastery.raw_weakness_score);
});

test('gom năng lực theo bài và xếp bài yếu nhất lên trước trong đúng phạm vi', () => {
  const map = buildLessonMasteryMap([
    ...attempts([false, false, false, false, false], { lessonId: 20 }),
    ...attempts([true, false, true, false, true], { lessonId: 21 }),
    ...attempts([false, false], { lessonId: 22 })
  ]);

  assert.deepEqual(getWeakLessonIds(map, [20, 21]), [20, 21]);
  assert.deepEqual(getWeakLessonIds(map, [22]), []);
  assert.equal(map[20].status, 'needs_review');
});

test('bài chưa có lượt làm có trạng thái not_started khi tính trực tiếp', () => {
  assert.equal(calculateLessonMastery([]).status, 'not_started');
});

test('đúng câu khó có trọng số cao hơn và sai câu dễ bị trừ nhiều hơn', () => {
  const hardCorrect = calculateLessonMastery(attempts(
    [true, false],
    { difficulties: ['HARD', 'MEDIUM'] }
  ));
  const easyCorrect = calculateLessonMastery(attempts(
    [true, false],
    { difficulties: ['EASY', 'MEDIUM'] }
  ));
  const easyWrong = calculateLessonMastery(attempts(
    [true, false],
    { difficulties: ['MEDIUM', 'EASY'] }
  ));
  const hardWrong = calculateLessonMastery(attempts(
    [true, false],
    { difficulties: ['MEDIUM', 'HARD'] }
  ));
  assert.ok(hardCorrect.weighted_accuracy > easyCorrect.weighted_accuracy);
  assert.ok(hardWrong.weighted_accuracy > easyWrong.weighted_accuracy);
});

test('tiến độ và gợi ý trên bảng học tập dùng đúng điều kiện hoàn thành mới', () => {
  const chapters = [{
    chapter_name: 'Chương 1',
    lessons: [
      { id: 1, lesson_name: 'Bài 1' },
      { id: 2, lesson_name: 'Bài 2' },
      { id: 3, lesson_name: 'Bài 3' }
    ]
  }];
  const mastery = {
    1: { status: 'completed', weakness_score: 0.1 },
    2: { status: 'needs_review', weakness_score: 0.4 },
    3: { status: 'needs_review', weakness_score: 0.8 }
  };

  assert.deepEqual(buildGradeProgress(chapters, mastery), {
    total: 3,
    completed: 1,
    percent: 33
  });
  assert.equal(findWeakestLesson(chapters, mastery).id, 3);
});
