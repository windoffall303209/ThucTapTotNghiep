// B? ?i?u khi?n api controller ti?p nh?n y?u c?u, ki?m tra d? li?u v? ?i?u ph?i ph?n h?i cho ng??i d?ng.
const PracticeSession = require('../models/PracticeSession');
const SocraticAIService = require('../services/SocraticAIService');
const SystemSetting = require('../models/SystemSetting');
const AIConversationLog = require('../models/AIConversationLog');
const AIQuotaService = require('../services/AIQuotaService');
const { findSnapshotMisconception } = require('../services/PracticeSubmissionService');
const { isAIEnabledForGrade } = require('../utils/aiPolicy');

const MAX_STUDENT_MESSAGE_LENGTH = 1000;

// H?m exerciseHelp d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function exerciseHelp(req, res, next) {
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    const practiceSessionId = parsePositiveInteger(req.body.practiceSessionId);
    const questionId = parsePositiveInteger(req.body.questionId);
    const studentMessage = normalizeMessage(req.body.message);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!practiceSessionId || !questionId) {
      return res.status(400).json({
        ok: false,
        code: 'INVALID_AI_CONTEXT',
        message: 'Cần một phiên và câu hỏi hợp lệ để mở gợi ý.'
      });
    }
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (studentMessage === null) {
      return res.status(400).json({
        ok: false,
        code: 'MESSAGE_TOO_LONG',
        message: `Câu hỏi gửi AI không được vượt quá ${MAX_STUDENT_MESSAGE_LENGTH} ký tự.`
      });
    }

    const settings = await SystemSetting.getSettings();
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
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
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
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

    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
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

// H?m parsePositiveInteger d?ng ?? ph?n t?ch ??u v?o th?nh c?u tr?c c? th? s? d?ng; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function parsePositiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

// H?m normalizeMessage d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function normalizeMessage(value) {
  const message = String(value || '').trim();
  return message.length <= MAX_STUDENT_MESSAGE_LENGTH ? message : null;
}

// H?m quotaOutcomeResponse d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
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

// H?m verifiedLogContext d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function verifiedLogContext(outcome) {
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (['ANSWER_REQUIRED', 'QUESTION_QUOTA_EXCEEDED', 'SESSION_QUOTA_EXCEEDED'].includes(outcome)) {
    return { attachSession: true, attachQuestion: true };
  }
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (['SESSION_EXPIRED', 'SESSION_COMPLETED', 'QUESTION_NOT_IN_SESSION'].includes(outcome)) {
    return { attachSession: true, attachQuestion: false };
  }
  return { attachSession: false, attachQuestion: false };
}

// H?m logBlockedRequest d?ng ?? x? l? y?u c?u, ?i?u ph?i c?c b??c nghi?p v? v? ph?n h?i l?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
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
