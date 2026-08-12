// Bộ điều khiển student controller tiếp nhận yêu cầu, kiểm tra dữ liệu và điều phối phản hồi cho người dùng.
const bcrypt = require('bcryptjs');
const Curriculum = require('../models/Curriculum');
const Question = require('../models/Question');
const PracticeSession = require('../models/PracticeSession');
const Student = require('../models/Student');
const SocraticAIService = require('../services/SocraticAIService');
const SystemSetting = require('../models/SystemSetting');
const AIConversationLog = require('../models/AIConversationLog');
const PracticeSubmissionService = require('../services/PracticeSubmissionService');
const AIQuotaService = require('../services/AIQuotaService');
const LearningMasteryService = require('../services/LearningMasteryService');
const PracticeGenerationService = require('../services/PracticeGenerationService');
const { setFlash } = require('../utils/flash');
const { isSupportedGrade } = require('../config/grades');
const { isAIEnabledForGrade } = require('../utils/aiPolicy');
const { validatePassword } = require('../utils/accountValidation');
const { clearAuthCookie } = require('../utils/authToken');
const { normalizeEmail, validateEmail } = require('../utils/emailValidation');
const AccountRecoveryService = require('../services/AccountRecoveryService');
const EmailService = require('../services/EmailService');
const {
  normalizeSubmittedAnswer,
  normalizeTimeSpentSeconds
} = require('../utils/answerValidation');
const {
  isAllowedValue,
  parseInteger,
  parsePositiveInteger
} = require('../utils/requestValidation');
const PRACTICE_LIMITS = [15, 20];
const THEORY_REVIEW_COUNT = 8;
const LESSON_PRACTICE_COUNT = 5;

// Hàm dashboard dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function dashboard(req, res, next) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  try {
    const student = req.auth;
    const [chapters, lessonProgress, recentAttempts] = await Promise.all([
      Curriculum.getCurriculumByGrade(student.current_grade),
      LearningMasteryService.getMasteryByGrade(student.id, student.current_grade),
      Curriculum.getRecentAttempts(student.id)
    ]);
    const progress = LearningMasteryService.buildGradeProgress(chapters, lessonProgress);
    const recommendation = LearningMasteryService.findWeakestLesson(chapters, lessonProgress);

    res.render('student/dashboard', {
      title: 'Bảng học tập',
      chapters,
      progress,
      recommendation,
      lessonProgress,
      recentAttempts,
      nextLesson: pickNextLesson(chapters, lessonProgress)
    });
  } catch (error) {
    next(error);
  }
}

// Hàm lesson dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function lesson(req, res, next) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  try {
    const lessonId = parsePositiveInteger(req.params.id);
    const lessonItem = lessonId ? await Curriculum.getLessonById(lessonId) : null;
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!lessonItem) {
      return res.status(404).render('error', {
        title: 'Không tìm thấy bài học',
        message: 'Bài học không tồn tại hoặc chưa được nhập vào hệ thống.'
      });
    }

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!canAccessLesson(req.auth, lessonItem)) {
      return res.status(403).render('error', {
        title: 'Không thuộc khối học hiện tại',
        message: 'Bài học này không thuộc khối học Tiểu học đang được hỗ trợ hoặc không đúng lớp của em.'
      });
    }

    const [reviewQuestions, settings, chapters] = await Promise.all([
      Question.getTheoryReviewQuestions(lessonItem.id, THEORY_REVIEW_COUNT),
      SystemSetting.getSettings(),
      Curriculum.getCurriculumByGrade(lessonItem.grade)
    ]);

    res.render('student/lesson', {
      title: lessonItem.lesson_name,
      lesson: lessonItem,
      nextLesson: findFollowingLesson(chapters, lessonItem.id),
      reviewQuestionCount: reviewQuestions.length,
      lessonPracticeMinutes: SystemSetting.getPracticeDurationMinutes(LESSON_PRACTICE_COUNT, settings),
      aiHelpEnabled: isAIEnabledForGrade(req.auth.current_grade, settings)
    });
  } catch (error) {
    next(error);
  }
}

