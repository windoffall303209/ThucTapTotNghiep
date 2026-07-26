const bcrypt = require('bcryptjs');
const Curriculum = require('../models/Curriculum');
const Question = require('../models/Question');
const PracticeSession = require('../models/PracticeSession');
const Student = require('../models/Student');
const SocraticAIService = require('../services/SocraticAIService');
const SystemSetting = require('../models/SystemSetting');
const AIConversationLog = require('../models/AIConversationLog');
const { setFlash } = require('../utils/flash');
const { isSupportedGrade } = require('../config/grades');
const {
  selectRandomQuestions,
  selectBalancedQuestions
} = require('../utils/practiceQuestionSelector');

const PRACTICE_LIMITS = [15, 20];
const THEORY_REVIEW_COUNT = 8;
const LESSON_PRACTICE_COUNT = 5;

async function dashboard(req, res, next) {
  try {
    const student = req.auth;
    const [chapters, progress, recommendation, lessonProgress, recentAttempts] = await Promise.all([
      Curriculum.getCurriculumByGrade(student.current_grade),
      Curriculum.getProgress(student.id, student.current_grade),
      Curriculum.getRecommendation(student.id),
      Curriculum.getLessonProgressByGrade(student.id, student.current_grade),
      Curriculum.getRecentAttempts(student.id)
    ]);

    res.render('student/dashboard', {
      title: 'Bảng học tập',
      chapters,
      progress,
      recommendation,
      lessonProgress,
      recentAttempts
    });
  } catch (error) {
    next(error);
  }
}

async function lesson(req, res, next) {
  try {
    const lessonItem = await Curriculum.getLessonById(req.params.id);
    if (!lessonItem) {
      return res.status(404).render('error', {
        title: 'Không tìm thấy bài học',
        message: 'Bài học không tồn tại hoặc chưa được nhập vào hệ thống.'
      });
    }

    if (!canAccessLesson(req.auth, lessonItem)) {
      return res.status(403).render('error', {
        title: 'Không thuộc khối học hiện tại',
        message: 'Bài học này không thuộc khối học Tiểu học đang được hỗ trợ hoặc không đúng lớp của em.'
      });
    }

    const reviewQuestions = await Question.getTheoryReviewQuestions(
      lessonItem.id,
      THEORY_REVIEW_COUNT
    );

    res.render('student/lesson', {
      title: lessonItem.lesson_name,
      lesson: lessonItem,
      reviewQuestionCount: reviewQuestions.length
    });
  } catch (error) {
    next(error);
  }
}

async function practice(req, res, next) {
  try {
    const student = req.auth;
    const lessonItem = await Curriculum.getLessonById(req.params.id);
    if (!lessonItem) {
      return res.status(404).render('error', {
        title: 'Không tìm thấy bài luyện tập',
        message: 'Bài luyện tập không tồn tại hoặc chưa được nhập vào hệ thống.'
      });
    }

    if (!canAccessLesson(student, lessonItem)) {
      return res.status(403).render('error', {
        title: 'Không thuộc khối học hiện tại',
        message: 'Bài luyện tập này không thuộc lớp hiện tại của em.'
      });
    }

    const [candidates, reviewQuestions] = await Promise.all([
      Question.getQuestionCandidates({
        grade: student.current_grade,
        lessonId: lessonItem.id
      }),
      Question.getTheoryReviewQuestions(lessonItem.id, THEORY_REVIEW_COUNT)
    ]);
    let session = await PracticeSession.getActiveLessonSession(student.id, lessonItem.id);
    if (!session) {
      const questions = selectRandomQuestions(candidates, LESSON_PRACTICE_COUNT, {
        excludeIds: reviewQuestions.map((question) => question.id)
      });
      session = await PracticeSession.createSession({
        studentId: student.id,
        lessonId: lessonItem.id,
        chapterId: lessonItem.chapter_id,
        mode: 'LESSON',
        title: `Luyện theo bài: ${lessonItem.lesson_name}`,
        questionIds: questions.map((question) => question.id)
      });
    }
    const sessionQuestions = await Question.getQuestionsByIds(session.question_ids);
    res.render('student/practice', {
      title: `Luyện theo bài: ${lessonItem.lesson_name}`,
      lesson: lessonItem,
      questions: sessionQuestions,
      session
    });
  } catch (error) {
    next(error);
  }
}

