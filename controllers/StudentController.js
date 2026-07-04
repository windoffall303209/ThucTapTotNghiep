const bcrypt = require('bcryptjs');
const Curriculum = require('../models/Curriculum');
const Question = require('../models/Question');
const PracticeSession = require('../models/PracticeSession');
const Student = require('../models/Student');
const SocraticAIService = require('../services/SocraticAIService');
const { setFlash } = require('../utils/flash');

const EXAM_LIMITS = [10, 15, 20, 25, 30];

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

    res.render('student/lesson', {
      title: lessonItem.lesson_name,
      lesson: lessonItem
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

    const questions = await Question.getQuestionsByLesson(req.params.id);
    let session = await PracticeSession.getActiveLessonSession(student.id, lessonItem.id);
    if (!session) {
      session = await PracticeSession.createSession({
        studentId: student.id,
        lessonId: lessonItem.id,
        mode: 'LESSON',
        title: lessonItem.lesson_name,
        questionIds: questions.map((question) => question.id)
      });
    }
    const sessionQuestions = await Question.getQuestionsByIds(session.question_ids);
    res.render('student/practice', {
      title: `Luyện tập: ${lessonItem.lesson_name}`,
      lesson: lessonItem,
      questions: sessionQuestions.length > 0 ? sessionQuestions : questions,
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
    const sessions = await PracticeSession.listSessions(req.auth.id, 20);

    res.render('student/exams', {
      title: 'Luyện đề',
      limits: EXAM_LIMITS,
      sessions: sessions.filter((session) => session.session_mode === 'EXAM' && session.status === 'IN_PROGRESS')
    });
  } catch (error) {
    next(error);
  }
}

async function startExam(req, res, next) {
  try {
    const count = EXAM_LIMITS.includes(Number(req.body.count)) ? Number(req.body.count) : 10;
    const questions = await Question.getRandomQuestionsByGrade(req.auth.current_grade, count);

    if (questions.length === 0) {
      setFlash(req, 'danger', 'Ngân hàng câu hỏi chưa có dữ liệu phù hợp với khối hiện tại.');
      return res.redirect('/student/exams');
    }

    const session = await PracticeSession.createSession({
      studentId: req.auth.id,
      lessonId: null,
      mode: 'EXAM',
      title: `Đề ngẫu nhiên ${questions.length} câu`,
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

    const isCorrect = selectedAnswer === questionItem.correct_answer;
    const misconception = isCorrect
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

    const cardIndex = Number(req.body.cardIndex || 0);
    const card = lessonItem.theory_cards[cardIndex];
    const reply = await SocraticAIService.explainTheory({
      grade: req.auth.current_grade,
      lesson: lessonItem,
      card,
      question: req.body.question || ''
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
