// B? ki?m th? practice duration settings.test x?c minh h?nh vi v? c?c ?i?u ki?n bi?n quan tr?ng c?a h? th?ng.
const test = require('node:test');
const assert = require('node:assert/strict');

const SystemSetting = require('../models/SystemSetting');

test('thời gian luyện tập mặc định tương ứng đề 5, 15 và 20 câu', () => {
  assert.equal(SystemSetting.getPracticeDurationMinutes(5, {}), 10);
  assert.equal(SystemSetting.getPracticeDurationMinutes(15, {}), 30);
  assert.equal(SystemSetting.getPracticeDurationMinutes(20, {}), 60);
});

test('cấu hình admin được đổi từ phút sang giây khi tạo phiên', () => {
  const settings = {
    practice_duration_5_minutes: '12',
    practice_duration_15_minutes: '35',
    practice_duration_20_minutes: '75'
  };

  assert.equal(SystemSetting.getPracticeDurationSeconds(5, settings), 12 * 60);
  assert.equal(SystemSetting.getPracticeDurationSeconds(15, settings), 35 * 60);
  assert.equal(SystemSetting.getPracticeDurationSeconds(20, settings), 75 * 60);
});

test('số câu không được cấu hình không tự nhận thời hạn', () => {
  assert.equal(SystemSetting.getPracticeDurationMinutes(8, {}), null);
  assert.equal(SystemSetting.getPracticeDurationSeconds(8, {}), null);
});
