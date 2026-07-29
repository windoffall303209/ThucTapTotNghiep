const test = require('node:test');
const assert = require('node:assert/strict');

const PracticeSession = require('../models/PracticeSession');

function session(questionCount, startedAt, mode = 'COMPREHENSIVE') {
  return {
    question_count: questionCount,
    session_mode: mode,
    started_at: new Date(startedAt)
  };
}

test('thời lượng đề 5, 15 và 20 câu đúng theo cấu hình', () => {
  assert.equal(PracticeSession.DURATION_SECONDS_BY_QUESTION_COUNT[5], 10 * 60);
  assert.equal(PracticeSession.DURATION_SECONDS_BY_QUESTION_COUNT[15], 30 * 60);
  assert.equal(PracticeSession.DURATION_SECONDS_BY_QUESTION_COUNT[20], 60 * 60);
});

test('thời gian còn lại được tính từ lúc tạo phiên nên tải lại không đặt lại đồng hồ', () => {
  const startedAt = Date.UTC(2026, 6, 30, 8, 0, 0);
  const timing = PracticeSession.getSessionTiming(
    session(15, startedAt),
    startedAt + 12 * 60 * 1000
  );

  assert.equal(timing.enabled, true);
  assert.equal(timing.durationSeconds, 30 * 60);
  assert.equal(timing.remainingSeconds, 18 * 60);
  assert.equal(timing.deadlineAtMs, startedAt + 30 * 60 * 1000);
  assert.equal(timing.isExpired, false);
});

test('phiên được xác định hết hạn đúng tại thời điểm kết thúc', () => {
  const startedAt = Date.UTC(2026, 6, 30, 8, 0, 0);
  const timing = PracticeSession.getSessionTiming(
    session(5, startedAt, 'LESSON'),
    startedAt + 10 * 60 * 1000
  );

  assert.equal(timing.remainingSeconds, 0);
  assert.equal(timing.isExpired, true);
});

test('ôn nhanh và số câu không có cấu hình không bị áp thời gian ngoài yêu cầu', () => {
  const startedAt = Date.UTC(2026, 6, 30, 8, 0, 0);

  assert.equal(
    PracticeSession.getSessionTiming(session(5, startedAt, 'REVIEW'), startedAt).enabled,
    false
  );
  assert.equal(
    PracticeSession.getSessionTiming(session(8, startedAt, 'LESSON'), startedAt).enabled,
    false
  );
});