async function reviewLesson(req, res, next) {
  try {
    const student = req.auth;
    const lessonItem = await Curriculum.getLessonById(req.params.id);
    if (!lessonItem) {
      return res.status(404).render('error', {
        title: 'Không tìm thấy bài ôn tập',
        message: 'Bài ôn tập không tồn tại hoặc chưa được nhập vào hệ thống.'
      });
    }

    if (!canAccessLesson(student, lessonItem)) {
      return res.status(403).render('error', {
        title: 'Không thuộc khối học hiện tại',
        message: 'Bài ôn tập này không thuộc lớp hiện tại của em.'
      });
    }

    const questions = await Question.getTheoryReviewQuestions(
      lessonItem.id,
      THEORY_REVIEW_COUNT
    );
    let session = await PracticeSession.getActiveLessonSession(
      student.id,
      lessonItem.id,
      'REVIEW'
    );
    if (!session) {
      session = await PracticeSession.createSession({
        studentId: student.id,
        lessonId: lessonItem.id,
        chapterId: lessonItem.chapter_id,
        mode: 'REVIEW',
        title: `Ôn sau lý thuyết: ${lessonItem.lesson_name}`,
        questionIds: questions.map((question) => question.id)
      });
    }

    const sessionQuestions = await Question.getQuestionsByIds(session.question_ids);
    return res.render('student/practice', {
      title: session.title,
      lesson: lessonItem,
      questions: sessionQuestions,
      session
    });
  } catch (error) {
    next(error);
  }
}

async function history(req, res, next) {
  try {
    const sessions = await PracticeSession.listSessions(req.auth.id, 100);
    const attempts = await Curriculum.getRecentAttempts(req.auth.id, 100);
    const legacySessions = buildLegacyAttemptRows(attempts);
    res.render('student/history', {
      title: 'Lịch sử luyện tập',
      sessions,
      legacySessions,
      attempts
    });
  } catch (error) {
    next(error);
  }
}

async function account(req, res, next) {
  try {
    const student = await Student.findById(req.auth.id);
    res.render('student/account', {
      title: 'Tài khoản',
      account: student || req.auth
    });
  } catch (error) {
    next(error);
  }
}

async function updatePassword(req, res, next) {
  try {
    const student = await Student.findById(req.auth.id);
    const currentPassword = String(req.body.current_password || '');
    const newPassword = String(req.body.new_password || '');
    const confirmPassword = String(req.body.confirm_password || '');

    if (!student) {
      setFlash(req, 'danger', 'Không tìm thấy tài khoản học sinh.');
      return res.redirect('/student/account');
    }

    if (!currentPassword || !newPassword || !confirmPassword) {
      setFlash(req, 'danger', 'Vui lòng nhập đầy đủ mật khẩu hiện tại và mật khẩu mới.');
      return res.redirect('/student/account');
    }

    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, student.password_hash);
    if (!isCurrentPasswordValid) {
      setFlash(req, 'danger', 'Mật khẩu hiện tại không đúng.');
      return res.redirect('/student/account');
    }

    if (newPassword.length < 8) {
      setFlash(req, 'danger', 'Mật khẩu mới cần có ít nhất 8 ký tự.');
      return res.redirect('/student/account');
    }

    if (newPassword !== confirmPassword) {
      setFlash(req, 'danger', 'Mật khẩu mới và xác nhận mật khẩu không khớp.');
      return res.redirect('/student/account');
    }

    await Student.updatePassword(req.auth.id, newPassword);
    setFlash(req, 'success', 'Đã đổi mật khẩu tài khoản.');
    return res.redirect('/student/account');
  } catch (error) {
    next(error);
  }
}

