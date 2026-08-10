// Bộ điều khiển api controller tiếp nhận yêu cầu, kiểm tra dữ liệu và điều phối phản hồi cho người dùng.
const PracticeSession = require('../models/PracticeSession');
const SocraticAIService = require('../services/SocraticAIService');
const SystemSetting = require('../models/SystemSetting');
const AIConversationLog = require('../models/AIConversationLog');
const AIQuotaService = require('../services/AIQuotaService');
const { findSnapshotMisconception } = require('../services/PracticeSubmissionService');
const { isAIEnabledForGrade } = require('../utils/aiPolicy');

const MAX_STUDENT_MESSAGE_LENGTH = 1000;

// Hàm exerciseHelp dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function exerciseHelp(req, res, next) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  try {
    const practiceSessionId = parsePositiveInteger(req.body.practiceSessionId);
    const questionId = parsePositiveInteger(req.body.questionId);
    const studentMessage = normalizeMessage(req.body.message);
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!practiceSessionId || !questionId) {
      return res.status(400).json({
        ok: false,
        code: 'INVALID_AI_CONTEXT',
        message: 'Cần một phiên và câu hỏi hợp lệ để mở gợi ý.'
      });
    }
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (studentMessage === null) {
      return res.status(400).json({
        ok: false,
        code: 'MESSAGE_TOO_LONG',
        message: `Câu hỏi gửi AI không được vượt quá ${MAX_STUDENT_MESSAGE_LENGTH} ký tự.`
      });
    }

    const settings = await SystemSetting.getSettings();
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!isAIEnabledForGrade(req.auth?.current_grade, settings)) {
      await logBlockedRequest({
        req,
        practiceSessionId,
        questionId,
        studentMessage,
        reason: 'grade_not_enabled',
        attachSession: false,
        attachQuestion: false
      });
      return res.status(403).json({
        ok: false,
        code: 'GRADE_NOT_ENABLED',
        message: 'Tính năng gợi ý thêm hiện chưa bật cho khối lớp của em.'
      });
    }

    const reservation = await AIQuotaService.reserveExerciseHelp({
      studentId: req.auth.id,
      sessionId: practiceSessionId,
      questionId,
      dailyLimit: settings.ai_max_requests_per_student_per_day,
      maxPerQuestion: settings.ai_max_hints_per_question,
      maxPerSession: settings.ai_max_hints_per_session
    });
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (reservation.outcome !== 'RESERVED') {
      const block = quotaOutcomeResponse(reservation.outcome, practiceSessionId);
      await logBlockedRequest({
        req,
        practiceSessionId,
        questionId,
        studentMessage,
        reason: reservation.outcome.toLowerCase(),
        ...verifiedLogContext(reservation.outcome)
      });
      return res.status(block.status).json(block.body);
    }

    const question = reservation.question;
    const selectedAnswer = String(reservation.answer.selected_answer || '');
    const misconception = findSnapshotMisconception(question, selectedAnswer);
    const sessionChats = await PracticeSession.listChats(practiceSessionId);
    const chatHistory = sessionChats.filter(
      (chat) => Number(chat.question_id) === Number(question.id)
    );

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (studentMessage) {
      await PracticeSession.saveChat({
        sessionId: practiceSessionId,
        questionId: question.id,
        role: 'student',
        message: studentMessage
      });
    }

    const aiResult = await SocraticAIService.explainExercise({
      grade: req.auth?.current_grade || question.grade || 4,
      question,
      selectedAnswer,
      misconception,
      studentMessage,
      chatHistory
    });
    const reply = aiResult.reply;

    await PracticeSession.saveChat({
      sessionId: practiceSessionId,
      questionId: question.id,
      role: 'ai',
      message: reply
    });
    await AIConversationLog.logAIInteraction({
      studentId: req.auth.id,
      sessionType: 'EXERCISE_HELP',
      referenceId: question.id,
      practiceSessionId,
      questionId: question.id,
      provider: aiResult.provider,
      model: aiResult.model,
      isFallback: aiResult.isFallback,
      chatHistory: [
        ...chatHistory.map((chat) => ({ role: chat.role, text: chat.message })),
        ...(studentMessage ? [{ role: 'student', text: studentMessage }] : []),
        { role: 'ai', text: reply }
      ]
    });

    return res.json({ ok: true, reply });
  } catch (error) {
    next(error);
  }
}

