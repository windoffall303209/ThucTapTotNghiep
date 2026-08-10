// B? ki?m th? practice question selector.test x?c minh h?nh vi v? c?c ?i?u ki?n bi?n quan tr?ng c?a h? th?ng.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  selectRandomQuestions,
  selectBalancedQuestions
} = require('../utils/practiceQuestionSelector');

// H?m buildCandidates d?ng ?? x?y d?ng k?t qu? t? c?c ngu?n d? li?u v? quy t?c li?n quan; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
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

// H?m countBy d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
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