// Hàm practice dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function practice(req, res, next) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  try {
    const student = req.auth;
    const lessonId = parsePositiveInteger(req.params.id);
    const lessonItem = lessonId ? await Curriculum.getLessonById(lessonId) : null;
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!lessonItem) {
      return res.status(404).render('error', {
        title: 'Không tìm thấy bài luyện tập',
        message: 'Bài luyện tập không tồn tại hoặc chưa được nhập vào hệ thống.'
      });
    }

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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
    const targetCount = Math.min(LESSON_PRACTICE_COUNT, candidates.length);

    let session = targetCount > 0
      ? await PracticeSession.getActiveLessonSession(student.id, lessonItem.id)
      : null;
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (session && PracticeSession.getSessionTiming(session).isExpired) {
      await PracticeSession.completeSession(student.id, session.id, 'EXPIRED');
      session = null;
    }
    let sessionQuestions = session
      ? await PracticeSession.getSessionQuestions(session)
      : [];

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (targetCount > 0 && (!session || sessionQuestions.length !== targetCount)) {
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (session) {
        await PracticeSession.completeSession(student.id, session.id, 'CONTENT_CHANGED');
      }
      const generated = await PracticeGenerationService.generateLessonSelection({
        studentId: student.id,
        grade: student.current_grade,
        lessonId: lessonItem.id,
        candidates,
        reviewQuestions,
        count: targetCount
      });
      session = await PracticeSession.createSession({
        studentId: student.id,
        lessonId: lessonItem.id,
        chapterId: lessonItem.chapter_id,
        mode: 'LESSON',
        title: `Luyện theo bài: ${lessonItem.lesson_name}`,
        questionIds: generated.questions.map((question) => question.id),
        selection: generated.selection
      });
      sessionQuestions = await PracticeSession.getSessionQuestions(session);
    }

    const [lessonAnswers, settings] = await Promise.all([
      session ? PracticeSession.listAnswers(session.id) : Promise.resolve([]),
      SystemSetting.getSettings()
    ]);
    res.render('student/practice', {
      title: `Luyện theo bài: ${lessonItem.lesson_name}`,
      lesson: lessonItem,
      questions: sanitizeQuestionsForClient(sessionQuestions),
      session,
      practiceTiming: PracticeSession.getSessionTiming(session),
      answeredResults: buildAnsweredResults(lessonAnswers, sessionQuestions),
      aiHelpEnabled: isAIEnabledForGrade(student.current_grade, settings)
    });
  } catch (error) {
    next(error);
  }
}

// Hàm reviewLesson dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function reviewLesson(req, res, next) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  try {
    const student = req.auth;
    const lessonId = parsePositiveInteger(req.params.id);
    const lessonItem = lessonId ? await Curriculum.getLessonById(lessonId) : null;
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!lessonItem) {
      return res.status(404).render('error', {
        title: 'Không tìm thấy bài ôn tập',
        message: 'Bài ôn tập không tồn tại hoặc chưa được nhập vào hệ thống.'
      });
    }

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!canAccessLesson(student, lessonItem)) {
      return res.status(403).render('error', {
        title: 'Không thuộc khối học hiện tại',
        message: 'Bài ôn tập này không thuộc lớp hiện tại của em.'
      });
    }

    const reviewQuestions = await Question.getTheoryReviewQuestions(
      lessonItem.id,
      THEORY_REVIEW_COUNT
    );
    const generated = PracticeGenerationService.generateReviewSelection({
      questions: reviewQuestions,
      lessonId: lessonItem.id,
      chapterId: lessonItem.chapter_id,
      count: THEORY_REVIEW_COUNT
    });
    const questions = generated.questions;
    let session = await PracticeSession.getActiveLessonSession(
      student.id,
      lessonItem.id,
      'REVIEW'
    );
    let sessionQuestions = session
      ? await PracticeSession.getSessionQuestions(session)
      : [];
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (
      !session
      || Number(session.question_count) !== questions.length
      || sessionQuestions.length !== questions.length
    ) {
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (session) {
        await PracticeSession.completeSession(student.id, session.id, 'CONTENT_CHANGED');
      }
      session = await PracticeSession.createSession({
        studentId: student.id,
        lessonId: lessonItem.id,
        chapterId: lessonItem.chapter_id,
        mode: 'REVIEW',
        title: `Ôn sau lý thuyết: ${lessonItem.lesson_name}`,
        questionIds: questions.map((question) => question.id),
        selection: generated.selection
      });
      sessionQuestions = await PracticeSession.getSessionQuestions(session);
    }

    const [reviewAnswers, settings] = await Promise.all([
      PracticeSession.listAnswers(session.id),
      SystemSetting.getSettings()
    ]);
    return res.render('student/practice', {
      title: session.title,
      lesson: lessonItem,
      questions: sanitizeQuestionsForClient(sessionQuestions),
      session,
      practiceTiming: PracticeSession.getSessionTiming(session),
      answeredResults: buildAnsweredResults(reviewAnswers, sessionQuestions),
      aiHelpEnabled: isAIEnabledForGrade(student.current_grade, settings)
    });
  } catch (error) {
    next(error);
  }
}