async function exams(req, res, next) {
  try {
    const [sessions, chapters] = await Promise.all([
      PracticeSession.listSessions(req.auth.id, 20),
      Curriculum.getCurriculumByGrade(req.auth.current_grade)
    ]);

    res.render('student/exams', {
      title: 'Luyện tập',
      limits: PRACTICE_LIMITS,
      chapters,
      sessions: sessions.filter((session) =>
        ['CHAPTER', 'COMPREHENSIVE'].includes(session.session_mode)
        && session.status === 'IN_PROGRESS'
      )
    });
  } catch (error) {
    next(error);
  }
}

async function startExam(req, res, next) {
  try {
    const grade = Number(req.auth.current_grade);
    const count = PRACTICE_LIMITS.includes(Number(req.body.count))
      ? Number(req.body.count)
      : PRACTICE_LIMITS[0];
    const requestedMode = String(req.body.mode || 'comprehensive');
    let candidates = [];
    let sessionData = {
      chapterId: null,
      semester: null,
      mode: 'COMPREHENSIVE',
      title: `Luyện tập tổng hợp cả năm · ${count} câu`
    };

    if (requestedMode === 'chapter') {
      const chapter = await Curriculum.getChapterById(req.body.chapter_id);
      if (!chapter || Number(chapter.grade) !== grade) {
        setFlash(req, 'danger', 'Vui lòng chọn một chương thuộc đúng lớp hiện tại.');
        return res.redirect('/student/exams');
      }
      candidates = await Question.getQuestionCandidates({
        grade,
        chapterId: chapter.id
      });
      sessionData = {
        chapterId: chapter.id,
        semester: chapter.semester,
        mode: 'CHAPTER',
        title: `${chapter.chapter_name} · ${count} câu`
      };
    } else {
      const scope = String(req.body.scope || 'year');
      const semester = scope === 'semester-1'
        ? 1
        : scope === 'semester-2'
          ? 2
          : null;
      candidates = await Question.getQuestionCandidates({ grade, semester });
      sessionData.semester = semester;
      sessionData.title = semester
        ? `Luyện tập tổng hợp học kỳ ${semester === 1 ? 'I' : 'II'} · ${count} câu`
        : `Luyện tập tổng hợp cả năm · ${count} câu`;
    }

    const selectedCandidates = selectBalancedQuestions(candidates, count);
    const questions = await Question.getQuestionsByIds(
      selectedCandidates.map((question) => question.id)
    );

    if (questions.length === 0) {
      setFlash(req, 'danger', 'Ngân hàng câu hỏi chưa có dữ liệu phù hợp với phạm vi đã chọn.');
      return res.redirect('/student/exams');
    }

    const session = await PracticeSession.createSession({
      studentId: req.auth.id,
      lessonId: null,
      chapterId: sessionData.chapterId,
      semester: sessionData.semester,
      mode: sessionData.mode,
      title: sessionData.title.replace(`${count} câu`, `${questions.length} câu`),
      questionIds: questions.map((question) => question.id)
    });

    return res.redirect(`/student/sessions/${session.id}/practice`);
  } catch (error) {
    next(error);
  }
}

async function sessionPractice(req, res, next) {
  try {
    const session = await PracticeSession.getSessionById(req.auth.id, req.params.id);
    if (!session) {
      return res.status(404).render('error', {
        title: 'Không tìm thấy lần làm bài',
        message: 'Lần làm bài này không tồn tại hoặc không thuộc tài khoản của em.'
      });
    }

    if (session.status === 'COMPLETED') {
      return res.redirect(`/student/sessions/${session.id}`);
    }

    const questions = await Question.getQuestionsByIds(session.question_ids);
    res.render('student/practice', {
      title: session.title,
      lesson: {
        id: session.lesson_id || '',
        lesson_name: session.title
      },
      questions,
      session
    });
  } catch (error) {
    next(error);
  }
}

