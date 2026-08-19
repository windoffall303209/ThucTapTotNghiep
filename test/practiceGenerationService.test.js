// Bộ kiểm thử practice generation service.test xác minh hành vi và các điều kiện biên quan trọng của hệ thống.
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  RECENT_LIMITS,
  generateLessonSelection,
  generateMultiLessonSelection,
  generateReviewSelection,
  generateScopedSelection,
  generateWrongAnswerRetrySelection
} = require('../services/PracticeGenerationService');

// Hàm buildCandidates dùng để xây dựng kết quả từ các nguồn dữ liệu và quy tắc liên quan; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function buildCandidates({ chapters = 3, lessonsPerChapter = 5, eachDifficulty = 3 } = {}) {
  let id = 1;
  const candidates = [];
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (let chapter = 1; chapter <= chapters; chapter += 1) {
    // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
    for (let lesson = 1; lesson <= lessonsPerChapter; lesson += 1) {
      // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
      for (const difficulty of ['EASY', 'MEDIUM', 'HARD']) {
        // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
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

test('đề nhiều bài chỉ dùng phạm vi đã chọn và bao phủ từng bài', async () => {
  const candidates = buildCandidates({ chapters: 1, lessonsPerChapter: 5, eachDifficulty: 3 });
  const lessonIds = [101, 103, 105];
  const result = await generateMultiLessonSelection({
    studentId: 12,
    grade: 4,
    lessonIds,
    count: 5,
    candidates,
    seed: '4400000000000001'
  }, {
    Question: {
      getPracticeSelectionHistory: async () => ({ questions: {}, lessons: {} })
    }
  });

  assert.equal(result.questions.length, 5);
  assert.ok(result.questions.every((question) => lessonIds.includes(question.lesson_id)));
  lessonIds.forEach((lessonId) => {
    assert.ok(result.questions.some((question) => question.lesson_id === lessonId));
  });
  assert.equal(result.selection.metadata.scopeType, 'MULTI_LESSON');
  assert.deepEqual(result.selection.metadata.selectedLessonIds, lessonIds);
});

test('luyện lại câu sai chọn câu khác cùng bài, cùng độ khó và không chọn trùng', () => {
  const candidates = [
    { id: 1, lesson_id: 101, chapter_id: 1, difficulty: 'EASY' },
    { id: 2, lesson_id: 101, chapter_id: 1, difficulty: 'EASY' },
    { id: 3, lesson_id: 101, chapter_id: 1, difficulty: 'EASY' },
    { id: 4, lesson_id: 102, chapter_id: 1, difficulty: 'HARD' },
    { id: 5, lesson_id: 102, chapter_id: 1, difficulty: 'HARD' },
    { id: 6, lesson_id: 102, chapter_id: 1, difficulty: 'MEDIUM' }
  ];
  const wrongAnswers = [
    { question_id: 1, lesson_id: 101, difficulty: 'EASY' },
    { question_id: 4, lesson_id: 102, difficulty: 'HARD' }
  ];
  const first = generateWrongAnswerRetrySelection({
    sourceSessionId: 88,
    wrongAnswers,
    candidates,
    seed: '5500000000000001'
  });
  const repeated = generateWrongAnswerRetrySelection({
    sourceSessionId: 88,
    wrongAnswers,
    candidates,
    seed: '5500000000000001'
  });

  assert.deepEqual(first.questions.map((question) => question.id), repeated.questions.map((question) => question.id));
  assert.equal(first.questions.length, 2);
  assert.equal(new Set(first.questions.map((question) => question.id)).size, 2);
  first.selection.metadata.mappings.forEach((mapping) => {
    const replacement = candidates.find((question) => question.id === mapping.replacementQuestionId);
    assert.notEqual(mapping.sourceQuestionId, mapping.replacementQuestionId);
    assert.equal(replacement.lesson_id, mapping.lessonId);
    assert.equal(replacement.difficulty, mapping.difficulty);
  });
});

test('luyện lại câu sai không hạ điều kiện khi thiếu câu thay thế chính xác', () => {
  const result = generateWrongAnswerRetrySelection({
    wrongAnswers: [{ question_id: 7, lesson_id: 201, difficulty: 'HARD' }],
    candidates: [
      { id: 8, lesson_id: 201, chapter_id: 2, difficulty: 'MEDIUM' },
      { id: 9, lesson_id: 202, chapter_id: 2, difficulty: 'HARD' }
    ],
    seed: '6600000000000001'
  });

  assert.deepEqual(result.questions, []);
  assert.equal(result.selection.metadata.unavailableTargets.length, 1);
  assert.deepEqual(result.selection.metadata.fallbackReasons, ['NO_EXACT_REPLACEMENT']);
});