// Hàm history dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function history(req, res, next) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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

// Hàm account dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function account(req, res, next) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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

// Hàm updatePassword dùng để cập nhật trạng thái hoặc dữ liệu theo quy tắc nghiệp vụ; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function updatePassword(req, res, next) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  try {
    const student = await Student.findById(req.auth.id);
    const currentPassword = typeof req.body.current_password === 'string' ? req.body.current_password : '';
    const newPassword = typeof req.body.new_password === 'string' ? req.body.new_password : '';
    const confirmPassword = typeof req.body.confirm_password === 'string' ? req.body.confirm_password : '';

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!student) {
      setFlash(req, 'danger', 'Không tìm thấy tài khoản học sinh.');
      return res.redirect('/student/account');
    }

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!currentPassword || !newPassword || !confirmPassword) {
      setFlash(req, 'danger', 'Vui lòng nhập đầy đủ mật khẩu hiện tại và mật khẩu mới.');
      return res.redirect('/student/account');
    }
    if (Buffer.byteLength(currentPassword, 'utf8') > 72) {
      setFlash(req, 'danger', 'Mật khẩu hiện tại không hợp lệ.');
      return res.redirect('/student/account');
    }

    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, student.password_hash);
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!isCurrentPasswordValid) {
      setFlash(req, 'danger', 'Mật khẩu hiện tại không đúng.');
      return res.redirect('/student/account');
    }

    const passwordError = validatePassword(newPassword);
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (passwordError) {
      setFlash(req, 'danger', passwordError);
      return res.redirect('/student/account');
    }

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (newPassword !== confirmPassword) {
      setFlash(req, 'danger', 'Mật khẩu mới và xác nhận mật khẩu không khớp.');
      return res.redirect('/student/account');
    }

    await Student.updatePassword(req.auth.id, newPassword);
    clearAuthCookie(res);
    setFlash(req, 'success', 'Đã đổi mật khẩu. Em đăng nhập lại bằng mật khẩu mới nhé.');
    return res.redirect('/auth/student/login');
  } catch (error) {
    next(error);
  }
}

async function requestEmailVerification(req, res, next) {
  let pendingEmail = '';
  try {
    const student = await Student.findById(req.auth.id);
    const email = normalizeEmail(req.body.email);
    pendingEmail = email;
    const emailError = validateEmail(email);
    if (!student || emailError) {
      setFlash(req, 'danger', emailError || 'Không tìm thấy tài khoản học sinh.');
      return res.redirect('/student/account');
    }
    const existing = await Student.findByEmail(email);
    if (existing && Number(existing.id) !== Number(student.id)) {
      setFlash(req, 'danger', 'Email này đã được dùng cho một tài khoản khác.');
      return res.redirect('/student/account');
    }
    if (student.email_verified_at && normalizeEmail(student.email) === email) {
      setFlash(req, 'success', 'Email này đã được xác thực và đang dùng để khôi phục mật khẩu.');
      return res.redirect('/student/account');
    }
    await Student.setPendingEmail(student.id, email);
    const code = await AccountRecoveryService.issueCode({
      studentId: student.id,
      purpose: 'VERIFY_EMAIL',
      email
    });
    try {
      await EmailService.sendVerificationCode({ to: email, code, purpose: 'VERIFY_EMAIL' });
    } catch (error) {
      await AccountRecoveryService.invalidateActiveCodes({ studentId: student.id, purpose: 'VERIFY_EMAIL' });
      throw error;
    }
    req.session.pendingEmailVerification = email;
    setFlash(req, 'success', 'Mã xác thực 6 số đã được gửi. Mã có hiệu lực trong 10 phút.');
    return res.redirect('/student/account');
  } catch (error) {
    if ((error.code === 'EMAIL_NOT_CONFIGURED' || error.code === 'EMAIL_SEND_FAILED') && pendingEmail) {
      await Student.clearPendingEmail(req.auth.id, pendingEmail).catch(() => {});
    }
    if (error.code === 'OTP_COOLDOWN' || error.code === 'EMAIL_NOT_CONFIGURED' || error.code === 'EMAIL_SEND_FAILED') {
      setFlash(req, 'warning', error.message);
      return res.redirect('/student/account');
    }
    return next(error);
  }
}

