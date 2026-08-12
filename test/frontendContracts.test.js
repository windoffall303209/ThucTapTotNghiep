// Bộ kiểm thử frontend contracts.test xác minh hành vi và các điều kiện biên quan trọng của hệ thống.
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const projectRoot = path.resolve(__dirname, '..');

// Hàm read dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

// Hàm assertContainsAll dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function assertContainsAll(source, patterns) {
  patterns.forEach((pattern) => assert.match(source, pattern));
}

test('layout giữ đúng thứ tự tài nguyên dùng chung và tài nguyên theo trang', () => {
  const layout = read('views/layouts/main.ejs');
  const commonCss = layout.indexOf('/css/common.css');
  const rendererCss = layout.indexOf('/css/content-renderer.css');
  const studentCss = layout.indexOf('/css/student/common.css');
  const pageCss = layout.indexOf('for (const stylesheet');
  const rendererJs = layout.indexOf('/js/content-renderer.js');
  const commonJs = layout.indexOf('/js/common.js');
  const adminJs = layout.indexOf('/js/admin/common.js');
  const pageJs = layout.indexOf('for (const script');

  assert.ok(commonCss < rendererCss);
  assert.ok(rendererCss < studentCss);
  assert.ok(studentCss < pageCss);
  assert.ok(rendererJs < commonJs);
  assert.ok(commonJs < adminJs);
  assert.ok(adminJs < pageJs);
});

test('layout có lối bỏ qua điều hướng và đích nội dung chính cho bàn phím', () => {
  const layout = read('views/layouts/main.ejs');
  const commonCss = read('public/css/common.css');

  assertContainsAll(layout, [
    /class="skip-link" href="#main-content"/,
    /<main id="main-content" class="page-shell" tabindex="-1">/
  ]);
  assert.match(commonCss, /\.skip-link:focus\s*\{/);
  assert.match(commonCss, /@media \(prefers-reduced-motion: reduce\)/);
});

test('header công khai giữ điều hướng đầy đủ trên desktop và rút gọn link neo trên mobile', () => {
  const header = read('views/partials/header.ejs');
  const commonCss = read('public/css/common.css');

  assert.match(header, /class="nav-anchor" href="\/#cach-hoc"/);
  assert.match(header, /class="nav-anchor" href="\/#chuong-trinh"/);
  assert.match(
    commonCss,
    /body:not\(\.student-body\):not\(\.admin-body\) \.nav-anchor\s*\{[^}]*display:\s*none/s
  );
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
    /id="practiceTimer"/,
    /deadlineAtMs:/,
    /serverNowMs:/,
    /\/js\/student\/practice\.js/
  ]);
});

test('màn luyện tập khóa điều hướng khi đang chấm và dùng đúng đáp án đã gửi', () => {
  const practiceJs = read('public/js/student/practice.js');

  assertContainsAll(practiceJs, [
    /function isAnswerPending\(\)/,
    /app\.setAttribute\('aria-busy', isAnswerPending\(\) \? 'true' : 'false'\)/,
    /dot\.disabled = locked/,
    /nextButton\.disabled = locked/,
    /const submittedAnswer =/,
    /selectedAnswer: submittedAnswer/,
    /markAnswerState\(result, submittedAnswer\)/,
    /answer === submittedAnswer && !result\.isCorrect/,
    /if \(isAnswerPending\(\) \|\| state\.finishing \|\| state\.timeExpired\) return/
  ]);
});

