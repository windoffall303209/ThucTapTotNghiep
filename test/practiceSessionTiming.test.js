// B? ki?m th? practice session timing.test x?c minh h?nh vi v? c?c ?i?u ki?n bi?n quan tr?ng c?a h? th?ng.
const test = require('node:test');
const assert = require('node:assert/strict');

const PracticeSession = require('../models/PracticeSession');

// H?m session d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function session(questionCount, startedAt, mode = 'COMPREHENSIVE', timing = {}) {
  return {
    question_count: questionCount,
    session_mode: mode,
    started_at: new Date(startedAt),
    ...timing
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

test('phiên dùng thời lượng và hạn cuối đã lưu thay vì cấu hình mặc định hiện tại', () => {
  const startedAt = Date.UTC(2026, 6, 30, 8, 0, 0);
  const expiresAt = startedAt + 45 * 60 * 1000;
  const timing = PracticeSession.getSessionTiming(
    session(15, startedAt, 'COMPREHENSIVE', {
      duration_seconds: 45 * 60,
      expires_at: new Date(expiresAt)
    }),
    startedAt + 5 * 60 * 1000
  );

  assert.equal(timing.durationSeconds, 45 * 60);
  assert.equal(timing.deadlineAtMs, expiresAt);
  assert.equal(timing.remainingSeconds, 40 * 60);
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