async function verifyEmail(req, res, next) {
  try {
    const student = await Student.findById(req.auth.id);
    const email = normalizeEmail(student?.pending_email || req.session.pendingEmailVerification);
    const code = typeof req.body.verification_code === 'string' ? req.body.verification_code.trim() : '';
    if (!student || !email || !/^\d{6}$/.test(code)) {
      setFlash(req, 'danger', 'Mã xác thực phải gồm đúng 6 chữ số.');
      return res.redirect('/student/account');
    }
    const result = await AccountRecoveryService.verifyEmailWithCode({
      studentId: student.id,
      email,
      code
    });
    if (!result.ok) {
      setFlash(req, 'danger', 'Mã xác thực không đúng, đã hết hạn hoặc đã vượt quá số lần thử.');
      return res.redirect('/student/account');
    }
    delete req.session.pendingEmailVerification;
    setFlash(req, 'success', 'Email đã được xác minh và có thể dùng để lấy lại mật khẩu.');
    return res.redirect('/student/account');
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      setFlash(req, 'danger', 'Email này đã được dùng cho một tài khoản khác.');
      return res.redirect('/student/account');
    }
    if (error.code === 'PENDING_EMAIL_CHANGED') {
      setFlash(req, 'danger', 'Email chờ xác thực đã thay đổi. Vui lòng yêu cầu mã mới.');
      return res.redirect('/student/account');
    }
    return next(error);
  }
}

async function cancelEmailVerification(req, res, next) {
  try {
    const student = await Student.findById(req.auth.id);
    const pendingEmail = normalizeEmail(student?.pending_email);
    if (!student || !pendingEmail) {
      delete req.session.pendingEmailVerification;
      setFlash(req, 'warning', 'Không có email nào đang chờ xác thực.');
      return res.redirect('/student/account');
    }

    await AccountRecoveryService.invalidateActiveCodes({
      studentId: student.id,
      purpose: 'VERIFY_EMAIL'
    });
    await Student.clearPendingEmail(student.id, pendingEmail);
    delete req.session.pendingEmailVerification;
    setFlash(req, 'success', 'Đã hủy thay đổi email. Email đã xác thực trước đó vẫn được giữ nguyên.');
    return res.redirect('/student/account');
  } catch (error) {
    return next(error);
  }
}

// Hàm exams dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function exams(req, res, next) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  try {
    // Lọc "đang làm dở" ngay trong SQL. Lấy 20 phiên gần nhất rồi mới lọc thì
    // đề dang dở nào bị 20 phiên đã xong che mất sẽ không còn đường "Tiếp tục".
    const [sessions, chapters, settings] = await Promise.all([
      PracticeSession.listSessions(req.auth.id, 20, {
        status: 'IN_PROGRESS',
        modes: ['CHAPTER', 'COMPREHENSIVE']
      }),
      Curriculum.getCurriculumByGrade(req.auth.current_grade),
      SystemSetting.getSettings()
    ]);
    res.render('student/exams', {
      title: 'Luyện tập',
      limits: PRACTICE_LIMITS,
      chapters,
      sessions,
      practiceDurations: {
        5: SystemSetting.getPracticeDurationMinutes(5, settings),
        15: SystemSetting.getPracticeDurationMinutes(15, settings),
        20: SystemSetting.getPracticeDurationMinutes(20, settings)
      }
    });
  } catch (error) {
    next(error);
  }
}