test('kết thúc bài chỉ điều hướng sau phản hồi HTTP thành công', () => {
  const practiceJs = read('public/js/student/practice.js');

  assert.match(
    practiceJs,
    /if \(!response\.ok \|\| !result \|\| result\.ok !== true\) \{\s*throw new Error/
  );
});

test('popup trình duyệt được thay bằng dialog dùng chung ở giữa màn hình', () => {
  const layout = read('views/layouts/main.ejs');
  const commonJs = read('public/js/common.js');
  const practiceJs = read('public/js/student/practice.js');
  const managerJs = read('public/js/admin/content-manager.js');

  assertContainsAll(layout, [
    /<dialog id="appDialog" class="app-dialog"/,
    /data-app-dialog-cancel/,
    /data-app-dialog-confirm/
  ]);
  assertContainsAll(commonJs, [
    /function showAppAlert/,
    /function showAppConfirm/,
    /confirm: showAppConfirm/,
    /alert: showAppAlert/
  ]);
  [commonJs, practiceJs, managerJs].forEach((source) => {
    assert.doesNotMatch(source, /window\.(?:alert|confirm|prompt)\s*\(/);
  });
});

test('đề có đồng hồ đếm ngược và tự kết thúc khi hết thời gian', () => {
  const practiceJs = read('public/js/student/practice.js');
  const controller = read('controllers/StudentController.js');
  const sessionModel = read('models/PracticeSession.js');

  assertContainsAll(practiceJs, [
    /function initCountdown/,
    /function updateCountdown/,
    /remainingSeconds <= 0/,
    /finishPractice\(\{ timedOut: true \}\)/,
    /showTimeExpiredDialog/
  ]);
  assertContainsAll(controller, [
    /PracticeSession\.getSessionTiming\(session\)\.isExpired/,
    /code: 'PRACTICE_TIME_EXPIRED'/,
    /practiceTiming/
  ]);
  assertContainsAll(sessionModel, [
    /SystemSetting\.PRACTICE_DURATION_DEFAULTS/,
    /SystemSetting\.getPracticeDurationSeconds/,
    /duration_seconds/,
    /expires_at/,
    /completeExpiredSessions/
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
      /aria-live="polite"/,
      /aria-busy="false"/,
      /\/js\/admin\/content-manager\.js/
    ]);
    assert.doesNotMatch(source, /<main class="content-workspace"/);
    assert.match(source, /<section class="content-workspace"[^>]*aria-label=/);
  });

  assertContainsAll(routes, [
    /router\.get\('\/questions\/lesson\/:lessonId'/,
    /router\.get\('\/questions\/:id\/edit'/,
    /router\.get\('\/theory\/lesson\/:lessonId'/
  ]);
});

test('dirty-form admin theo dõi từng form và chặn mọi đường thay shell', () => {
  const adminCommon = read('public/js/admin/common.js');
  const manager = read('public/js/admin/content-manager.js');

  assertContainsAll(adminCommon, [
    /const dirtyForms = new Set\(\)/,
    /const userInteractedForms = new WeakSet\(\)/,
    /window\.AdminDirtyForms = \{/,
    /function dirtyFormsWithin\(root = document\)/,
    /event\.isTrusted === false/,
    /if \(!event\.defaultPrevented\) clearDirty\(event\.target\)/,
    /if \(confirmed\) forms\.forEach\(clearDirty\)/,
    /if \(!hasDirty\(\)\) return/
  ]);
  assert.doesNotMatch(adminCommon, /let dirty = false/);
  assertContainsAll(manager, [
    /const canChangeLesson = await confirmDiscard\(/,
    /const canClose = await confirmDiscard\(/,
    /async function fetchLessonQuestions\(shell, page = 1, options = \{\}\)/,
    /async function fetchLessonTheory\(shell, options = \{\}\)/,
    /const canFilter = await confirmDiscard\(/,
    /const canClearFilter = await confirmDiscard\(/,
    /fetchLessonQuestions\(shell, 1, \{ discardConfirmed: true \}\)/
  ]);
  assert.ok((manager.match(/confirmDiscard\(/g) || []).length >= 8);
});

test('form soạn câu hỏi mở sẵn, giữ upload và preview nổi, không còn canvas', () => {
  const createForm = read('views/admin/partials/lesson-questions.ejs');
  const editForm = read('views/admin/partials/question-edit-form.ejs');
  const routes = read('routes/adminRoutes.js');

  [createForm, editForm].forEach((source) => {
    assertContainsAll(source, [
      /data-question-preview-form/,
      /name="authoring_mode" value="fields"/,
      /data-open-student-preview/,
      /data-student-preview-dialog/,
      /name="question_images"/,
      /name="explanation_images"/
    ]);
    assert.doesNotMatch(source, /data-grid-canvas|Thiết kế bằng canvas|Tùy chọn nâng cao/);
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
  const settingsJs = read('public/js/admin/settings.js');

  assertContainsAll(settings, [
    /action="\/admin\/settings" method="post"/,
    /data-settings-target="openai"/,
    /data-settings-modal="openai"/,
    /aria-controls="settings-modal-openai"/,
    /aria-labelledby="settings-modal-openai-title"/,
    /id="settings-modal-openai-title"/,
    /data-model-select=/,
    /data-model-input=/,
    /class="sr-only" for="<%= name %>-input"/,
    /data-check-provider="openai"/,
    /data-check-status role="status" aria-live="polite"/,
    /data-modal-close/,
    /name="practice_duration_5_minutes"/,
    /name="practice_duration_15_minutes"/,
    /name="practice_duration_20_minutes"/,
    /min="1"/,
    /max="240"/,
    /\/js\/admin\/settings\.js/
  ]);
  assertContainsAll(settingsJs, [
    /returnFocusByModal/,
    /AdminDirtyForms\?\.confirmDiscard/,
    /modal\.addEventListener\('cancel'/,
    /input:not\(\[type="hidden"\]\):not\(\[disabled\]\)/
  ]);
});

test('schema phiên luyện tập lưu thời lượng và hạn cuối độc lập với cấu hình hiện tại', () => {
  const schema = read('database/database_schema.sql');
  const model = read('models/PracticeSession.js');
  const migration = read('scripts/apply_practice_session_timing.js');

  assertContainsAll(schema, [
    /duration_seconds INT NULL/,
    /expires_at TIMESTAMP NULL/,
    /idx_practice_sessions_expiry/
  ]);
  assertContainsAll(model, [
    /duration_seconds/,
    /expires_at/,
    /SystemSetting\.getPracticeDurationSeconds/,
    /TIMESTAMPADD\(SECOND, duration_seconds, started_at\)/
  ]);
  assertContainsAll(migration, [
    /ALTER TABLE PracticeSessions ADD COLUMN duration_seconds/,
    /ALTER TABLE PracticeSessions ADD COLUMN expires_at/,
    /INSERT IGNORE INTO SystemSettings/
  ]);
});

test('shell admin có app bar và drawer truy cập được trên màn hình hẹp', () => {
  const layout = read('views/layouts/main.ejs');
  const header = read('views/partials/header.ejs');
  const account = read('views/admin/account.ejs');
  const dashboard = read('views/admin/dashboard.ejs');
  const adminCommon = read('public/js/admin/common.js');
  const routes = read('routes/adminRoutes.js');

  assert.match(layout, /<link rel="stylesheet" href="\/css\/admin\/common\.css">/);
  assertContainsAll(header, [
    /class="admin-mobile-bar"/,
    /aria-controls="adminSidebar"/,
    /data-admin-menu-toggle/,
    /data-admin-sidebar-backdrop/,
    /id="adminSidebar"/,
    /aria-label="Menu quản trị"/,
    /aria-current="page"/
  ]);
  assertContainsAll(header, [
    /href="\/admin\/account"/,
    /currentPath\.startsWith\('\/admin\/account'\)/,
    /data-lucide="user-circle"/,
    /Tài khoản/,
    /action="\/auth\/logout"/
  ]);
  assertContainsAll(account, [
    /action="\/admin\/account\/password"/,
    /name="current_password"/,
    /name="new_password"[^>]*data-password-policy/,
    /name="confirm_password"[^>]*data-password-confirm/,
    /<%= account\.fullname %>/,
    /<%= account\.username %>/,
    /\/css\/admin\/account\.css/
  ]);
  assert.match(routes, /router\.get\('\/account', AdminController\.account\)/);
  assert.doesNotMatch(header, /data-admin-account-menu|admin-account-popover/);
  assert.doesNotMatch(dashboard, /Quản trị nội dung/);
  assertContainsAll(adminCommon, [
    /const syncSidebarAccessibility =/,
    /sidebar\.setAttribute\('aria-hidden'/,
    /sidebar\.inert = !isOpen/
  ]);
  assert.doesNotMatch(adminCommon, /initAdminAccountMenu|account=password/);
});

test('bảng câu hỏi gần đây của dashboard admin chuyển thành bản ghi xếp dọc trên mobile', () => {
  const dashboard = read('views/admin/dashboard.ejs');

  assertContainsAll(dashboard, [
    /<table class="stacked-table">/,
    /<td data-label="ID">/,
    /<td data-label="Bài học">/,
    /<td data-label="Độ khó">/,
    /<td data-label="Đáp án">/,
    /<td data-label="Thao tác">/
  ]);
});

test('thẻ lý thuyết vẫn hiển thị nội dung khi có hình minh họa', () => {
  const lesson = read('views/student/lesson.ejs');

  assert.match(lesson, /if \(bodyValue\(card\)\) \{/);
  assert.doesNotMatch(lesson, /bodyValue\(card\) && images\.length === 0/);
});

test('thẻ lý thuyết chỉ có ảnh không tự sinh nhãn hoặc nút gợi ý', () => {
  const lesson = read('views/student/lesson.ejs');

  assertContainsAll(lesson, [
    /const imageOnly = images\.length > 0 && !hasCardText/,
    /if \(!imageOnly\) \{/,
    /aiHelpEnabled && !imageOnly/,
    /theory-card-image-only/
  ]);
});

test('trang lý thuyết tạm ẩn phần hướng dẫn chung và có điều hướng bài tiếp theo', () => {
  const lesson = read('views/student/lesson.ejs');
  const controller = read('controllers/StudentController.js');

  assertContainsAll(lesson, [
    /<section class="learning-summary" hidden aria-hidden="true">/,
    /if \(nextLesson\)/,
    /href="\/student\/lessons\/<%= nextLesson\.id %>"/,
    /Bài tiếp theo/
  ]);
  assertContainsAll(controller, [
    /Curriculum\.getCurriculumByGrade\(lessonItem\.grade\)/,
    /nextLesson: findFollowingLesson\(chapters, lessonItem\.id\)/,
    /function findFollowingLesson/
  ]);
});

test('thông báo đăng nhập là toast nổi tự tắt sau ba giây', () => {
  const auth = read('controllers/AuthController.js');
  const layout = read('views/layouts/main.ejs');
  const commonJs = read('public/js/common.js');
  const commonCss = read('public/css/common.css');

  assertContainsAll(auth, [
    /Đăng nhập thành công\.',\s*\{\s*transient: true,\s*durationMs: 3000/s,
    /Đăng nhập quản trị thành công\.',\s*\{\s*transient: true,\s*durationMs: 3000/s
  ]);
  assertContainsAll(layout, [
    /flash\.transient \? ' flash-toast'/,
    /data-flash-autohide="true"/,
    /data-duration="<%= Number\(flash\.durationMs \|\| 3000\) %>"/
  ]);
  assertContainsAll(commonJs, [
    /initFlashToasts\(\)/,
    /querySelectorAll\('\[data-flash-autohide="true"\]'\)/,
    /flash\.remove\(\)/
  ]);
  assert.match(commonCss, /\.flash-toast\s*\{[^}]*position:\s*fixed/s);
});

test('session review dùng renderer chung thay vì sao chép logic hiển thị', () => {
  const review = read('views/student/session-review.ejs');
  const reviewJs = read('public/js/student/session-review.js');

  assertContainsAll(review, [
    /contentRenderer\.renderQuestionContent/,
    /contentRenderer\.renderAnswerArea/,
    /contentRenderer\.renderExplanationContent/,
    /data-review-filter="all" aria-pressed="true"/,
    /data-review-filter="wrong" aria-pressed="false"/,
    /aria-controls="reviewQuestionList"/
  ]);
  assert.match(reviewJs, /other\.setAttribute\('aria-pressed', isActive \? 'true' : 'false'\)/);
  assert.doesNotMatch(review, /function questionContentHtml|function imageRowHtml/);
});

test('phản hồi AI trong bài lý thuyết được công bố cho trình đọc màn hình', () => {
  const lesson = read('views/student/lesson.ejs');
  const lessonJs = read('public/js/student/lesson.js');

  assertContainsAll(lesson, [
    /aria-controls="theory-help-reply-<%= index %>"/,
    /aria-expanded="false"/,
    /role="status"/,
    /aria-live="polite"/,
    /aria-atomic="true"/
  ]);
  assertContainsAll(lessonJs, [
    /button\.setAttribute\('aria-expanded', 'true'\)/,
    /button\.setAttribute\('aria-busy', 'true'\)/,
    /button\.removeAttribute\('aria-busy'\)/
  ]);
});

test('tùy chọn ảnh và lỗi sai của từng đáp án được gom riêng, không khôi phục phần nâng cao tổng', () => {
  const source = read('public/js/admin/content-manager.js');
  assert.match(source, /choice-image-upload, \.two-fields/);
  assert.match(source, /Tùy chọn đáp án/);
  assert.doesNotMatch(source, /Tùy chọn nâng cao/);
});

test('mọi mật khẩu mới có thanh báo độ mạnh dùng chung và hỗ trợ trình đọc màn hình', () => {
  const script = read('public/js/common.js');
  const css = read('public/css/common.css');
  const register = read('views/auth/register.ejs');
  const account = read('views/student/account.ejs');
  const students = read('views/admin/students.ejs');
  assert.match(script, /initPasswordStrengthMeters/);
  assert.match(script, /role="meter"/);
  assert.match(script, /aria-valuenow/);
  assert.match(script, /data-password-strength-slot/);
  assert.match(css, /\.password-strength-track/);
  [register, account, students].forEach((view) => assert.match(view, /data-password-policy/));
});

test('đăng ký dùng thanh độ mạnh toàn hàng và hai trang có ô chuyển đăng nhập đăng ký', () => {
  const css = read('public/css/auth/common.css');
  const register = read('views/auth/register.ejs');
  const login = read('views/auth/login.ejs');
  assert.match(register, /auth-password-strength-slot/);
  assert.match(css, /\.auth-password-strength-slot[\s\S]*grid-column:\s*1 \/ -1/);
  assert.match(register, /Đã có tài khoản\?[\s\S]*Đăng nhập/);
  assert.match(login, /Chưa có tài khoản\?[\s\S]*Đăng ký/);
  assert.doesNotMatch(login, /role === 'admin'[\s\S]{0,300}Chưa có tài khoản/);
});

test('ảnh minh họa câu hỏi được thu gọn và có thể mở lớn', () => {
  const practice = read('views/student/practice.ejs');
  const review = read('views/student/session-review.ejs');
  const practiceJs = read('public/js/student/practice.js');
  const viewerJs = read('public/js/student/question-image-viewer.js');
  const viewerCss = read('public/css/student/question-image-viewer.css');

  [practice, review].forEach((source) => {
    assertContainsAll(source, [
      /\/css\/student\/question-image-viewer\.css/,
      /\/js\/student\/question-image-viewer\.js/
    ]);
  });
  assert.match(practiceJs, /StudentQuestionImages\?\.enhance\(app\)/);
  assertContainsAll(viewerJs, [
    /querySelectorAll\('\.question-content img:not\(\[data-question-image-zoom\]\)'\)/,
    /setAttribute\('aria-haspopup', 'dialog'\)/,
    /event\.key !== 'Enter' && event\.key !== ' '/,
    /dialog\.showModal\(\)/
  ]);
  assertContainsAll(viewerCss, [
    /max-height:\s*min\(34vh, 320px\)/,
    /\.question-image-viewer::backdrop/,
    /cursor:\s*zoom-in/
  ]);
});
