const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');

const viewPath = path.join(__dirname, '..', 'views', 'admin', 'students.ejs');
const viewSource = fs.readFileSync(viewPath, 'utf8');

function renderStudents(overrides = {}) {
  const students = Array.from({ length: 20 }, (_, index) => ({
    id: index + 81,
    fullname: `Học sinh ${index + 81}`,
    username: `hs${index + 81}`,
    current_grade: 4,
    registered_grade: 4,
    is_active: index % 2,
    last_activity_at: null,
    created_at: new Date('2026-07-01T08:00:00+07:00')
  }));

  return ejs.render(viewSource, {
    csrfToken: 'test-csrf-token',
    students,
    query: 'an',
    filterGrade: 4,
    gradeOptions: [1, 2, 3, 4, 5].map((value) => ({ value, label: `Lớp ${value}` })),
    pagination: {
      page: 5,
      limit: 20,
      total: 200,
      totalPages: 10
    },
    ...overrides
  }, { filename: viewPath });
}

test('trang tài khoản hiển thị dạng bảng và giữ bộ lọc khi phân trang', () => {
  const html = renderStudents();

  assert.match(html, /<table class="account-table">/);
  assert.match(html, /aria-current="page"/);
  assert.match(html, /q=an/);
  assert.match(html, /grade=4/);
  assert.match(html, /page=4/);
  assert.match(html, /page=6/);
});

test('trang tài khoản không còn thao tác đổi mật khẩu hoặc khối lớp', () => {
  const html = renderStudents();

  assert.doesNotMatch(html, /\/admin\/students\/[^"]+\/password/);
  assert.doesNotMatch(html, /\/admin\/students\/[^"]+\/grade/);
  assert.doesNotMatch(html, /Đặt lại mật khẩu|Lưu khối lớp/);
});

test('mỗi tài khoản có thể sửa trạng thái hoạt động và giữ vị trí danh sách', () => {
  const html = renderStudents();

  assert.match(html, /\/admin\/students\/81\/status/);
  assert.match(html, /name="is_active"/);
  assert.match(html, /Đang hoạt động/);
  assert.match(html, /Tạm khóa/);
  assert.match(html, /name="page" value="5"/);
});
