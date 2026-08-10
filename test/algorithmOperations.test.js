// Bộ kiểm thử algorithm operations.test xác minh hành vi và các điều kiện biên quan trọng của hệ thống.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  inferDifficultyFromAccuracy,
  buildDifficultyWarning
} = require('../utils/difficultyCalibration');
const {
  parseArguments,
  auditScope,
  buildAuditSeed,
  evaluateAuditGate
} = require('../scripts/audit_practice_selector');

// Hàm read dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('hiệu chỉnh độ khó dùng các dải độ chính xác rõ ràng', () => {
  assert.equal(inferDifficultyFromAccuracy(0.75), 'EASY');
  assert.equal(inferDifficultyFromAccuracy(0.5), 'MEDIUM');
  assert.equal(inferDifficultyFromAccuracy(0.25), 'HARD');
  assert.equal(inferDifficultyFromAccuracy(0.24), 'EXPERT');
});

test('chỉ cảnh báo lệch nhãn sau ít nhất 30 lượt và không tự sửa dữ liệu', () => {
  assert.equal(buildDifficultyWarning({
    question_id: 1,
    difficulty: 'HARD',
    attempt_count: 29,
    actual_accuracy: 0.9
  }), null);
  assert.deepEqual(buildDifficultyWarning({
    question_id: 1,
    lesson_id: 2,
    difficulty: 'HARD',
    attempt_count: 30,
    actual_accuracy: 0.9
  }), {
    question_id: 1,
    lesson_id: 2,
    editorial_difficulty: 'HARD',
    observed_difficulty: 'EASY',
    attempt_count: 30,
    actual_accuracy: 0.9
  });

  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const file of ['scripts/audit_practice_selector.js', 'scripts/report_difficulty_calibration.js']) {
    assert.doesNotMatch(read(file), /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|REPLACE)\b/i);
  }
});

test('audit nhận số lượt hợp lệ và seed kiểm tra có thể tái hiện', () => {
  assert.deepEqual(parseArguments(['--runs=40']), {
    runs: 40,
    failOnWarning: false,
    thresholds: {
      difficultyFallbackRate: 0.25,
      similarityFallbackRate: 0.05
    }
  });
  assert.throws(() => parseArguments(['--runs=0']), /từ 1 đến 500/);
  assert.throws(
    () => parseArguments(['--max-difficulty-fallback-rate=2']),
    /khoảng 0 đến 1/
  );
  assert.equal(buildAuditSeed(1, 'Cả năm', 15, 0), buildAuditSeed(1, 'Cả năm', 15, 0));
});

test('audit phát hiện trùng, sai phạm vi và thống kê tỷ lệ độ khó', () => {
  const candidates = [];
  let id = 1;
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (let lesson = 1; lesson <= 8; lesson += 1) {
    // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
    for (const difficulty of ['EASY', 'MEDIUM', 'HARD']) {
      candidates.push({ id: id++, lesson_id: lesson, chapter_id: 1, difficulty });
    }
  }
  const report = auditScope({
    grade: 1,
    scope: 'Chương 1',
    mode: 'CHAPTER',
    candidates,
    count: 15,
    runs: 5
  });

  assert.equal(report.runs, 5);
  assert.equal(report.duplicateQuestionIds, 0);
  assert.equal(report.nearDuplicatePairs, 0);
  assert.equal(report.outOfScopeQuestionIds, 0);
  assert.equal(report.incompleteRuns, 0);
  assert.equal(report.chapterQuotaMismatches, 0);
  assert.ok(report.sequenceConflicts.lesson >= 0);
  assert.equal(report.actualDifficultyRatio.EASY, 0.4667);
});

test('cổng audit thất bại với vi phạm cứng và cảnh báo khi fallback vượt ngưỡng', () => {
  const failed = evaluateAuditGate([{
    runs: 10,
    incompleteRuns: 1,
    duplicateQuestionIds: 2,
    nearDuplicatePairs: 0,
    outOfScopeQuestionIds: 0,
    chapterQuotaMismatches: 1,
    fallbackReasons: {}
  }]);
  assert.equal(failed.status, 'FAIL');
  assert.deepEqual(failed.violations.map((item) => item.code), [
    'INCOMPLETE_EXAMS',
    'DUPLICATE_QUESTION_IDS',
    'CHAPTER_QUOTA_MISMATCHES'
  ]);

  const warning = evaluateAuditGate([{
    runs: 10,
    incompleteRuns: 0,
    duplicateQuestionIds: 0,
    nearDuplicatePairs: 2,
    outOfScopeQuestionIds: 0,
    fallbackReasons: { DIFFICULTY_RELAXED: 4 }
  }]);
  assert.equal(warning.status, 'WARN');
  assert.equal(warning.rates.difficultyFallbackRate, 0.4);
  assert.ok(warning.warnings.some((item) => item.code === 'NEAR_DUPLICATE_PAIRS_SELECTED'));

  const passed = evaluateAuditGate([{
    runs: 10,
    incompleteRuns: 0,
    duplicateQuestionIds: 0,
    nearDuplicatePairs: 0,
    outOfScopeQuestionIds: 0,
    fallbackReasons: {}
  }]);
  assert.equal(passed.status, 'PASS');
});
