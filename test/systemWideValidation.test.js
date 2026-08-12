const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  isAllowedValue,
  normalizeBoundedText,
  normalizePage,
  parseInteger,
  parsePositiveInteger
} = require('../utils/requestValidation');
const {
  normalizeFullname,
  normalizeUsername,
  validateFullname,
  validatePassword
} = require('../utils/accountValidation');
const { normalizeGrade } = require('../config/grades');
const {
  normalizeSubmittedAnswer,
  normalizeTimeSpentSeconds
} = require('../utils/answerValidation');
const { validateSortOrder, validateTextLength } = require('../utils/contentValidation');
const SystemSetting = require('../models/SystemSetting');
const AIConversationLog = require('../models/AIConversationLog');
const { _test: providerTest } = require('../services/ProviderCheckService');

test('HTTP integer helpers reject coercion, exponent notation and unsafe bounds', () => {
  assert.equal(parsePositiveInteger('12'), 12);
  assert.equal(parseInteger('-2', { min: -5, max: 5 }), -2);
  for (const value of [['12'], { value: 12 }, '1e2', '1.5', '-1', '', Number.MAX_VALUE]) {
    assert.equal(parsePositiveInteger(value), null);
  }
  assert.equal(normalizePage('2'), 2);
  assert.equal(normalizePage('1e2'), 1);
  assert.equal(normalizePage('100001'), 1);
});

test('text, account, grade and answer validators reject non-scalar payloads', () => {
  assert.equal(normalizeBoundedText({ text: 'abc' }, 20), '');
  assert.equal(isAllowedValue(['admin'], ['admin', 'student']), false);
  assert.equal(normalizeUsername(['student']), '');
  assert.equal(normalizeFullname({ name: 'Student' }), '');
  assert.ok(validatePassword({ password: 'password123' }));
  assert.equal(normalizeGrade(['3']), null);
  assert.equal(normalizeGrade('3e0'), null);
  assert.equal(normalizeGrade('3'), 3);
  assert.equal(normalizeSubmittedAnswer({ answer: 'A' }), null);
  assert.equal(normalizeTimeSpentSeconds(['30']), null);
  assert.ok(validateTextLength({ text: 'abc' }, 'Content', 100));
  assert.ok(validateSortOrder(['1']));
});

test('họ tên chỉ nhận chữ và mật khẩu mới phải đạt chính sách mạnh', () => {
  assert.equal(validateFullname('Nguyễn Văn An'), '');
  assert.equal(validateFullname("Anne-Marie O'Neil"), '');
  assert.match(validateFullname('Nguyễn Văn An123'), /không được chứa số/);
  assert.match(validateFullname('Nguyễn @ An'), /chỉ được chứa chữ cái/);
  assert.match(validatePassword('Matkhau123'), /ký tự đặc biệt/);
  assert.match(validatePassword('Mat khau-123!'), /khoảng trắng/);
  assert.equal(validatePassword('Mat-khau-10!'), '');
});

test('system settings enforce scalar, size, control-character and strict-number rules', () => {
  assert.throws(() => SystemSetting.validateSettingValue('openai_model', {}));
  assert.throws(() => SystemSetting.validateSettingValue('openai_model', 'model\nheader'));
  assert.throws(() => SystemSetting.validateSettingValue('openai_model', 'x'.repeat(256)));
  assert.throws(() => SystemSetting.validateSettingValue('openai_base_url', `https://example.com/${'x'.repeat(2048)}`));
  assert.throws(() => SystemSetting.validateSettingValue('ai_json_timeout_ms', '1e4'));
  assert.equal(SystemSetting.validateSettingValue('ai_json_timeout_ms', '10000'), '10000');
});

test('provider check only merges validated known scalar settings and safe URLs', () => {
  const current = {
    openai_api_key: 'saved-key',
    openai_base_url: 'https://api.openai.com/v1',
    openai_model: 'gpt-4o-mini'
  };
  assert.equal(
    providerTest.mergeSettings(current, { openai_model: 'gpt-4.1-mini' }).openai_model,
    'gpt-4.1-mini'
  );
  assert.throws(() => providerTest.mergeSettings(current, { openai_model: ['gpt-4o-mini'] }));
  assert.throws(() => providerTest.mergeSettings(current, { openai_model: 'x'.repeat(256) }));
  assert.throws(() => providerTest.mergeSettings(current, { openai_base_url: 'http://127.0.0.1:3000' }));
  assert.equal(providerTest.mergeSettings(current, { ignored: 'value' }).ignored, undefined);
});

test('AI log filters reject arrays, invalid flags and exponent-form identifiers', () => {
  assert.throws(() => AIConversationLog.normalizeLogFilters({ sessionType: ['PRACTICE'] }));
  assert.throws(() => AIConversationLog.normalizeLogFilters({ from: ['2026-08-11'] }));
  assert.throws(() => AIConversationLog.normalizeLogFilters({ lessonId: '1e2' }));
  assert.throws(() => AIConversationLog.normalizeLogFilters({ onlyFlagged: 'yes' }));
  const filters = AIConversationLog.normalizeLogFilters({
    sessionType: 'exercise_help',
    lessonId: '12',
    onlyFlagged: '1'
  });
  assert.equal(filters.sessionType, 'EXERCISE_HELP');
  assert.equal(filters.lessonId, 12);
  assert.equal(filters.onlyFlagged, true);
});

test('high-risk forms expose browser-side limits that mirror server validation', () => {
  const root = path.join(__dirname, '..');
  const settings = fs.readFileSync(path.join(root, 'views/admin/settings.ejs'), 'utf8');
  const students = fs.readFileSync(path.join(root, 'views/admin/students.ejs'), 'utf8');
  const practice = fs.readFileSync(path.join(root, 'views/student/practice.ejs'), 'utf8');

  assert.match(settings, /name="ai_json_timeout_ms"[^>]*min="1000"[^>]*max="120000"/);
  assert.match(settings, /name="ai_enabled_grades"[^>]*maxlength="9"[^>]*pattern=/);
  assert.match(settings, /name="openai_base_url"[^>]*type="url"[^>]*maxlength="2048"/);
  assert.match(students, /name="q"[\s\S]{0,200}maxlength="100"/);
  assert.match(practice, /id="aiHelpInput"[^>]*maxlength="1000"/);
});