async function reviewSession(req, res, next) {
  try {
    const session = await PracticeSession.getSessionById(req.auth.id, req.params.id);
    if (!session) {
      return res.status(404).render('error', {
        title: 'Không tìm thấy lịch sử',
        message: 'Lịch sử làm bài này không tồn tại hoặc không thuộc tài khoản của em.'
      });
    }

    const [questions, answers, chats] = await Promise.all([
      Question.getQuestionsByIds(session.question_ids),
      PracticeSession.listAnswers(session.id),
      PracticeSession.listChats(session.id)
    ]);

    res.render('student/session-review', {
      title: `Xem lại: ${session.title}`,
      session,
      questions,
      answers,
      chats
    });
  } catch (error) {
    next(error);
  }
}

async function finishSession(req, res, next) {
  try {
    const session = await PracticeSession.completeSession(req.auth.id, req.params.id);
    if (!session) {
      return res.status(404).json({
        ok: false,
        message: 'Không tìm thấy lần làm bài cần kết thúc.'
      });
    }
    return res.json({
      ok: true,
      redirectUrl: `/student/sessions/${session.id}`
    });
  } catch (error) {
    next(error);
  }
}

function canAccessLesson(student, lessonItem) {
  return Boolean(
    lessonItem
    && isSupportedGrade(lessonItem.grade)
    && Number(lessonItem.grade) === Number(student?.current_grade)
  );
}

function answersMatch(question, selectedAnswer) {
  const expected = String(question?.correct_answer || '').trim();
  const actual = String(selectedAnswer || '').trim();
  if (question?.question_type === 'FILL_IN_THE_BLANK') {
    return normalizeFreeTextAnswer(actual) === normalizeFreeTextAnswer(expected);
  }
  return actual === expected;
}

function normalizeFreeTextAnswer(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/,/g, '.');
}

function isAIEnabledForGrade(grade, settings) {
  const enabledGrades = String(settings.ai_enabled_grades || '3,4,5')
    .split(/[,.\s]+/)
    .map(Number)
    .filter((item) => Number.isInteger(item));
  return (enabledGrades.length > 0 ? enabledGrades : [3, 4, 5]).includes(Number(grade));
}

function modelForProvider(settings) {
  if (settings.ai_provider === 'gemini') return settings.gemini_model;
  if (settings.ai_provider === 'gemini_cli') return settings.gemini_cli_model;
  if (settings.ai_provider === 'nvidia') return settings.nvidia_nim_model;
  if (settings.ai_provider === 'openrouter') return settings.openrouter_model;
  if (settings.ai_provider === 'openai') return settings.openai_model;
  return 'mock';
}

function buildLegacyAttemptRows(attempts = []) {
  return attempts
    .filter((attempt) => !attempt.practice_session_id)
    .map((attempt) => ({
      id: `legacy-${attempt.id}`,
      title: attempt.lesson_name || 'Lượt luyện tập',
      session_mode: 'LEGACY',
      status: 'COMPLETED',
      answered_count: 1,
      correct_count: Number(attempt.is_correct) === 1 || attempt.is_correct === true ? 1 : 0,
      chat_count: 0,
      current_index: 1,
      question_count: 1,
      started_at: attempt.created_at,
      legacyAttempt: attempt
    }));
}

