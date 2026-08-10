// B? ki?m th? admin dirty forms.test x?c minh h?nh vi v? c?c ?i?u ki?n bi?n quan tr?ng c?a h? th?ng.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// H?m createForm d?ng ?? t?o b?n ghi ho?c t?i nguy?n m?i sau khi ki?m tra ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function createForm({ method = 'post', ignored = false } = {}) {
  return {
    isConnected: true,
    method,
    // H?m getAttribute d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
    getAttribute(name) {
      return name === 'method' ? method : null;
    },
    // H?m matches d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
    matches(selector) {
      return ignored && selector.includes('[data-question-filter]');
    }
  };
}

// H?m loadDirtyGuard d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function loadDirtyGuard() {
  const documentListeners = new Map();
  const windowListeners = new Map();
  let confirmResult = false;
  const document = {
    body: {
      classList: {
        // H?m contains d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
        contains(name) {
          return name === 'admin-body';
        }
      }
    },
    // H?m addEventListener d?ng ?? t?o b?n ghi ho?c t?i nguy?n m?i sau khi ki?m tra ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
    addEventListener(type, listener) {
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (!documentListeners.has(type)) documentListeners.set(type, []);
      documentListeners.get(type).push(listener);
    },
    // H?m getElementById d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
    getElementById() {
      return null;
    },
    // H?m querySelector d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
    querySelector() {
      return null;
    }
  };
  const window = {
    AppUI: {
      // H?m confirm d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
      async confirm() {
        return confirmResult;
      }
    },
    // H?m addEventListener d?ng ?? t?o b?n ghi ho?c t?i nguy?n m?i sau khi ki?m tra ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
    addEventListener(type, listener) {
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (!windowListeners.has(type)) windowListeners.set(type, []);
      windowListeners.get(type).push(listener);
    },
    // H?m setTimeout d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
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
    // H?m dispatch d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
    dispatch(type, event) {
      (documentListeners.get(type) || []).forEach((listener) => listener(event));
    },
    // H?m dispatchWindow d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
    dispatchWindow(type, event) {
      (windowListeners.get(type) || []).forEach((listener) => listener(event));
    },
    // H?m setConfirmResult d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
    setConfirmResult(value) {
      confirmResult = value;
    }
  };
}

// H?m inputEvent d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function inputEvent(form) {
  return {
    target: {
      // H?m closest d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
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
    // H?m preventDefault d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
    preventDefault() {
      this.prevented = true;
    },
    returnValue: undefined
  };
  guard.dispatchWindow('beforeunload', unloadEvent);
  assert.equal(unloadEvent.prevented, false);
});
