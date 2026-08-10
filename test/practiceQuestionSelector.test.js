// Bộ kiểm thử practice question selector.test xác minh hành vi và các điều kiện biên quan trọng của hệ thống.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  selectRandomQuestions,
  selectBalancedQuestions
} = require('../utils/practiceQuestionSelector');

// Hàm buildCandidates dùng để xây dựng kết quả từ các nguồn dữ liệu và quy tắc liên quan; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function buildCandidates(chapterLessonCounts, questionsPerLesson = 10) {
  let id = 1;
  return chapterLessonCounts.flatMap((lessonCount, chapterIndex) =>
    Array.from({ length: lessonCount }, (_, lessonIndex) =>
      Array.from({ length: questionsPerLesson }, () => ({
        id: id++,
        chapter_id: chapterIndex + 1,
        lesson_id: (chapterIndex + 1) * 100 + lessonIndex + 1
      }))
    ).flat()
  );
}

// Hàm countBy dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function countBy(items, field) {
  return items.reduce((counts, item) => {
    const key = item[field];
    counts.set(key, (counts.get(key) || 0) + 1);
    return counts;
  }, new Map());
}

test('đề tổng hợp phủ đều nhiều chương và không quá hai câu mỗi bài khi đủ bài', () => {
  const selected = selectBalancedQuestions(
    buildCandidates([5, 5, 5]),
    20,
    { random: () => 0.42 }
  );

  assert.equal(selected.length, 20);
  assert.equal(new Set(selected.map((item) => item.id)).size, 20);

  const chapterCounts = [...countBy(selected, 'chapter_id').values()];
  assert.ok(Math.max(...chapterCounts) - Math.min(...chapterCounts) <= 1);
  assert.ok(
    [...countBy(selected, 'lesson_id').values()].every((value) => value <= 2)
  );
});

test('chương ít bài vẫn đủ số câu và phân bổ cân bằng giữa các bài', () => {
  const selected = selectBalancedQuestions(
    buildCandidates([3]),
    20,
    { random: () => 0.25 }
  );
  const lessonCounts = [...countBy(selected, 'lesson_id').values()];

  assert.equal(selected.length, 20);
  assert.ok(Math.max(...lessonCounts) - Math.min(...lessonCounts) <= 1);
});

test('luyện theo bài loại tám câu ôn lý thuyết khỏi nguồn chọn', () => {
  const candidates = buildCandidates([1], 20);
  const reviewIds = candidates.slice(0, 8).map((item) => item.id);
  const selected = selectRandomQuestions(candidates, 5, {
    excludeIds: reviewIds,
    random: () => 0.5
  });

  assert.equal(selected.length, 5);
  assert.ok(selected.every((item) => !reviewIds.includes(item.id)));
});

test('không trả về nhiều câu hơn dữ liệu hiện có', () => {
  const selected = selectBalancedQuestions(
    buildCandidates([2], 2),
    20,
    { random: () => 0.75 }
  );

  assert.equal(selected.length, 4);
});