// Hàm parsePositiveInteger dùng để phân tích đầu vào thành cấu trúc có thể sử dụng; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function parsePositiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

// Hàm normalizeMessage dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function normalizeMessage(value) {
  const message = String(value || '').trim();
  return message.length <= MAX_STUDENT_MESSAGE_LENGTH ? message : null;
}

// Hàm quotaOutcomeResponse dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function quotaOutcomeResponse(outcome, sessionId) {
  const redirectUrl = `/student/sessions/${sessionId}`;
  const responses = {
    SESSION_NOT_FOUND: {
      status: 404,
      body: {
        ok: false,
        code: outcome,
        message: 'Không tìm thấy phiên làm bài này trong tài khoản của em.'
      }
    },
    SESSION_EXPIRED: {
      status: 409,
      body: {
        ok: false,
        code: outcome,
        message: 'Phiên đã hết thời gian nên không thể xin thêm gợi ý.',
        redirectUrl
      }
    },
    SESSION_COMPLETED: {
      status: 409,
      body: {
        ok: false,
        code: outcome,
        message: 'Phiên đã kết thúc nên không thể xin thêm gợi ý.',
        redirectUrl
      }
    },
    QUESTION_NOT_IN_SESSION: {
      status: 400,
      body: {
        ok: false,
        code: outcome,
        message: 'Câu hỏi này không thuộc phiên em đang làm.'
      }
    },
    ANSWER_REQUIRED: {
      status: 403,
      body: {
        ok: false,
        code: outcome,
        message: 'Em cần nộp đáp án cho đúng câu này trước khi mở gợi ý.'
      }
    },
    QUESTION_QUOTA_EXCEEDED: {
      status: 429,
      body: {
        ok: false,
        code: outcome,
        message: 'Câu này đã dùng hết số lượt gợi ý.'
      }
    },
    SESSION_QUOTA_EXCEEDED: {
      status: 429,
      body: {
        ok: false,
        code: outcome,
        message: 'Phiên này đã dùng hết số lượt gợi ý.'
      }
    },
    DAILY_QUOTA_EXCEEDED: {
      status: 429,
      body: {
        ok: false,
        code: outcome,
        message: 'Em đã dùng hết số lượt hỗ trợ AI trong hôm nay.'
      }
    }
  };
  return responses[outcome] || {
    status: 409,
    body: {
      ok: false,
      code: outcome || 'AI_HELP_UNAVAILABLE',
      message: 'Chưa thể mở gợi ý cho câu này.'
    }
  };
}

// Hàm verifiedLogContext dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function verifiedLogContext(outcome) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (['ANSWER_REQUIRED', 'QUESTION_QUOTA_EXCEEDED', 'SESSION_QUOTA_EXCEEDED'].includes(outcome)) {
    return { attachSession: true, attachQuestion: true };
  }
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (['SESSION_EXPIRED', 'SESSION_COMPLETED', 'QUESTION_NOT_IN_SESSION'].includes(outcome)) {
    return { attachSession: true, attachQuestion: false };
  }
  return { attachSession: false, attachQuestion: false };
}

// Hàm logBlockedRequest dùng để xử lý yêu cầu, điều phối các bước nghiệp vụ và phản hồi lỗi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function logBlockedRequest({
  req,
  practiceSessionId,
  questionId,
  studentMessage,
  reason,
  attachSession = false,
  attachQuestion = false
}) {
  await AIConversationLog.logAIInteraction({
    studentId: req.auth.id,
    sessionType: 'EXERCISE_HELP',
    referenceId: questionId,
    practiceSessionId: attachSession ? practiceSessionId : null,
    questionId: attachQuestion ? questionId : null,
    blockedReason: reason,
    chatHistory: [{
      role: 'student',
      text: studentMessage || 'Yêu cầu gợi ý thêm'
    }]
  });
}

module.exports = {
  MAX_STUDENT_MESSAGE_LENGTH,
  exerciseHelp,
  normalizeMessage,
  parsePositiveInteger,
  quotaOutcomeResponse,
  verifiedLogContext
};