// Hàm startExam dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function startExam(req, res, next) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  try {
    const grade = Number(req.auth.current_grade);
    const count = parseInteger(req.body.count, { min: 1, max: 100 });
    const requestedMode = typeof req.body.mode === 'string' ? req.body.mode.trim() : '';
    if (!PRACTICE_LIMITS.includes(count)) {
      setFlash(req, 'danger', 'Số câu luyện tập không hợp lệ.');
      return res.redirect('/student/exams');
    }
    if (!isAllowedValue(requestedMode, ['chapter', 'comprehensive'])) {
      setFlash(req, 'danger', 'Kiểu luyện tập không hợp lệ.');
      return res.redirect('/student/exams');
    }
    let candidates = [];
    let sessionData = {
      chapterId: null,
      semester: null,
      mode: 'COMPREHENSIVE',
      title: `Luyện tập tổng hợp cả năm · ${count} câu`
    };

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (requestedMode === 'chapter') {
      const chapterId = parsePositiveInteger(req.body.chapter_id);
      const chapter = chapterId ? await Curriculum.getChapterById(chapterId) : null;
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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
      const scope = typeof req.body.scope === 'string' ? req.body.scope.trim() : '';
      if (!isAllowedValue(scope, ['semester-1', 'semester-2', 'year'])) {
        setFlash(req, 'danger', 'Phạm vi luyện tập không hợp lệ.');
        return res.redirect('/student/exams');
      }
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

    const generated = await PracticeGenerationService.generateScopedSelection({
      studentId: req.auth.id,
      grade,
      chapterId: sessionData.chapterId,
      semester: sessionData.semester,
      mode: sessionData.mode,
      count,
      candidates
    });
    const questions = await Question.getQuestionsByIds(
      generated.questions.map((question) => question.id)
    );

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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
      questionIds: questions.map((question) => question.id),
      replaceActive: true,
      selection: generated.selection
    });

    return res.redirect(`/student/sessions/${session.id}/practice`);
  } catch (error) {
    next(error);
  }
}

// Hàm sessionPractice dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function sessionPractice(req, res, next) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  try {
    const sessionId = parsePositiveInteger(req.params.id);
    let session = sessionId ? await PracticeSession.getSessionById(req.auth.id, sessionId) : null;
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!session) {
      return res.status(404).render('error', {
        title: 'Không tìm thấy lần làm bài',
        message: 'Lần làm bài này không tồn tại hoặc không thuộc tài khoản của em.'
      });
    }

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (session.status === 'COMPLETED') {
      return res.redirect(`/student/sessions/${session.id}`);
    }

    const practiceTiming = PracticeSession.getSessionTiming(session);
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (practiceTiming.isExpired) {
      session = await PracticeSession.completeSession(req.auth.id, session.id, 'EXPIRED');
      setFlash(req, 'warning', 'Đã hết thời gian làm bài. Hệ thống đã tự động kết thúc và lưu các câu em đã nộp.', {
        modal: true
      });
      return res.redirect(`/student/sessions/${session.id}`);
    }

    const [questions, answers, settings] = await Promise.all([
      PracticeSession.getSessionQuestions(session),
      PracticeSession.listAnswers(session.id),
      SystemSetting.getSettings()
    ]);
    res.render('student/practice', {
      title: session.title,
      lesson: {
        id: session.lesson_id || '',
        lesson_name: session.title
      },
      questions: sanitizeQuestionsForClient(questions),
      session,
      practiceTiming,
      answeredResults: buildAnsweredResults(answers, questions),
      aiHelpEnabled: isAIEnabledForGrade(req.auth.current_grade, settings)
    });
  } catch (error) {
    next(error);
  }
}

