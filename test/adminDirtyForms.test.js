const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createForm({ method = 'post', ignored = false } = {}) {
  return {
    isConnected: true,
    method,
    getAttribute(name) {
      return name === 'method' ? method : null;
    },
    matches(selector) {
      return ignored && selector.includes('[data-question-filter]');
    }
  };
}

function loadDirtyGuard() {
  const documentListeners = new Map();
  const windowListeners = new Map();
  let confirmResult = false;
  const document = {
    body: {
      classList: {
        contains(name) {
          return name === 'admin-body';
        }
      }
    },
    addEventListener(type, listener) {
      if (!documentListeners.has(type)) documentListeners.set(type, []);
      documentListeners.get(type).push(listener);
    },
    getElementById() {
      return null;
    },
    querySelector() {
      return null;
    }
  };
  const window = {
    AppUI: {
      async confirm() {
        return confirmResult;
      }
    },
    addEventListener(type, listener) {
      if (!windowListeners.has(type)) windowListeners.set(type, []);
      windowListeners.get(type).push(listener);
    },
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
    dispatch(type, event) {
      (documentListeners.get(type) || []).forEach((listener) => listener(event));
    },
    dispatchWindow(type, event) {
      (windowListeners.get(type) || []).forEach((listener) => listener(event));
    },
    setConfirmResult(value) {
      confirmResult = value;
    }
  };
}

function inputEvent(form) {
  return {
    target: {
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
    preventDefault() {
      this.prevented = true;
    },
    returnValue: undefined
  };
  guard.dispatchWindow('beforeunload', unloadEvent);
  assert.equal(unloadEvent.prevented, false);
});
