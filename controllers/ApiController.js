const Question = require('../models/Question');
const PracticeSession = require('../models/PracticeSession');
const SocraticAIService = require('../services/SocraticAIService');

async function exerciseHelp(req, res, next) {
  try {
    const question = await Question.getQuestionById(req.body.questionId);
    if (!question) {
      return res.status(404).json({
        ok: false,
        message: 'Không tìm thấy câu hỏi cần hỗ trợ.'
      });
    }

    const misconception = req.body.selectedAnswer
      ? await Question.getMisconception(question.id, req.body.selectedAnswer)
      : null;

    const practiceSessionId = Number(req.body.practiceSessionId || 0) || null;
    const studentMessage = String(req.body.message || '').trim();
    const chatHistory = practiceSessionId
      ? (await PracticeSession.listChats(practiceSessionId))
        .filter((chat) => Number(chat.question_id || 0) === Number(question.id))
      : [];

    if (practiceSessionId && studentMessage) {
      await PracticeSession.saveChat({
        sessionId: practiceSessionId,
        questionId: question.id,
        role: 'student',
        message: studentMessage
      });
    }

    const reply = await SocraticAIService.explainExercise({
      grade: req.auth?.current_grade || 4,
      question,
      selectedAnswer: req.body.selectedAnswer,
      misconception,
      studentMessage,
      chatHistory
    });

    if (practiceSessionId) {
      await PracticeSession.saveChat({
        sessionId: practiceSessionId,
        questionId: question.id,
        role: 'ai',
        message: reply
      });
    }

    return res.json({ ok: true, reply });
  } catch (error) {
    next(error);
  }
}

module.exports = { exerciseHelp };