// Hàm reviewSession dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function reviewSession(req, res, next) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  try {
    const sessionId = parsePositiveInteger(req.params.id);
    let session = sessionId ? await PracticeSession.getSessionById(req.auth.id, sessionId) : null;
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!session) {
      return res.status(404).render('error', {
        title: 'Không tìm thấy lịch sử',
        message: 'Lịch sử làm bài này không tồn tại hoặc không thuộc tài khoản của em.'
      });
    }

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (session.status === 'IN_PROGRESS' && PracticeSession.getSessionTiming(session).isExpired) {
      session = await PracticeSession.completeSession(req.auth.id, session.id, 'EXPIRED');
    }

    const [questions, answers, chats] = await Promise.all([
      PracticeSession.getSessionQuestions(session),
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

// Hàm finishSession dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function finishSession(req, res, next) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  try {
    const sessionId = parsePositiveInteger(req.params.id);
    if (!sessionId) {
      return res.status(400).json({
        ok: false,
        code: 'INVALID_SESSION_ID',
        message: 'Mã lần làm bài không hợp lệ.'
      });
    }
    const session = await PracticeSession.completeSession(
      req.auth.id,
      sessionId,
      'USER_FINISHED'
    );
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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

// Chọn sẵn một bài để học sinh vào luyện ngay mà không phải tự dò trong cây
// chương trình. Ưu tiên bài đang yếu, sau đó tới bài chưa học, cuối cùng mới
// quay lại bài đầu tiên của khối.
function pickNextLesson(chapters = [], lessonProgress = {}) {
  const allLessons = [];
  (chapters || []).forEach((chapter) => {
    (chapter.lessons || []).forEach((lesson) => {
      allLessons.push({
        id: lesson.id,
        lesson_name: lesson.lesson_name,
        chapter_name: chapter.chapter_name,
        status: (lessonProgress[lesson.id] || {}).status || 'not_started',
        weakness_score: Number((lessonProgress[lesson.id] || {}).weakness_score || 0),
        confidence_score: Number((lessonProgress[lesson.id] || {}).confidence_score || 0)
      });
    });
  });

  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (allLessons.length === 0) return null;

  const needsReview = allLessons
    .filter((lesson) => lesson.status === 'needs_review')
    .sort((left, right) => right.weakness_score - left.weakness_score)[0];
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (needsReview) return { ...needsReview, reason: 'needs_review' };

  const insufficientData = allLessons
    .filter((lesson) => lesson.status === 'insufficient_data')
    .sort((left, right) => right.confidence_score - left.confidence_score)[0];
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (insufficientData) return { ...insufficientData, reason: 'insufficient_data' };

  const notStarted = allLessons.find((lesson) => lesson.status === 'not_started');
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (notStarted) return { ...notStarted, reason: 'not_started' };

  return { ...allLessons[0], reason: 'all_done' };
}

// Hàm findFollowingLesson dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function findFollowingLesson(chapters = [], currentLessonId) {
  const lessons = (chapters || []).flatMap((chapter) =>
    (chapter.lessons || []).map((lesson) => ({
      ...lesson,
      chapter_name: chapter.chapter_name
    }))
  );
  const currentIndex = lessons.findIndex(
    (lesson) => Number(lesson.id) === Number(currentLessonId)
  );
  return currentIndex >= 0 ? lessons[currentIndex + 1] || null : null;
}

/**
 * Cắt câu hỏi về đúng phần client cần để HIỂN THỊ. Tuyệt đối không đưa
 * correct_answer, explanation hay misconceptions xuống trang làm bài: JSON này
 * nằm nguyên trong HTML nên học sinh chỉ cần View Source là đọc được hết đáp án
 * trước khi làm. Đáp án và lời giải chỉ trả về từ POST /questions/:id/answer
 * sau khi các em đã nộp câu đó.
 *
 * Dùng danh sách trắng thay vì xóa từng trường nhạy cảm, để trường mới thêm vào
 * QuestionBank sau này không tự động bị lộ.
 */
function sanitizeQuestionsForClient(questions = []) {
  return (questions || []).map((question) => ({
    id: question.id,
    question_type: question.question_type,
    difficulty: question.difficulty,
    layout_template: question.layout_template,
    content: question.content,
    choices: (question.choices || []).map((choice) => ({
      key: choice.key,
      text: choice.text,
      images: choice.images || []
    })),
    lesson_name: question.lesson_name || null
  }));
}

/**
 * Với câu ĐÃ trả lời thì gửi kèm đáp án đúng và lời giải, để lúc mở lại bài
 * đang làm dở client vẫn tô được nút đúng/sai và hiện lời giải như trước.
 * Câu chưa trả lời không có mặt ở đây nên không lộ gì.
 */
function buildAnsweredResults(answers = [], questions = []) {
  const questionById = new Map((questions || []).map((question) => [Number(question.id), question]));
  return (answers || []).reduce((result, answer) => {
    const questionId = Number(answer.question_id);
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!questionId) return result;
    const question = questionById.get(questionId);
    result[questionId] = {
      selectedAnswer: answer.selected_answer,
      isCorrect: Number(answer.is_correct) === 1 || answer.is_correct === true,
      correctAnswer: question ? question.correct_answer : null,
      explanation: question ? question.explanation : null
    };
    return result;
  }, {});
}

