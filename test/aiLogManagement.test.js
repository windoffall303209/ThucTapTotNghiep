// Bộ kiểm thử ai log management.test xác minh hành vi và các điều kiện biên quan trọng của hệ thống.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const AIConversationLog = require('../models/AIConversationLog');
const SystemSetting = require('../models/SystemSetting');
const RetentionMigration = require('../scripts/apply_ai_log_retention');

// Hàm read dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('bộ lọc nhật ký AI chuẩn hóa ngày và ID trước khi tạo SQL bind', () => {
  const normalized = AIConversationLog.normalizeLogFilters({
    studentId: '7',
    sessionType: 'exercise_help',
    lessonId: '42',
    from: '2026-07-01',
    to: '2026-07-31',
    onlyFlagged: '1'
  });
  assert.deepEqual(normalized, {
    studentId: 7,
    sessionType: 'EXERCISE_HELP',
    onlyFlagged: true,
    lessonId: 42,
    from: '2026-07-01',
    to: '2026-07-31'
  });

  const query = AIConversationLog.buildLogFilter(normalized);
  assert.match(query.whereClause, /log\.student_id = \?/);
  assert.match(query.whereClause, /log\.lesson_id = \?/);
  assert.match(query.whereClause, /log\.created_at >= \?/);
  assert.match(query.whereClause, /log\.created_at < DATE_ADD\(\?, INTERVAL 1 DAY\)/);
  assert.deepEqual(query.params, [
    7,
    'EXERCISE_HELP',
    42,
    42,
    '2026-07-01 00:00:00',
    '2026-07-31 00:00:00'
  ]);
});

test('bộ lọc nhật ký AI từ chối ngày, khoảng ngày và lesson_id không hợp lệ', () => {
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const filters of [
    { from: '2026-02-30' },
    { from: '2026-08-01', to: '2026-07-31' },
    { lessonId: '1 OR 1=1' },
    { lessonId: '1e3' },
    { lessonId: '9007199254740992' },
    { sessionType: 'UNKNOWN' }
  ]) {
    assert.throws(
      () => AIConversationLog.normalizeLogFilters(filters),
      (error) => error.code === 'INVALID_AI_LOG_FILTER'
    );
  }
});

test('lượt bị chính sách chặn chỉ lưu metadata, không lưu nội dung học sinh', () => {
  const history = [{ role: 'student', text: 'Nội dung riêng tư' }];
  assert.deepEqual(
    AIConversationLog.normalizeStoredChatHistory(history, 'answer_required'),
    []
  );
  assert.equal(AIConversationLog.normalizeStoredChatHistory(history), history);
});

test('retention nhật ký AI mặc định 90 ngày và chỉ nhận từ 1 đến 365 ngày', () => {
  assert.equal(SystemSetting.AI_LOG_RETENTION_DEFAULT_DAYS, 90);
  assert.equal(SystemSetting.getAiLogRetentionDays({ ai_log_retention_days: '120' }), 120);
  assert.equal(SystemSetting.getAiLogRetentionDays({ ai_log_retention_days: 'invalid' }), 90);
  assert.equal(SystemSetting.validateSettingValue('ai_log_retention_days', '1'), '1');
  assert.equal(SystemSetting.validateSettingValue('ai_log_retention_days', '365'), '365');
  assert.throws(
    () => SystemSetting.validateSettingValue('ai_log_retention_days', '0'),
    /1 đến 365/
  );
  assert.throws(
    () => SystemSetting.validateSettingValue('ai_log_retention_days', '366'),
    /1 đến 365/
  );
});

test('CLI retention mặc định preflight và chỉ áp dụng khi có --apply', () => {
  assert.deepEqual(RetentionMigration.parseArgs([]), { apply: false });
  assert.deepEqual(RetentionMigration.parseArgs(['--apply']), { apply: true });
  assert.throws(
    () => RetentionMigration.parseArgs(['--force']),
    /không được hỗ trợ/
  );

  const now = new Date('2026-07-30T12:00:00.000Z');
  assert.equal(
    RetentionMigration.retentionCutoff(90, now).toISOString(),
    '2026-05-01T12:00:00.000Z'
  );
});

test('controller và view giữ bộ lọc ngày/bài học khi thống kê và phân trang', () => {
  const controller = read('controllers/AdminController.js');
  const view = read('views/admin/ai-logs.ejs');
  const migration = read('scripts/apply_ai_log_retention.js');

  assert.match(controller, /lessonId: req\.query\.lesson_id/);
  assert.match(controller, /from: req\.query\.from/);
  assert.match(controller, /to: req\.query\.to/);
  assert.match(controller, /getLogStats\(filters\)/);
  assert.match(view, /name="lesson_id"/);
  assert.match(view, /name="from"/);
  assert.match(view, /name="to"/);
  assert.match(migration, /if \(!options\.apply\)/);
  assert.match(migration, /SET chat_history = JSON_ARRAY\(\)/);
  assert.match(migration, /DELETE FROM AIConversationLogs WHERE created_at < \?/);
});
