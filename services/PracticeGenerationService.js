// Dịch vụ practice generation service đóng gói nghiệp vụ chính và phối hợp các lớp dữ liệu hoặc tích hợp bên ngoài.
const Question = require('../models/Question');
const {
  createSeededRandom,
  createSelectionSeed,
  selectQuestionsV2
} = require('../utils/practiceQuestionSelectorV2');

const RECENT_LIMITS = Object.freeze({
  LESSON: 5,
  CHAPTER: 30,
  COMPREHENSIVE: 40
});

// Hàm generateLessonSelection dùng để xây dựng kết quả từ các nguồn dữ liệu và quy tắc liên quan; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function generateLessonSelection(options, dependencies = {}) {
  const questionModel = dependencies.Question || Question;
  const candidates = Array.isArray(options.candidates) ? options.candidates : [];
  const count = Math.min(Math.max(Number(options.count) || 5, 0), candidates.length);
  const selectionHistory = await questionModel.getPracticeSelectionHistory({
    studentId: options.studentId,
    grade: options.grade
  });

  return selectQuestionsV2(candidates, {
    count,
    mode: 'LESSON',
    seed: options.seed || createSelectionSeed(),
    selectionHistory,
    recentLimit: RECENT_LIMITS.LESSON,
    reviewIds: (options.reviewQuestions || []).map((question) => question.id),
    maxPerLesson: Math.max(count, 1)
  });
}

// Hàm generateReviewSelection dùng để xây dựng kết quả từ các nguồn dữ liệu và quy tắc liên quan; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
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

// Hàm generateScopedSelection dùng để xây dựng kết quả từ các nguồn dữ liệu và quy tắc liên quan; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function generateScopedSelection(options, dependencies = {}) {
  const questionModel = dependencies.Question || Question;
  const mode = String(options.mode || 'COMPREHENSIVE').toUpperCase() === 'CHAPTER'
    ? 'CHAPTER'
    : 'COMPREHENSIVE';
  const candidates = Array.isArray(options.candidates) ? options.candidates : [];
  const count = Math.min(Math.max(Number(options.count) || 0, 0), candidates.length);
  const selectionHistory = await questionModel.getPracticeSelectionHistory({
    studentId: options.studentId,
    grade: options.grade
  });

  return selectQuestionsV2(candidates, {
    count,
    mode,
    seed: options.seed || createSelectionSeed(),
    selectionHistory,
    recentLimit: RECENT_LIMITS[mode]
  });
}

// Tạo một đề chung từ đúng các bài học sinh đã chọn. Lịch sử câu hỏi vẫn được
// dùng để tránh lặp, còn độ phủ bài được tính lại từ đầu để mọi bài đã chọn có
// cơ hội xuất hiện trong đề hiện tại.
async function generateMultiLessonSelection(options, dependencies = {}) {
  const questionModel = dependencies.Question || Question;
  const candidates = Array.isArray(options.candidates) ? options.candidates : [];
  const selectedLessonIds = [...new Set(
    (Array.isArray(options.lessonIds) ? options.lessonIds : [])
      .map(Number)
      .filter(Boolean)
  )];
  const selectedSet = new Set(selectedLessonIds);
  const scopedCandidates = candidates.filter((question) => selectedSet.has(Number(question.lesson_id)));
  const count = Math.min(Math.max(Number(options.count) || 0, 0), scopedCandidates.length);
  const selectionHistory = await questionModel.getPracticeSelectionHistory({
    studentId: options.studentId,
    grade: options.grade
  });
  const result = selectQuestionsV2(scopedCandidates, {
    count,
    mode: 'COMPREHENSIVE',
    seed: options.seed || createSelectionSeed(),
    selectionHistory: {
      ...selectionHistory,
      lessons: {}
    },
    recentLimit: RECENT_LIMITS.COMPREHENSIVE
  });

  result.selection.metadata.scopeType = 'MULTI_LESSON';
  result.selection.metadata.selectedLessonIds = selectedLessonIds;
  return result;
}

// Với mỗi câu sai trong phiên gần nhất, chọn một câu khác cùng bài và cùng độ
// khó. Không dùng lại bất kỳ câu nguồn nào và không chọn trùng câu thay thế.
function generateWrongAnswerRetrySelection(options = {}) {
  const wrongAnswers = Array.isArray(options.wrongAnswers) ? options.wrongAnswers : [];
  const candidates = Array.isArray(options.candidates) ? options.candidates : [];
  const seed = options.seed || createSelectionSeed();
  const random = createSeededRandom(seed);
  const sourceIds = new Set(wrongAnswers.map((item) => Number(item.question_id)).filter(Boolean));
  const usedIds = new Set(sourceIds);
  const mappings = [];
  const unavailableTargets = [];
  const questions = [];

  for (const target of wrongAnswers) {
    const lessonId = Number(target.lesson_id);
    const difficulty = String(target.difficulty || '').trim().toUpperCase();
    const alternatives = candidates
      .filter((question) => (
        Number(question.lesson_id) === lessonId
        && String(question.difficulty || '').trim().toUpperCase() === difficulty
        && !usedIds.has(Number(question.id))
      ))
      .map((question) => ({ question, order: random() }))
      .sort((left, right) => left.order - right.order || Number(left.question.id) - Number(right.question.id));
    const replacement = alternatives[0]?.question;
    if (!replacement) {
      unavailableTargets.push({
        questionId: Number(target.question_id),
        lessonId,
        difficulty
      });
      continue;
    }

    usedIds.add(Number(replacement.id));
    questions.push(replacement);
    mappings.push({
      sourceQuestionId: Number(target.question_id),
      replacementQuestionId: Number(replacement.id),
      lessonId,
      difficulty
    });
  }

  return {
    questions,
    selection: {
      version: 'wrong-retry-v1',
      seed,
      metadata: {
        mode: 'WRONG_ANSWER_RETRY',
        sourceSessionId: Number(options.sourceSessionId) || null,
        requestedCount: wrongAnswers.length,
        selectedCount: questions.length,
        mappings,
        unavailableTargets,
        fallbackReasons: unavailableTargets.length > 0 ? ['NO_EXACT_REPLACEMENT'] : []
      }
    }
  };
}

module.exports = {
  RECENT_LIMITS,
  generateLessonSelection,
  generateMultiLessonSelection,
  generateReviewSelection,
  generateScopedSelection,
  generateWrongAnswerRetrySelection
};