// Hàm canAccessLesson dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function canAccessLesson(student, lessonItem) {
  return Boolean(
    lessonItem
    && isSupportedGrade(lessonItem.grade)
    && Number(lessonItem.grade) === Number(student?.current_grade)
  );
}

// Hàm buildLegacyAttemptRows dùng để xây dựng kết quả từ các nguồn dữ liệu và quy tắc liên quan; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
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

// Hàm submitAnswer dùng để xử lý yêu cầu, điều phối các bước nghiệp vụ và phản hồi lỗi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function submitAnswer(req, res, next) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  try {
    const student = req.auth;
    const questionId = parsePositiveInteger(req.params.questionId);
    const practiceSessionId = parsePositiveInteger(req.body.practiceSessionId);
    const selectedAnswer = normalizeSubmittedAnswer(req.body.selectedAnswer);
    const questionIndex = parseInteger(req.body.questionIndex, { min: 0, max: 10_000 });
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!selectedAnswer) {
      return res.status(400).json({
        ok: false,
        code: 'INVALID_ANSWER',
        message: 'Đáp án phải có từ 1 đến 50 ký tự.'
      });
    }
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!questionId) {
      return res.status(400).json({
        ok: false,
        code: 'INVALID_QUESTION',
        message: 'Mã câu hỏi không hợp lệ.'
      });
    }
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!practiceSessionId) {
      return res.status(400).json({
        ok: false,
        code: 'PRACTICE_SESSION_REQUIRED',
        message: 'Cần một phiên làm bài hợp lệ để nộp đáp án.'
      });
    }
    if (questionIndex === null) {
      return res.status(400).json({
        ok: false,
        code: 'INVALID_QUESTION_INDEX',
        message: 'Vị trí câu hỏi không hợp lệ.'
      });
    }

    const result = await PracticeSubmissionService.submitAnswer({
      studentId: student.id,
      sessionId: practiceSessionId,
      questionId,
      selectedAnswer,
      timeSpentSeconds: normalizeTimeSpentSeconds(req.body.timeSpentSeconds)
    });
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (result.outcome === 'SESSION_NOT_FOUND') {
      return res.status(404).json({
        ok: false,
        code: result.outcome,
        message: 'Không tìm thấy lần làm bài này trong tài khoản của em.'
      });
    }
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (result.outcome === 'SESSION_EXPIRED') {
      return res.status(409).json({
        ok: false,
        code: 'PRACTICE_TIME_EXPIRED',
        message: 'Đã hết thời gian làm bài. Hệ thống đã tự động kết thúc bài của em.',
        redirectUrl: `/student/sessions/${practiceSessionId}`
      });
    }
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (result.outcome === 'SESSION_COMPLETED') {
      return res.status(409).json({
        ok: false,
        code: result.outcome,
        message: 'Bài làm này đã kết thúc, không nộp thêm được nữa.',
        redirectUrl: `/student/sessions/${practiceSessionId}`
      });
    }
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (result.outcome === 'QUESTION_NOT_IN_SESSION') {
      return res.status(400).json({
        ok: false,
        code: result.outcome,
        message: 'Câu hỏi này không thuộc bài em đang làm.'
      });
    }
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (result.outcome === 'QUESTION_UNAVAILABLE') {
      return res.status(409).json({
        ok: false,
        code: result.outcome,
        message: 'Nội dung phiên này không còn đầy đủ nên hệ thống đã đóng phiên để bảo vệ lịch sử.',
        redirectUrl: `/student/sessions/${practiceSessionId}`
      });
    }

    const safeQuestionIndex = Math.min(questionIndex, result.session.question_ids.length - 1);
    const isCorrect = Number(result.answer.is_correct) === 1;
    const alreadyRecorded = result.outcome === 'ALREADY_RECORDED';
    return res.json({
      ok: true,
      isCorrect,
      selectedAnswer: result.answer.selected_answer,
      correctAnswer: result.question.correct_answer,
      explanation: result.question.explanation,
      misconception: result.misconception,
      nextIndex: safeQuestionIndex + 1,
      message: alreadyRecorded
        ? 'Câu này em đã nộp rồi, kết quả được giữ theo lần nộp đầu tiên.'
        : isCorrect
        ? 'Chính xác. Em đã xử lý đúng câu hỏi này.'
        : 'Chưa đúng. Hãy xem lỗi sai và lời giải để sửa lại cách làm.'
    });
  } catch (error) {
    next(error);
  }
}

