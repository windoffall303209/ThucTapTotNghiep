const assert = require('node:assert/strict');
const test = require('node:test');

const {
  SOURCE_PATTERN,
  hasUsage,
  parseArguments
} = require('../migrations/20260807_remove_unapproved_question_supplements');

test('migration chỉ nhắm đúng lô câu hỏi chưa được duyệt', () => {
  assert.equal(SOURCE_PATTERN, 'SUP-20260807-%');
});

test('migration mặc định chỉ kiểm kê và cần xác nhận database khi apply', () => {
  assert.deepEqual(parseArguments([]), { apply: false, confirmDatabase: '' });
  assert.deepEqual(parseArguments(['--apply', '--confirm-db=math_revision']), {
    apply: true,
    confirmDatabase: 'math_revision'
  });
  assert.throws(() => parseArguments(['--force']), /không hợp lệ/);
});

test('migration từ chối xóa nếu lô câu đã phát sinh lịch sử sử dụng', () => {
  assert.equal(hasUsage({ session_questions: 0, student_logs: 0, chats: 0, ai_logs: 0 }), false);
  assert.equal(hasUsage({ session_questions: 1, student_logs: 0, chats: 0, ai_logs: 0 }), true);
  assert.equal(hasUsage({ session_questions: 0, student_logs: 0, chats: 0, ai_logs: 1 }), true);
});
