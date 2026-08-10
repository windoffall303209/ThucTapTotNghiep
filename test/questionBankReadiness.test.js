// Bộ kiểm thử question bank readiness.test xác minh hành vi và các điều kiện biên quan trọng của hệ thống.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  summarizeDifficulty,
  evaluateScopeReadiness,
  evaluateLessonReadiness,
  summarizeReadiness
} = require('../utils/questionBankReadiness');

// Hàm candidates dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function candidates({ lessons = 10, easy = 9, medium = 8, hard = 3 } = {}) {
  let id = 1;
  return [
    ...Array.from({ length: easy }, (_, index) => ({
      id: id++, lesson_id: (index % lessons) + 1, difficulty: 'EASY'
    })),
    ...Array.from({ length: medium }, (_, index) => ({
      id: id++, lesson_id: (index % lessons) + 1, difficulty: 'MEDIUM'
    })),
    ...Array.from({ length: hard }, (_, index) => ({
      id: id++, lesson_id: (index % lessons) + 1, difficulty: index === 0 ? 'EXPERT' : 'HARD'
    }))
  ];
}

test('gộp EXPERT vào nhóm khó khi đánh giá nguồn tạo đề', () => {
  assert.deepEqual(summarizeDifficulty(candidates()), { EASY: 9, MEDIUM: 8, HARD: 3 });
});

test('phạm vi đủ 20 câu, đúng độ khó và đủ sức chứa được đánh dấu sẵn sàng', () => {
  const evenlyDistributed = candidates().map((question, index) => ({
    ...question,
    lesson_id: index + 1
  }));
  const readiness = evaluateScopeReadiness(evenlyDistributed, 20, 2);
  assert.equal(readiness.ready, true);
  assert.deepEqual(readiness.issues, []);
  assert.equal(readiness.lessonCapacity, 20);
});

test('báo riêng thiếu tổng số, thiếu câu khó và thiếu sức chứa giữa các bài', () => {
  const readiness = evaluateScopeReadiness(candidates({
    lessons: 3,
    easy: 8,
    medium: 5,
    hard: 1
  }), 15, 2);
  assert.equal(readiness.ready, false);
  assert.deepEqual(readiness.issues.map((issue) => issue.code), [
    'INSUFFICIENT_TOTAL',
    'INSUFFICIENT_LESSON_CAPACITY',
    'INSUFFICIENT_MEDIUM',
    'INSUFFICIENT_HARD'
  ]);
});

test('đánh giá riêng khả năng tạo 5 câu luyện và 8 câu ôn của từng bài', () => {
  const ready = evaluateLessonReadiness(candidates({ lessons: 1, easy: 4, medium: 3, hard: 1 }));
  const blocked = evaluateLessonReadiness(candidates({ lessons: 1, easy: 5, medium: 2, hard: 0 }));
  assert.equal(ready.ready, true);
  assert.equal(blocked.practice5.ready, false);
  assert.equal(blocked.review8.ready, false);
});

test('tổng hợp số phạm vi đạt và các loại thiếu dữ liệu', () => {
  const summary = summarizeReadiness([
    { ready: true, issues: [] },
    { ready: false, issues: [{ code: 'INSUFFICIENT_HARD' }] },
    { ready: false, issues: [{ code: 'INSUFFICIENT_HARD' }, { code: 'INSUFFICIENT_TOTAL' }] }
  ]);
  assert.deepEqual(summary, {
    totalScopes: 3,
    readyScopes: 1,
    blockedScopes: 2,
    issueCounts: { INSUFFICIENT_HARD: 2, INSUFFICIENT_TOTAL: 1 }
  });
});

test('script báo cáo chỉ đọc dữ liệu', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'scripts', 'report_question_bank_readiness.js'),
    'utf8'
  );
  assert.doesNotMatch(source, /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|REPLACE)\b/i);
});
