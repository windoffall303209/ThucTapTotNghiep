const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const projectRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

function assertContainsAll(source, patterns) {
  patterns.forEach((pattern) => assert.match(source, pattern));
}

test('layout giữ đúng thứ tự tài nguyên dùng chung và tài nguyên theo trang', () => {
  const layout = read('views/layouts/main.ejs');
  const commonCss = layout.indexOf('/css/common.css');
  const rendererCss = layout.indexOf('/css/content-renderer.css');
  const studentCss = layout.indexOf('/css/student/common.css');
  const pageCss = layout.indexOf('for (const stylesheet');
  const commonJs = layout.indexOf('/js/common.js');
  const adminJs = layout.indexOf('/js/admin/common.js');
  const pageJs = layout.indexOf('for (const script');

  assert.ok(commonCss < rendererCss);
  assert.ok(rendererCss < studentCss);
  assert.ok(studentCss < pageCss);
  assert.ok(commonJs < adminJs);
  assert.ok(adminJs < pageJs);
});

test('màn luyện tập giữ các điểm nối dữ liệu và điều khiển phiên làm bài', () => {
  const practice = read('views/student/practice.ejs');

  assertContainsAll(practice, [
    /data-session-id=/,
    /id="questionCounter"/,
    /id="questionProgressBar"/,
    /data-progress-dot/,
    /id="practiceApp"/,
    /id="answerFeedback"/,
    /id="practiceSummary"/,
    /id="submitAnswerButton"/,
    /id="nextQuestionButton"/,
    /id="finishPracticeButton"/,
    /id="practice-data" type="application\/json"/,
    /id="practice-context" type="application\/json"/,
    /practiceSessionId:/,
    /answeredResults:/,
    /\/js\/student\/practice\.js/
  ]);
});

test('trình quản lý nội dung giữ contract tải động cho câu hỏi và lý thuyết', () => {
  const questions = read('views/admin/questions.ejs');
  const theory = read('views/admin/theory.ejs');
  const routes = read('routes/adminRoutes.js');

  [questions, theory].forEach((source) => {
    assertContainsAll(source, [
      /data-content-manager=/,
      /data-selected-lesson=/,
      /data-lesson-search/,
      /data-grade-filter=/,
      /data-lesson-select/,
      /data-lesson-id=/,
      /data-content-workspace/,
      /data-workspace-panel/,
      /data-manager-shell/,
      /\/js\/admin\/content-manager\.js/
    ]);
  });

  assertContainsAll(routes, [
    /router\.get\('\/questions\/lesson\/:lessonId'/,
    /router\.get\('\/questions\/:id\/edit'/,
    /router\.get\('\/theory\/lesson\/:lessonId'/
  ]);
});

test('form soạn câu hỏi giữ trường upload và hook canvas hiện tại', () => {
  const createForm = read('views/admin/partials/lesson-questions.ejs');
  const editForm = read('views/admin/partials/question-edit-form.ejs');
  const routes = read('routes/adminRoutes.js');

  [createForm, editForm].forEach((source) => {
    assertContainsAll(source, [
      /data-question-preview-form/,
      /name="authoring_mode"/,
      /data-grid-layout-input/,
      /data-grid-editor/,
      /data-grid-canvas/,
      /name="question_images"/,
      /name="explanation_images"/
    ]);
  });

  assertContainsAll(routes, [
    /name: 'question_images', maxCount: 6/,
    /name: 'explanation_images', maxCount: 6/,
    /name: 'choice_image_A', maxCount: 3/,
    /router\.post\('\/questions'/,
    /router\.post\('\/questions\/:id'/
  ]);
});

test('màn cài đặt giữ hook dialog, chọn model và kiểm tra provider', () => {
  const settings = read('views/admin/settings.ejs');

  assertContainsAll(settings, [
    /action="\/admin\/settings" method="post"/,
    /data-settings-target="openai"/,
    /data-settings-modal="openai"/,
    /data-model-select=/,
    /data-model-input=/,
    /data-check-provider="openai"/,
    /data-check-status/,
    /data-modal-close/,
    /\/js\/admin\/settings\.js/
  ]);
});
