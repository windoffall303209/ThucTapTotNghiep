// Bộ kiểm thử admin students view.test xác minh hành vi và các điều kiện biên quan trọng của hệ thống.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');

const viewPath = path.join(__dirname, '..', 'views', 'admin', 'students.ejs');
const viewSource = fs.readFileSync(viewPath, 'utf8');

// Hàm renderStudents dùng để chuẩn bị và hiển thị kết quả cho người dùng; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
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

test('SYSADMIN có công cụ đổi khối và đặt mật khẩu tạm với xác nhận an toàn', () => {
  const html = renderStudents();

  assert.match(html, /\/admin\/students\/81\/password/);
  assert.match(html, /\/admin\/students\/81\/grade/);
  assert.match(html, /name="current_grade"/);
  assert.match(html, /name="temporary_password"/);
  assert.match(html, /name="confirm_password"/);
  assert.match(html, /type="password"/);
  assert.match(html, /autocomplete="new-password"/);
  assert.match(html, /Lưu khối lớp/);
  assert.match(html, /Đặt mật khẩu tạm/);
  assert.match(html, /name="q" value="an"/);
  assert.match(html, /name="grade" value="4"/);
  assert.match(html, /name="page" value="5"/);
  assert.doesNotMatch(html, /name="temporary_password"[^>]*\bvalue=/);
});

test('mỗi tài khoản có thể sửa trạng thái hoạt động và giữ vị trí danh sách', () => {
  const html = renderStudents();

  assert.match(html, /\/admin\/students\/81\/status/);
  assert.match(html, /name="is_active"/);
  assert.match(html, /Đang hoạt động/);
  assert.match(html, /Tạm khóa/);
  assert.match(html, /name="page" value="5"/);
});
