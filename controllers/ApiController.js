const Question = require('../models/Question');
const PracticeSession = require('../models/PracticeSession');
const SocraticAIService = require('../services/SocraticAIService');
const SystemSetting = require('../models/SystemSetting');
const AIConversationLog = require('../models/AIConversationLog');
const { isAIEnabledForGrade } = require('../utils/aiPolicy');

async function exerciseHelp(req, res, next) {
  try {
    const question = await Question.getQuestionById(req.body.questionId);
    if (!question) {
      return res.status(404).json({
        ok: false,
        message: 'Không tìm thấy câu hỏi cần hỗ trợ.'
      });
    }

    // Xác minh phiên trước khi dùng: id do client gửi, không kiểm thì lời chat
    // có thể bị ghi vào phiên của học sinh khác (hiện lên trang xem lại của em
    // đó) và quota gợi ý bị tính trên phiên không thuộc về người hỏi.
    const practiceSessionId = Number(req.body.practiceSessionId || 0) || null;
    if (practiceSessionId) {
      const session = await PracticeSession.getSessionById(req.auth.id, practiceSessionId);
      if (!session) {
        return res.status(403).json({
          ok: false,
          message: 'Lần làm bài này không thuộc tài khoản của em nên chưa gửi được câu hỏi.'
        });
      }
    }
    const selectedAnswer = String(req.body.selectedAnswer || '').trim();
    const studentMessage = String(req.body.message || '').trim();
    const settings = await SystemSetting.getSettings();
    const [sessionChats, sessionAnswers] = practiceSessionId
      ? await Promise.all([
        PracticeSession.listChats(practiceSessionId),
        PracticeSession.listAnswers(practiceSessionId)
      ])
      : [[], []];
    const chatHistory = sessionChats.filter((chat) => Number(chat.question_id || 0) === Number(question.id));
    const hasAnsweredQuestion = practiceSessionId
      ? sessionAnswers.some((answer) => Number(answer.question_id) === Number(question.id))
      : Boolean(selectedAnswer);
    const policyBlock = evaluateAIPolicy({
      grade: req.auth?.current_grade,
      settings,
      hasAnsweredQuestion,
      chatHistory,
      sessionChats
    });

    if (policyBlock) {
      await AIConversationLog.logAIInteraction({
        studentId: req.auth.id,
        sessionType: 'EXERCISE_HELP',
        referenceId: question.id,
        practiceSessionId,
        questionId: question.id,
        blockedReason: policyBlock.reason,
        chatHistory: [{ role: 'student', text: studentMessage || 'Yêu cầu gợi ý thêm' }]
      });
      return res.status(403).json({ ok: false, message: policyBlock.message });
    }

    const misconception = selectedAnswer
      ? await Question.getMisconception(question.id, selectedAnswer)
      : null;

    if (practiceSessionId && studentMessage) {
      await PracticeSession.saveChat({
        sessionId: practiceSessionId,
        questionId: question.id,
        role: 'student',
        message: studentMessage
      });
    }

    const aiResult = await SocraticAIService.explainExercise({
      grade: req.auth?.current_grade || 4,
      question,
      selectedAnswer,
      misconception,
      studentMessage,
      chatHistory
    });
    const reply = aiResult.reply;

    if (practiceSessionId) {
      await PracticeSession.saveChat({
        sessionId: practiceSessionId,
        questionId: question.id,
        role: 'ai',
        message: reply
      });
    }

    await AIConversationLog.logAIInteraction({
      studentId: req.auth.id,
      sessionType: 'EXERCISE_HELP',
      referenceId: question.id,
      practiceSessionId,
      questionId: question.id,
      // Ghi provider và model THỰC TẾ đã sinh ra câu trả lời, không phải giá trị
      // admin đang cấu hình, vì hai thứ này lệch nhau khi phải rơi sang dự phòng.
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

function evaluateAIPolicy({ grade, settings, hasAnsweredQuestion, chatHistory, sessionChats }) {
  if (!isAIEnabledForGrade(grade, settings)) {
    return {
      reason: 'grade_not_enabled',
      message: 'Tính năng gợi ý thêm hiện chỉ bật cho một số khối lớp. Em hãy xem lời giải có sẵn trước nhé.'
    };
  }

  if (String(settings.ai_require_answer_before_help || 'true') !== 'false' && !hasAnsweredQuestion) {
    return {
      reason: 'answer_required',
      message: 'Em hãy thử chọn và nộp đáp án trước, sau đó hệ thống mới mở phần gợi ý thêm.'
    };
  }

  const maxPerQuestion = Math.max(Number(settings.ai_max_hints_per_question || 2), 0);
  const maxPerSession = Math.max(Number(settings.ai_max_hints_per_session || 8), 0);
  const aiReplyCountForQuestion = chatHistory.filter((chat) => chat.role === 'ai').length;
  const aiReplyCountForSession = (sessionChats || []).filter((chat) => chat.role === 'ai').length;

  if (maxPerQuestion > 0 && aiReplyCountForQuestion >= maxPerQuestion) {
    return {
      reason: 'question_quota_exceeded',
      message: 'Câu này đã đủ số lần gợi ý thêm. Em hãy đọc lại lời giải và thử câu tiếp theo nhé.'
    };
  }

  if (maxPerSession > 0 && aiReplyCountForSession >= maxPerSession) {
    return {
      reason: 'session_quota_exceeded',
      message: 'Lần luyện tập này đã dùng đủ số lượt gợi ý thêm. Em hãy tiếp tục bằng lời giải có sẵn nhé.'
    };
  }

  return null;
}

module.exports = { exerciseHelp };
