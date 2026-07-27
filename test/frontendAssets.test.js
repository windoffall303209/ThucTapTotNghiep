const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const projectRoot = path.resolve(__dirname, '..');
const viewsRoot = path.join(projectRoot, 'views');
const publicRoot = path.join(projectRoot, 'public');

function listFiles(directory, extension) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(absolutePath, extension);
    return absolutePath.endsWith(extension) ? [absolutePath] : [];
  });
}

test('không dùng lại hai bundle frontend cũ', () => {
  assert.equal(fs.existsSync(path.join(publicRoot, 'css', 'style.css')), false);
  assert.equal(fs.existsSync(path.join(publicRoot, 'js', 'app.js')), false);

  const layout = fs.readFileSync(path.join(viewsRoot, 'layouts', 'main.ejs'), 'utf8');
  assert.doesNotMatch(layout, /\/css\/style\.css/);
  assert.doesNotMatch(layout, /\/js\/app\.js/);
});

test('mọi asset tĩnh được khai báo trong EJS đều tồn tại', () => {
  const missingAssets = [];

  for (const viewPath of listFiles(viewsRoot, '.ejs')) {
    const source = fs.readFileSync(viewPath, 'utf8');
    const assetPaths = [...source.matchAll(/['"](\/(?:css|js)\/[^'"]+\.(?:css|js))['"]/g)]
      .map((match) => match[1]);

    for (const assetPath of assetPaths) {
      const publicPath = path.join(publicRoot, ...assetPath.split('/').filter(Boolean));
      if (!fs.existsSync(publicPath)) {
        missingAssets.push(`${path.relative(projectRoot, viewPath)} -> ${assetPath}`);
      }
    }
  }

  assert.deepEqual(missingAssets, []);
});

test('tài nguyên riêng của admin nằm trong thư mục admin', () => {
  const invalidAssets = [];

  for (const viewPath of listFiles(path.join(viewsRoot, 'admin'), '.ejs')) {
    const source = fs.readFileSync(viewPath, 'utf8');
    const pageAssets = [...source.matchAll(/['"](\/(?:css|js)\/[^'"]+\.(?:css|js))['"]/g)]
      .map((match) => match[1]);

    for (const assetPath of pageAssets) {
      if (!assetPath.startsWith('/css/admin/') && !assetPath.startsWith('/js/admin/')) {
        invalidAssets.push(`${path.relative(projectRoot, viewPath)} -> ${assetPath}`);
      }
    }
  }

  assert.deepEqual(invalidAssets, []);
});

test('EJS không chứa CSS hoặc JavaScript thực thi viết trực tiếp', () => {
  const violations = [];

  for (const viewPath of listFiles(viewsRoot, '.ejs')) {
    const source = fs.readFileSync(viewPath, 'utf8');
    if (/<style(?:\s|>)/i.test(source)) {
      violations.push(`${path.relative(projectRoot, viewPath)} chứa thẻ style`);
    }

    const inlineScripts = [...source.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>/gi)]
      .filter((match) => !/type=["']application\/json["']/i.test(match[1]));
    if (inlineScripts.length > 0) {
      violations.push(`${path.relative(projectRoot, viewPath)} chứa script thực thi inline`);
    }
  }

  assert.deepEqual(violations, []);
});

test('CSS dùng chung sở hữu các grid và card xuất hiện trên nhiều route', () => {
  const commonCss = fs.readFileSync(path.join(publicRoot, 'css', 'common.css'), 'utf8');

  assert.match(commonCss, /\.stat-grid,\s*\.today-grid,\s*\.quick-grid\s*\{[^}]*display:\s*grid/s);
  assert.match(commonCss, /\.stat-card,\s*\.action-card,\s*\.activity-card\s*\{[^}]*padding:/s);
});

test('responsive chung không ép toàn bộ nút thành một cột trên mobile', () => {
  const commonCss = fs.readFileSync(path.join(publicRoot, 'css', 'common.css'), 'utf8');

  assert.doesNotMatch(commonCss, /\.nav-button,\s*\.btn,\s*\.search-bar button/);
});

test('CSS dùng chung không còn sở hữu shell admin hoặc cascade mobile cũ', () => {
  const commonCss = fs.readFileSync(path.join(publicRoot, 'css', 'common.css'), 'utf8');
  const adminCss = fs.readFileSync(path.join(publicRoot, 'css', 'admin', 'common.css'), 'utf8');

  assert.doesNotMatch(commonCss, /\.admin-body \.page-shell\s*\{/);
  assert.doesNotMatch(commonCss, /\.admin-sidebar\s*\{/);
  assert.doesNotMatch(commonCss, /\.admin-nav(?:\s|[.{])/);
  assert.doesNotMatch(commonCss, /padding-top:\s*210px/);
  assert.match(adminCss, /\.admin-body \.page-shell\s*\{/);
  assert.match(adminCss, /\.admin-sidebar\s*\{/);
  assert.match(adminCss, /padding-top:\s*calc\(var\(--admin-app-bar-height\) \+ 12px\)/);
});

test('responsive học sinh sở hữu bố cục một cột của header và hàng bài học', () => {
  const studentCss = fs.readFileSync(path.join(publicRoot, 'css', 'student', 'common.css'), 'utf8');
  const dashboardCss = fs.readFileSync(path.join(publicRoot, 'css', 'student', 'dashboard.css'), 'utf8');

  assert.match(
    studentCss,
    /\.student-body \.workspace-head,\s*\.student-body \.learning-summary\s*\{[^}]*grid-template-columns:\s*1fr/s
  );
  assert.match(dashboardCss, /\.student-body \.lesson-row\s*\{[^}]*grid-template-columns:\s*1fr/s);
});

test('CSS admin không giữ lại flow và dialog authoring đã bỏ khỏi view', () => {
  const managerCss = fs.readFileSync(path.join(publicRoot, 'css', 'admin', 'content-manager.css'), 'utf8');
  const authoringCss = fs.readFileSync(path.join(publicRoot, 'css', 'admin', 'authoring-forms.css'), 'utf8');

  assert.doesNotMatch(managerCss, /\.(?:question-flow|question-bank-topbar|flow-step|book-card|flow-list-row)/);
  assert.doesNotMatch(authoringCss, /\.(?:question-create-dialog|preview-phone|live-preview)/);
});

test('CSS renderer dùng chung sở hữu bố cục grid và đáp án cho mọi màn hình', () => {
  const rendererCss = fs.readFileSync(path.join(publicRoot, 'css', 'content-renderer.css'), 'utf8');
  const adminManagerCss = fs.readFileSync(path.join(publicRoot, 'css', 'admin', 'content-manager.css'), 'utf8');
  const practiceCss = fs.readFileSync(path.join(publicRoot, 'css', 'student', 'practice.css'), 'utf8');

  assert.match(rendererCss, /\.content-grid-layout\s*\{[^}]*display:\s*grid/s);
  assert.match(rendererCss, /\.content-grid-cell\s*\{[^}]*min-height:/s);
  assert.match(rendererCss, /\.answer-grid,\s*\.review-answer-grid,\s*\.question-choice-list\s*\{/s);
  assert.doesNotMatch(adminManagerCss, /\.content-grid-layout\s*\{/);
  assert.doesNotMatch(adminManagerCss, /\.content-grid-cell\s*\{/);
  assert.doesNotMatch(practiceCss, /\.answer-grid,\s*\.review-answer-grid/);
});
