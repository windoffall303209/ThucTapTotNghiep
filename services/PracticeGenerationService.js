const Question = require('../models/Question');
const LearningMasteryService = require('./LearningMasteryService');
const {
  createSelectionSeed,
  selectQuestionsV2
} = require('../utils/practiceQuestionSelectorV2');

const RECENT_LIMITS = Object.freeze({
  LESSON: 5,
  CHAPTER: 30,
  COMPREHENSIVE: 40
});

async function generateLessonSelection(options, dependencies = {}) {
  const questionModel = dependencies.Question || Question;
  const candidates = Array.isArray(options.candidates) ? options.candidates : [];
  const count = Math.min(Math.max(Number(options.count) || 5, 0), candidates.length);
  const recentIds = await questionModel.getRecentQuestionIds({
    studentId: options.studentId,
    grade: options.grade,
    lessonId: options.lessonId,
    limit: RECENT_LIMITS.LESSON
  });

  return selectQuestionsV2(candidates, {
    count,
    mode: 'LESSON',
    seed: options.seed || createSelectionSeed(),
    recentIds,
    reviewIds: (options.reviewQuestions || []).map((question) => question.id),
    maxPerLesson: Math.max(count, 1)
  });
}

function generateReviewSelection(options = {}) {
  const questions = (Array.isArray(options.questions) ? options.questions : []).map((question) => ({
    ...question,
    lesson_id: Number(question.lesson_id || options.lessonId),
    chapter_id: Number(question.chapter_id || options.chapterId)
  }));
  const count = Math.min(Math.max(Number(options.count) || 8, 0), questions.length);
  return selectQuestionsV2(questions, {
    count,
    mode: 'REVIEW',
    seed: options.seed || createSelectionSeed(),
    maxPerLesson: Math.max(count, 1)
  });
}

async function generateScopedSelection(options, dependencies = {}) {
  const questionModel = dependencies.Question || Question;
  const masteryService = dependencies.LearningMasteryService || LearningMasteryService;
  const mode = String(options.mode || 'COMPREHENSIVE').toUpperCase() === 'CHAPTER'
    ? 'CHAPTER'
    : 'COMPREHENSIVE';
  const candidates = Array.isArray(options.candidates) ? options.candidates : [];
  const count = Math.min(Math.max(Number(options.count) || 0, 0), candidates.length);
  const lessonIds = [...new Set(candidates.map((question) => Number(question.lesson_id)).filter(Boolean))];
  const [recentIds, masteryByLesson] = await Promise.all([
    questionModel.getRecentQuestionIds({
      studentId: options.studentId,
      grade: options.grade,
      chapterId: mode === 'CHAPTER' ? options.chapterId : null,
      semester: mode === 'COMPREHENSIVE' ? options.semester : null,
      limit: RECENT_LIMITS[mode]
    }),
    masteryService.getMasteryByGrade(options.studentId, options.grade)
  ]);
  const weakLessonIds = masteryService.getWeakLessonIds(masteryByLesson, lessonIds);

  return selectQuestionsV2(candidates, {
    count,
    mode,
    seed: options.seed || createSelectionSeed(),
    recentIds,
    weakLessonIds,
    personalizationRatio: 0.3,
    maxPerLesson: 2
  });
}

module.exports = {
  RECENT_LIMITS,
  generateLessonSelection,
  generateReviewSelection,
  generateScopedSelection
};
