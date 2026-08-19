// Bộ kiểm thử student algorithm integration.test xác minh hành vi và các điều kiện biên quan trọng của hệ thống.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const controller = fs.readFileSync(
  path.join(__dirname, '..', 'controllers', 'StudentController.js'),
  'utf8'
);

test('controller học sinh dùng dịch vụ năng lực thay cho cách đếm chỉ cần một câu đúng', () => {
  assert.match(controller, /LearningMasteryService\.getMasteryByGrade/);
  assert.match(controller, /LearningMasteryService\.buildGradeProgress/);
  assert.match(controller, /LearningMasteryService\.findWeakestLesson/);
  assert.doesNotMatch(controller, /Curriculum\.getLessonProgressByGrade/);
});

test('mọi luồng tạo phiên mới đều lưu metadata của bộ chọn V2', () => {
  assert.match(controller, /PracticeGenerationService\.generateLessonSelection/);
  assert.match(controller, /PracticeGenerationService\.generateMultiLessonSelection/);
  assert.match(controller, /PracticeGenerationService\.generateReviewSelection/);
  assert.match(controller, /PracticeGenerationService\.generateScopedSelection/);
  assert.match(controller, /PracticeGenerationService\.generateWrongAnswerRetrySelection/);
  assert.equal((controller.match(/selection: generated\.selection/g) || []).length, 4);
  assert.doesNotMatch(controller, /selectRandomQuestions|selectBalancedQuestions/);
});
