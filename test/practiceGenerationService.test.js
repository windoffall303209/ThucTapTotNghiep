const test = require('node:test');
const assert = require('node:assert/strict');

const {
  RECENT_LIMITS,
  generateLessonSelection,
  generateReviewSelection,
  generateScopedSelection
} = require('../services/PracticeGenerationService');

function buildCandidates({ chapters = 3, lessonsPerChapter = 5, eachDifficulty = 3 } = {}) {
  let id = 1;
  const candidates = [];
  for (let chapter = 1; chapter <= chapters; chapter += 1) {
    for (let lesson = 1; lesson <= lessonsPerChapter; lesson += 1) {
      for (const difficulty of ['EASY', 'MEDIUM', 'HARD']) {
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

test('luyện theo bài tránh đúng 5 câu gần nhất và tránh nhóm ôn lý thuyết', async () => {
  const candidates = buildCandidates({ chapters: 1, lessonsPerChapter: 1, eachDifficulty: 5 });
  const recentIds = [3, 4, 8, 9, 13];
  const reviewQuestions = [candidates[4], candidates[9], candidates[14]];
  let recentOptions;
  const result = await generateLessonSelection({
    studentId: 9,
    grade: 2,
    lessonId: 101,
    candidates,
    reviewQuestions,
    seed: '1100000000000001'
  }, {
    Question: {
      getRecentQuestionIds: async (options) => {
        recentOptions = options;
        return recentIds;
      }
    }
  });

  assert.equal(recentOptions.limit, RECENT_LIMITS.LESSON);
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

test('đề chương dùng 30 câu gần nhất và ưu tiên các bài yếu trong đúng phạm vi', async () => {
  const candidates = buildCandidates();
  let recentOptions;
  const mastery = {
    101: { status: 'needs_review', weakness_score: 0.9 },
    201: { status: 'needs_review', weakness_score: 0.8 },
    999: { status: 'needs_review', weakness_score: 1 }
  };
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
      getRecentQuestionIds: async (options) => {
        recentOptions = options;
        return [];
      }
    },
    LearningMasteryService: {
      getMasteryByGrade: async () => mastery,
      getWeakLessonIds: (masteryMap, allowed) => Object.keys(masteryMap)
        .map(Number)
        .filter((lessonId) => allowed.includes(lessonId) && masteryMap[lessonId].status === 'needs_review')
    }
  });

  assert.equal(recentOptions.limit, RECENT_LIMITS.CHAPTER);
  assert.equal(recentOptions.chapterId, 1);
  assert.equal(result.questions.length, 15);
  assert.equal(result.selection.metadata.weakTarget, 4);
  assert.equal(result.selection.metadata.weakSelected, 4);
  assert.ok(result.questions.every((question) => question.lesson_id !== 999));
});
