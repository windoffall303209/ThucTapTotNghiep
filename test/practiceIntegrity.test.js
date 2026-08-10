// B? ki?m th? practice integrity.test x?c minh h?nh vi v? c?c ?i?u ki?n bi?n quan tr?ng c?a h? th?ng.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const db = require('../config/db');
const PracticeSession = require('../models/PracticeSession');
const PracticeSubmissionService = require('../services/PracticeSubmissionService');
const AIQuotaService = require('../services/AIQuotaService');
const SystemSetting = require('../models/SystemSetting');
const {
  answersMatch,
  normalizeSubmittedAnswer,
  normalizeTimeSpentSeconds
} = require('../utils/answerValidation');
const {
  normalizeMessage,
  parsePositiveInteger,
  quotaOutcomeResponse,
  verifiedLogContext
} = require('../controllers/ApiController');

// H?m snapshot d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function snapshot(overrides = {}) {
  return PracticeSession.createQuestionSnapshot({
    id: 99,
    lesson_id: 7,
    lesson_name: 'Phép cộng',
    grade: 3,
    question_type: 'MULTIPLE_CHOICE',
    difficulty: 'EASY',
    content: { text: '1 + 1 bằng mấy?', images: [] },
    choices: [
      { key: 'A', text: '2', images: [] },
      { key: 'B', text: '3', images: [] }
    ],
    correct_answer: 'A',
    explanation: { text: 'Một cộng một bằng hai.', images: [] },
    misconceptions: [{
      id: 12,
      distractor_key: 'B',
      misconception_type: 'CALCULATION',
      explanation: 'Em đã đếm thừa một đơn vị.',
      corrective_instruction: 'Đếm lại từ một.'
    }],
    ...overrides
  });
}

test('snapshot giữ nguyên đáp án, lời giải và lỗi sai của thời điểm tạo phiên', () => {
  const value = snapshot();
  assert.equal(value.snapshot_version, 1);
  assert.equal(value.correct_answer, 'A');
  assert.equal(value.explanation.text, 'Một cộng một bằng hai.');
  assert.equal(value.misconceptions[0].distractor_key, 'B');
  assert.equal(
    PracticeSubmissionService.findSnapshotMisconception(value, 'B').id,
    12
  );
});

test('chuẩn hóa đáp án và thời gian không cho dữ liệu vô hạn hoặc âm', () => {
  assert.equal(answersMatch(snapshot(), 'A'), true);
  assert.equal(
    answersMatch(snapshot({
      question_type: 'FILL_IN_THE_BLANK',
      correct_answer: '1,5'
    }), ' 1.5 '),
    true
  );
  assert.equal(normalizeSubmittedAnswer(''), null);
  assert.equal(normalizeSubmittedAnswer('x'.repeat(51)), null);
  assert.equal(normalizeSubmittedAnswer(' A '), 'A');
  assert.equal(normalizeTimeSpentSeconds(-1), null);
  assert.equal(normalizeTimeSpentSeconds('not-a-number'), null);
  assert.equal(normalizeTimeSpentSeconds(999999), 86400);
});

test('nộp đáp án được chấm bằng snapshot và ghi trong một transaction', async () => {
  const originalTransaction = db.transaction;
  const statements = [];
  const frozenQuestion = snapshot();
  db.transaction = async (callback) => callback({
    execute: async (sql, params) => {
      statements.push({ sql, params });
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (sql.includes('FROM PracticeSessions ps')) {
        return [[{
          id: 123,
          student_id: 5,
          session_mode: 'REVIEW',
          question_ids: JSON.stringify([99]),
          status: 'IN_PROGRESS',
          server_now_ms: Date.now()
        }]];
      }
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (sql.includes('FROM PracticeSessionQuestions')) {
        return [[{ snapshot: JSON.stringify(frozenQuestion) }]];
      }
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (sql.includes('FROM StudentLogs')) return [[]];
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (sql.includes('INSERT INTO StudentLogs')) return [{ insertId: 456 }];
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (sql.includes('UPDATE PracticeSessions ps')) return [{ affectedRows: 1 }];
      throw new Error(`Unexpected SQL in test: ${sql}`);
    }
  });

  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    const result = await PracticeSubmissionService.submitAnswer({
      studentId: 5,
      sessionId: 123,
      questionId: 99,
      selectedAnswer: 'B',
      timeSpentSeconds: 9
    });
    assert.equal(result.outcome, 'RECORDED');
    assert.equal(result.answer.is_correct, 0);
    assert.equal(result.misconception.id, 12);
    assert.equal(
      statements.some(({ sql }) => /QuestionBank|CommonMisconceptions/.test(sql)),
      false
    );
    assert.match(statements[0].sql, /FOR UPDATE/);
  } finally {
    db.transaction = originalTransaction;
  }
});