async function submitAnswer(req, res, next) {
  try {
    const student = req.auth;
    const questionItem = await Question.getQuestionById(req.params.questionId);

    if (!questionItem) {
      return res.status(404).json({
        ok: false,
        message: 'Không tìm thấy câu hỏi.'
      });
    }

    const selectedAnswer = String(req.body.selectedAnswer || '').trim();
    if (!selectedAnswer) {
      return res.status(400).json({
        ok: false,
        message: 'Vui lòng chọn một đáp án trước khi nộp.'
      });
    }

    const isCorrect = answersMatch(questionItem, selectedAnswer);
    const misconception = isCorrect || questionItem.question_type === 'FILL_IN_THE_BLANK'
      ? null
      : await Question.getMisconception(questionItem.id, selectedAnswer);

    await Question.recordAnswer({
      studentId: student.id,
      practiceSessionId: Number(req.body.practiceSessionId || 0) || null,
      questionId: questionItem.id,
      selectedAnswer,
      isCorrect,
      misconceptionId: misconception?.id || null,
      timeSpentSeconds: Number(req.body.timeSpentSeconds || 0) || null
    });

    const practiceSessionId = Number(req.body.practiceSessionId || 0) || null;
    const questionIndex = Number(req.body.questionIndex || 0);
    if (practiceSessionId) {
      await PracticeSession.advanceSession(practiceSessionId, questionIndex + 1);
    }

    return res.json({
      ok: true,
      isCorrect,
      correctAnswer: questionItem.correct_answer,
      explanation: questionItem.explanation,
      misconception,
      nextIndex: questionIndex + 1,
      message: isCorrect
        ? 'Chính xác. Em đã xử lý đúng câu hỏi này.'
        : 'Chưa đúng. Hãy xem lỗi sai và lời giải để sửa lại cách làm.'
    });
  } catch (error) {
    next(error);
  }
}

async function theoryHelp(req, res, next) {
  try {
    const lessonItem = await Curriculum.getLessonById(req.body.lessonId);
    if (!lessonItem) {
      setFlash(req, 'danger', 'Không tìm thấy bài học cần giải thích.');
      return res.redirect('/student/dashboard');
    }

    if (!canAccessLesson(req.auth, lessonItem)) {
      return res.status(403).json({
        ok: false,
        message: 'Bài học này không thuộc khối học hiện tại của em.'
      });
    }

    const settings = await SystemSetting.getSettings();
    if (!isAIEnabledForGrade(req.auth.current_grade, settings)) {
      await AIConversationLog.logAIInteraction({
        studentId: req.auth.id,
        sessionType: 'THEORY_EXPLAIN',
        referenceId: lessonItem.id,
        lessonId: lessonItem.id,
        blockedReason: 'grade_not_enabled',
        chatHistory: [{ role: 'student', text: req.body.question || 'Yêu cầu giải thích lý thuyết' }]
      });
      return res.status(403).json({
        ok: false,
        message: 'Tính năng gợi ý thêm hiện chỉ bật cho một số khối lớp. Em hãy đọc thẻ lý thuyết và ví dụ trước nhé.'
      });
    }

    const cardIndex = Number(req.body.cardIndex || 0);
    const card = lessonItem.theory_cards[cardIndex];
    const reply = await SocraticAIService.explainTheory({
      grade: req.auth.current_grade,
      lesson: lessonItem,
      card,
      question: req.body.question || ''
    });

    await AIConversationLog.logAIInteraction({
      studentId: req.auth.id,
      sessionType: 'THEORY_EXPLAIN',
      referenceId: lessonItem.id,
      lessonId: lessonItem.id,
      provider: settings.ai_provider,
      model: modelForProvider(settings),
      isFallback: String(settings.ai_automation_enabled || 'true') === 'false',
      chatHistory: [
        { role: 'student', text: req.body.question || 'Yêu cầu giải thích lý thuyết' },
        { role: 'ai', text: reply }
      ]
    });

    return res.json({ ok: true, reply });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  dashboard,
  lesson,
  practice,
  reviewLesson,
  history,
  account,
  updatePassword,
  exams,
  startExam,
  sessionPractice,
  reviewSession,
  finishSession,
  submitAnswer,
  theoryHelp
};
