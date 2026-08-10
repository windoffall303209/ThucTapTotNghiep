// B? ki?m th? practice generation service.test x?c minh h?nh vi v? c?c ?i?u ki?n bi?n quan tr?ng c?a h? th?ng.
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  RECENT_LIMITS,
  generateLessonSelection,
  generateReviewSelection,
  generateScopedSelection
} = require('../services/PracticeGenerationService');

// H?m buildCandidates d?ng ?? x?y d?ng k?t qu? t? c?c ngu?n d? li?u v? quy t?c li?n quan; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function buildCandidates({ chapters = 3, lessonsPerChapter = 5, eachDifficulty = 3 } = {}) {
  let id = 1;
  const candidates = [];
  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (let chapter = 1; chapter <= chapters; chapter += 1) {
    // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
    for (let lesson = 1; lesson <= lessonsPerChapter; lesson += 1) {
      // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
      for (const difficulty of ['EASY', 'MEDIUM', 'HARD']) {
        // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
        for (let index = 0; index < eachDifficulty; index += 1) {
          candidates.push({
            id: id++,
            chapter_id: chapter,
            lesson_id: chapter * 100 + lesson,
            difficulty
          });
        }
      }
    }
  }
  return candidates;
}

test('luyện theo bài dùng lịch sử tạo đề và tránh nhóm ôn lý thuyết', async () => {
  const candidates = buildCandidates({ chapters: 1, lessonsPerChapter: 1, eachDifficulty: 5 });
  const recentIds = [3, 4, 8, 9, 13];
  const reviewQuestions = [candidates[4], candidates[9], candidates[14]];
  let historyOptions;
  const result = await generateLessonSelection({
    studentId: 9,
    grade: 2,
    lessonId: 101,
    candidates,
    reviewQuestions,
    seed: '1100000000000001'
  }, {
    Question: {
      getPracticeSelectionHistory: async (options) => {
        historyOptions = options;
        return {
          questions: Object.fromEntries(recentIds.map((id, index) => [id, {
            count: 1,
            lastSelectedAt: `2026-08-0${index + 1}T08:00:00.000Z`
          }])),
          lessons: {}
        };
      }
    }
  });

  assert.deepEqual(historyOptions, { studentId: 9, grade: 2 });
  assert.equal(result.questions.length, 5);
  assert.ok(result.questions.every((question) => !recentIds.includes(question.id)));
  assert.ok(result.questions.every((question) => !reviewQuestions.some((item) => item.id === question.id)));
});

test('ôn lý thuyết giữ đúng nhóm 8 câu và trộn ổn định theo seed', () => {
  const questions = buildCandidates({ chapters: 1, lessonsPerChapter: 1, eachDifficulty: 3 }).slice(0, 8);
  const first = generateReviewSelection({ questions, count: 8, seed: '2200000000000001' });
  const repeated = generateReviewSelection({ questions, count: 8, seed: '2200000000000001' });

  assert.deepEqual(first.questions.map((question) => question.id), repeated.questions.map((question) => question.id));
  assert.deepEqual(
    [...first.questions.map((question) => question.id)].sort((a, b) => a - b),
    questions.map((question) => question.id).sort((a, b) => a - b)
  );
});

test('đề chương dùng lịch sử bao phủ của học sinh trong khối lớp', async () => {
  const candidates = buildCandidates();
  let historyOptions;
  const result = await generateScopedSelection({
    studentId: 7,
    grade: 3,
    chapterId: 1,
    mode: 'CHAPTER',
    count: 15,
    candidates,
    seed: '3300000000000001'
  }, {
    Question: {
      getPracticeSelectionHistory: async (options) => {
        historyOptions = options;
        return {
          questions: {},
          lessons: { 101: { count: 9, lastSelectedAt: '2026-08-08T08:00:00.000Z' } }
        };
      }
    }
  });

  assert.deepEqual(historyOptions, { studentId: 7, grade: 3 });
  assert.equal(result.questions.length, 15);
  assert.ok(result.questions.filter((question) => question.lesson_id === 101).length <= 2);
});