test('nộp lặp giữ nguyên đáp án lần đầu, không ghi thêm log', async () => {
  const originalTransaction = db.transaction;
  let insertCount = 0;
  db.transaction = async (callback) => callback({
    execute: async (sql) => {
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (sql.includes('FROM PracticeSessions ps')) {
        return [[{
          id: 123,
          student_id: 5,
          session_mode: 'REVIEW',
          question_ids: JSON.stringify([99]),
          status: 'IN_PROGRESS',
          server_now_ms: Date.now()
        }]];
      }
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (sql.includes('FROM PracticeSessionQuestions')) {
        return [[{ snapshot: JSON.stringify(snapshot()) }]];
      }
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (sql.includes('FROM StudentLogs')) {
        return [[{
          id: 1,
          question_id: 99,
          selected_answer: 'A',
          is_correct: 1
        }]];
      }
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (sql.includes('INSERT INTO StudentLogs')) insertCount += 1;
      return [{ affectedRows: 1 }];
    }
  });

  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    const result = await PracticeSubmissionService.submitAnswer({
      studentId: 5,
      sessionId: 123,
      questionId: 99,
      selectedAnswer: 'B',
      timeSpentSeconds: 3
    });
    assert.equal(result.outcome, 'ALREADY_RECORDED');
    assert.equal(result.answer.selected_answer, 'A');
    assert.equal(result.answer.is_correct, 1);
    assert.equal(insertCount, 0);
  } finally {
    db.transaction = originalTransaction;
  }
});

test('ngữ cảnh AI bắt buộc ID dương, giới hạn nội dung và trả mã quota rõ ràng', () => {
  assert.equal(parsePositiveInteger('12'), 12);
  assert.equal(parsePositiveInteger('1.5'), null);
  assert.equal(parsePositiveInteger('-1'), null);
  assert.equal(normalizeMessage(' x '), 'x');
  assert.equal(normalizeMessage('x'.repeat(1001)), null);
  assert.equal(quotaOutcomeResponse('DAILY_QUOTA_EXCEEDED', 3).status, 429);
  assert.equal(quotaOutcomeResponse('SESSION_EXPIRED', 3).body.redirectUrl, '/student/sessions/3');
  assert.deepEqual(verifiedLogContext('SESSION_NOT_FOUND'), {
    attachSession: false,
    attachQuestion: false
  });
  assert.deepEqual(verifiedLogContext('ANSWER_REQUIRED'), {
    attachSession: true,
    attachQuestion: true
  });
});

test('quota AI dùng mặc định an toàn khi cấu hình cũ bị lỗi', () => {
  assert.equal(AIQuotaService.normalizeLimit('5', 2, 20), 5);
  assert.equal(AIQuotaService.normalizeLimit('0', 2, 20), 2);
  assert.equal(AIQuotaService.normalizeLimit('999', 2, 20), 2);
  assert.equal(AIQuotaService.limitReached(2, 2), true);
});

test('admin không thể lưu quota, timeout, provider hoặc khối lớp sai', () => {
  assert.equal(SystemSetting.validateSettingValue('ai_enabled_grades', '5,3,3'), '3,5');
  assert.equal(SystemSetting.validateSettingValue('ai_max_hints_per_question', '4'), '4');
  assert.throws(
    () => SystemSetting.validateSettingValue('ai_max_requests_per_student_per_day', '0'),
    { code: 'INVALID_SYSTEM_SETTING' }
  );
  assert.throws(
    () => SystemSetting.validateSettingValue('ai_provider', 'http://localhost'),
    { code: 'INVALID_SYSTEM_SETTING' }
  );
});

test('schema mới bảo vệ snapshot, soft-delete, submit trùng và quota bền vững', () => {
  const schema = fs.readFileSync(
    path.join(__dirname, '..', 'database', 'database_schema.sql'),
    'utf8'
  );
  assert.match(schema, /CREATE TABLE PracticeSessionQuestions/);
  assert.match(schema, /UNIQUE KEY uq_logs_session_question\s*\(practice_session_id, question_id\)/);
  assert.match(schema, /REFERENCES PracticeSessionQuestions\(practice_session_id, question_id\)/);
  assert.match(schema, /is_active TINYINT\(1\) NOT NULL DEFAULT 1/);
  assert.match(schema, /ON DELETE RESTRICT/);
  assert.match(schema, /CREATE TABLE AIUsageDaily/);

  const apiController = fs.readFileSync(
    path.join(__dirname, '..', 'controllers', 'ApiController.js'),
    'utf8'
  );
  assert.match(apiController, /reservation\.answer\.selected_answer/);
  assert.doesNotMatch(apiController, /req\.body\.selectedAnswer/);
});
