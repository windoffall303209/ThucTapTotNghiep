// Bộ kiểm thử admin dirty forms.test xác minh hành vi và các điều kiện biên quan trọng của hệ thống.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Hàm createForm dùng để tạo bản ghi hoặc tài nguyên mới sau khi kiểm tra đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function createForm({ method = 'post', ignored = false } = {}) {
  return {
    isConnected: true,
    method,
    // Hàm getAttribute dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
    getAttribute(name) {
      return name === 'method' ? method : null;
    },
    // Hàm matches dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
    matches(selector) {
      return ignored && selector.includes('[data-question-filter]');
    }
  };
}

// Hàm loadDirtyGuard dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function loadDirtyGuard() {
  const documentListeners = new Map();
  const windowListeners = new Map();
  let confirmResult = false;
  const document = {
    body: {
      classList: {
        // Hàm contains dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
        contains(name) {
          return name === 'admin-body';
        }
      }
    },
    // Hàm addEventListener dùng để tạo bản ghi hoặc tài nguyên mới sau khi kiểm tra đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
    addEventListener(type, listener) {
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (!documentListeners.has(type)) documentListeners.set(type, []);
      documentListeners.get(type).push(listener);
    },
    // Hàm getElementById dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
    getElementById() {
      return null;
    },
    // Hàm querySelector dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
    querySelector() {
      return null;
    }
  };
  const window = {
    AppUI: {
      // Hàm confirm dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
      async confirm() {
        return confirmResult;
      }
    },
    // Hàm addEventListener dùng để tạo bản ghi hoặc tài nguyên mới sau khi kiểm tra đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
    addEventListener(type, listener) {
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (!windowListeners.has(type)) windowListeners.set(type, []);
      windowListeners.get(type).push(listener);
    },
    // Hàm setTimeout dùng để cập nhật trạng thái hoặc dữ liệu theo quy tắc nghiệp vụ; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
    setTimeout(callback) {
      callback();
    }
  };
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'js', 'admin', 'common.js'),
    'utf8'
  );

  vm.runInNewContext(source, { document, window });
  documentListeners.get('DOMContentLoaded').forEach((listener) => listener());

  return {
    api: window.AdminDirtyForms,
    // Hàm dispatch dùng để cập nhật trạng thái hoặc dữ liệu theo quy tắc nghiệp vụ; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
    dispatch(type, event) {
      (documentListeners.get(type) || []).forEach((listener) => listener(event));
    },
    // Hàm dispatchWindow dùng để cập nhật trạng thái hoặc dữ liệu theo quy tắc nghiệp vụ; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
    dispatchWindow(type, event) {
      (windowListeners.get(type) || []).forEach((listener) => listener(event));
    },
    // Hàm setConfirmResult dùng để cập nhật trạng thái hoặc dữ liệu theo quy tắc nghiệp vụ; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
    setConfirmResult(value) {
      confirmResult = value;
    }
  };
}

// Hàm inputEvent dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function inputEvent(form) {
  return {
    target: {
      // Hàm closest dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
      closest(selector) {
        return selector === 'form' ? form : null;
      }
    }
  };
}

test('dirty registry theo dõi từng form và submit form này không xóa form khác', () => {
  const guard = loadDirtyGuard();
  const first = createForm();
  const second = createForm();
  const firstRoot = { contains: (form) => form === first };
  const secondRoot = { contains: (form) => form === second };

  guard.dispatch('input', inputEvent(first));
  guard.dispatch('change', inputEvent(second));
  assert.equal(guard.api.hasDirty(firstRoot), true);
  assert.equal(guard.api.hasDirty(secondRoot), true);

  guard.dispatch('submit', { target: first, defaultPrevented: false });
  assert.equal(guard.api.hasDirty(firstRoot), false);
  assert.equal(guard.api.hasDirty(secondRoot), true);

  guard.dispatch('submit', { target: second, defaultPrevented: true });
  assert.equal(guard.api.hasDirty(secondRoot), true);
});

test('confirmDiscard chỉ xóa form trong vùng được xác nhận và giữ dữ liệu khi hủy', async () => {
  const guard = loadDirtyGuard();
  const first = createForm();
  const second = createForm();
  const firstRoot = { contains: (form) => form === first };
  const secondRoot = { contains: (form) => form === second };

  guard.dispatch('input', inputEvent(first));
  guard.dispatch('input', inputEvent(second));

  guard.setConfirmResult(false);
  assert.equal(await guard.api.confirmDiscard(firstRoot), false);
  assert.equal(guard.api.hasDirty(firstRoot), true);

  guard.setConfirmResult(true);
  assert.equal(await guard.api.confirmDiscard(firstRoot), true);
  assert.equal(guard.api.hasDirty(firstRoot), false);
  assert.equal(guard.api.hasDirty(secondRoot), true);
});

test('form GET, bộ lọc và form đã reset không tạo cảnh báo rời trang', () => {
  const guard = loadDirtyGuard();
  const getForm = createForm({ method: 'get' });
  const filterForm = createForm({ ignored: true });
  const editForm = createForm();

  guard.dispatch('input', inputEvent(getForm));
  guard.dispatch('input', inputEvent(filterForm));
  assert.equal(guard.api.hasDirty(), false);

  guard.dispatch('input', inputEvent(editForm));
  guard.dispatch('reset', { target: editForm, defaultPrevented: false });
  assert.equal(guard.api.hasDirty(), false);

  const unloadEvent = {
    prevented: false,
    // Hàm preventDefault dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
    preventDefault() {
      this.prevented = true;
    },
    returnValue: undefined
  };
  guard.dispatchWindow('beforeunload', unloadEvent);
  assert.equal(unloadEvent.prevented, false);
});