// Hàm theoryHelp dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function theoryHelp(req, res, next) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  try {
    const lessonId = parsePositiveInteger(req.body.lessonId);
    if (!lessonId) {
      return res.status(400).json({
        ok: false,
        code: 'INVALID_LESSON_ID',
        message: 'Mã bài học không hợp lệ.'
      });
    }
    const lessonItem = await Curriculum.getLessonById(lessonId);
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!lessonItem) {
      return res.status(404).json({
        ok: false,
        message: 'Không tìm thấy bài học cần giải thích.'
      });
    }

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!canAccessLesson(req.auth, lessonItem)) {
      return res.status(403).json({
        ok: false,
        message: 'Bài học này không thuộc khối học hiện tại của em.'
      });
    }

    const studentQuestion = req.body.question == null
      ? ''
      : typeof req.body.question === 'string'
        ? req.body.question.trim()
        : null;
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (studentQuestion === null || studentQuestion.length > 1000) {
      return res.status(400).json({
        ok: false,
        code: 'MESSAGE_TOO_LONG',
        message: 'Câu hỏi gửi AI không được vượt quá 1000 ký tự.'
      });
    }
    const cardIndex = parseInteger(req.body.cardIndex, { min: 0, max: 10_000 });
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (
      cardIndex === null
      || cardIndex >= lessonItem.theory_cards.length
    ) {
      return res.status(400).json({
        ok: false,
        code: 'INVALID_THEORY_CARD',
        message: 'Thẻ lý thuyết cần giải thích không hợp lệ.'
      });
    }

    const settings = await SystemSetting.getSettings();
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!isAIEnabledForGrade(req.auth.current_grade, settings)) {
      await AIConversationLog.logAIInteraction({
        studentId: req.auth.id,
        sessionType: 'THEORY_EXPLAIN',
        referenceId: lessonItem.id,
        lessonId: lessonItem.id,
        blockedReason: 'grade_not_enabled',
        chatHistory: [{ role: 'student', text: studentQuestion || 'Yêu cầu giải thích lý thuyết' }]
      });
      return res.status(403).json({
        ok: false,
        message: 'Tính năng gợi ý thêm hiện chỉ bật cho một số khối lớp. Em hãy đọc thẻ lý thuyết và ví dụ trước nhé.'
      });
    }

    const reservation = await AIQuotaService.reserveTheoryHelp({
      studentId: req.auth.id,
      dailyLimit: settings.ai_max_requests_per_student_per_day
    });
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (reservation.outcome !== 'RESERVED') {
      await AIConversationLog.logAIInteraction({
        studentId: req.auth.id,
        sessionType: 'THEORY_EXPLAIN',
        referenceId: lessonItem.id,
        lessonId: lessonItem.id,
        blockedReason: reservation.outcome.toLowerCase(),
        chatHistory: [{ role: 'student', text: studentQuestion || 'Yêu cầu giải thích lý thuyết' }]
      });
      return res.status(429).json({
        ok: false,
        code: reservation.outcome,
        message: 'Em đã dùng hết số lượt hỗ trợ AI trong hôm nay.'
      });
    }

    const card = lessonItem.theory_cards[cardIndex];
    const aiResult = await SocraticAIService.explainTheory({
      grade: req.auth.current_grade,
      lesson: lessonItem,
      card,
      question: studentQuestion
    });
    const reply = aiResult.reply;

    await AIConversationLog.logAIInteraction({
      studentId: req.auth.id,
      sessionType: 'THEORY_EXPLAIN',
      referenceId: lessonItem.id,
      lessonId: lessonItem.id,
      // Ghi provider và model THỰC TẾ đã trả lời, xem chú thích ở ApiController.
      provider: aiResult.provider,
      model: aiResult.model,
      isFallback: aiResult.isFallback,
      chatHistory: [
        { role: 'student', text: studentQuestion || 'Yêu cầu giải thích lý thuyết' },
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
  requestEmailVerification,
  verifyEmail,
  cancelEmailVerification,
  exams,
  startExam,
  sessionPractice,
  reviewSession,
  finishSession,
  submitAnswer,
  theoryHelp
};
