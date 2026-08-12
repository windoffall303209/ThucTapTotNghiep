// Mã JavaScript phía trình duyệt common điều khiển tương tác và cập nhật giao diện người dùng.
(function () {
  const dirtyForms = new Set();
  const userInteractedForms = new WeakSet();
  const cleanFormSnapshots = new WeakMap();
  const directTextEdits = new WeakSet();
  let dirtyGuardReady = false;

  // Hàm isTrackableForm dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function isTrackableForm(form) {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!form || form.matches?.('[data-dirty-guard="ignore"], [data-question-filter]')) return false;
    const method = String(form.getAttribute?.('method') || form.method || 'get').toLowerCase();
    return method !== 'get';
  }

  // Hàm pruneDirtyForms dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function pruneDirtyForms() {
    dirtyForms.forEach((form) => {
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (!form.isConnected) {
        dirtyForms.delete(form);
        cleanFormSnapshots.delete(form);
        userInteractedForms.delete(form);
        return;
      }
      const cleanSnapshot = cleanFormSnapshots.get(form);
      if (cleanSnapshot != null && cleanSnapshot === formSnapshot(form)) dirtyForms.delete(form);
    });
  }

  function formSnapshot(form) {
    return Array.from(form?.elements || [])
      .filter((control) => control?.name && !control.disabled)
      .map((control) => {
        const type = String(control.type || '').toLowerCase();
        if (['button', 'submit', 'reset', 'image'].includes(type)) return null;
        if (type === 'checkbox' || type === 'radio') {
          return [control.name, type, Boolean(control.checked), String(control.value || '')];
        }
        if (type === 'file') {
          return [
            control.name,
            type,
            Array.from(control.files || []).map((file) => [file.name, file.size, file.lastModified])
          ];
        }
        if (control.multiple && control.options) {
          return [
            control.name,
            type,
            Array.from(control.options).filter((option) => option.selected).map((option) => option.value)
          ];
        }
        return [control.name, type, String(control.value ?? '')];
      })
      .filter(Boolean)
      .map((entry) => JSON.stringify(entry))
      .join('\n');
  }

  function rememberCleanSnapshot(form) {
    if (isTrackableForm(form) && !cleanFormSnapshots.has(form)) {
      cleanFormSnapshots.set(form, formSnapshot(form));
    }
  }

  // Hàm markDirty dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function markDirty(form) {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (isTrackableForm(form)) dirtyForms.add(form);
  }

  // Hàm clearDirty dùng để xóa hoặc giải phóng tài nguyên theo điều kiện an toàn; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function clearDirty(form) {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (form) {
      dirtyForms.delete(form);
      cleanFormSnapshots.delete(form);
      userInteractedForms.delete(form);
    }
  }

  // Hàm dirtyFormsWithin dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function dirtyFormsWithin(root = document) {
    pruneDirtyForms();
    return Array.from(dirtyForms).filter((form) =>
      root === document || (typeof root?.contains === 'function' && root.contains(form))
    );
  }

  // Hàm hasDirty dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function hasDirty(root = document) {
    return dirtyFormsWithin(root).length > 0;
  }

  // Hàm confirmDiscard dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  async function confirmDiscard(root = document, options = {}) {
    const forms = dirtyFormsWithin(root);
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (forms.length === 0) return true;

    const showConfirm = window.AppUI?.confirm;
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (typeof showConfirm !== 'function') return false;
    const confirmed = await showConfirm({
      title: options.title || 'Bỏ thay đổi chưa lưu?',
      message: options.message || (
        forms.length === 1
          ? 'Biểu mẫu này có thay đổi chưa được lưu. Nếu tiếp tục, các thay đổi sẽ bị mất.'
          : `Có ${forms.length} biểu mẫu chưa được lưu. Nếu tiếp tục, các thay đổi sẽ bị mất.`
      ),
      tone: 'warning',
      confirmLabel: options.confirmLabel || 'Bỏ thay đổi',
      cancelLabel: options.cancelLabel || 'Tiếp tục chỉnh sửa'
    });
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (confirmed) forms.forEach(clearDirty);
    return Boolean(confirmed);
  }

  window.AdminDirtyForms = {
    clear: clearDirty,
    // Hàm clearWithin dùng để xóa hoặc giải phóng tài nguyên theo điều kiện an toàn; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
    clearWithin(root = document) {
      dirtyFormsWithin(root).forEach(clearDirty);
    },
    confirmDiscard,
    hasDirty,
    mark: markDirty
  };

  // Hàm initAdminDirtyGuard dùng để khởi tạo trạng thái và các phụ thuộc cần thiết; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function initAdminDirtyGuard() {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!document.body.classList.contains('admin-body') || dirtyGuardReady) return;
    dirtyGuardReady = true;

    const rememberUserInteraction = (event) => {
      if (event.isTrusted === false) return;
      const form = event.target.closest?.('form');
      if (isTrackableForm(form)) {
        rememberCleanSnapshot(form);
        userInteractedForms.add(form);
      }
    };

    const markFromUserEdit = (event) => {
      if (event.isTrusted === false) return;
      const form = event.target.closest?.('form');
      if (!form || !userInteractedForms.has(form)) return;
      rememberCleanSnapshot(form);
      if (formSnapshot(form) === cleanFormSnapshots.get(form)) dirtyForms.delete(form);
      else markDirty(form);
    };

    const isTextEntryControl = (target) => {
      const tagName = String(target?.tagName || '').toLowerCase();
      if (tagName === 'textarea' || target?.isContentEditable) return true;
      if (tagName !== 'input') return false;
      const type = String(target.type || 'text').toLowerCase();
      return ['text', 'password', 'email', 'url', 'search', 'tel', 'number'].includes(type);
    };

    document.addEventListener('beforeinput', (event) => {
      if (event.isTrusted === false || !isTextEntryControl(event.target)) return;
      const form = event.target.closest?.('form');
      if (!isTrackableForm(form)) return;
      rememberCleanSnapshot(form);
      userInteractedForms.add(form);
      directTextEdits.add(event.target);
    });

    // Chỉ một thao tác chuột/bàn phím thật bên trong form mới mở quyền đánh dấu dirty.
    // Autofill, khôi phục form của trình duyệt và event do mã khởi tạo phát ra không được
    // làm xuất hiện cảnh báo rời trang khi quản trị viên chưa chỉnh sửa gì.
    document.addEventListener('pointerdown', rememberUserInteraction, true);
    document.addEventListener('keydown', rememberUserInteraction, true);
    document.addEventListener('click', rememberUserInteraction, true);

    document.addEventListener('input', (event) => {
      // Chrome/password manager có thể phát input khi focus một ô secret dù người
      // dùng chưa gõ. Thao tác gõ/xóa/dán thật luôn đi qua beforeinput trước đó.
      if (isTextEntryControl(event.target) && !directTextEdits.has(event.target)) return;
      markFromUserEdit(event);
      directTextEdits.delete(event.target);
    });

    document.addEventListener('change', (event) => {
      // Text input đã được xử lý ở sự kiện input. Bỏ change lúc blur để autofill
      // hoặc password manager không tạo cảnh báo rời trang giả.
      if (isTextEntryControl(event.target)) return;
      markFromUserEdit(event);
    });

    document.addEventListener('submit', (event) => {
      // Form có validation hoặc dialog xác nhận gọi preventDefault() vẫn còn dữ liệu chưa lưu.
      // Chỉ form thực sự được gửi mới được xóa khỏi registry; các form khác giữ nguyên.
      if (!event.defaultPrevented) clearDirty(event.target);
    });

    document.addEventListener('reset', (event) => {
      const form = event.target;
      window.setTimeout(() => {
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (!event.defaultPrevented) clearDirty(form);
      }, 0);
    });

    window.addEventListener('beforeunload', (event) => {
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (!hasDirty()) return;
      event.preventDefault();
      event.returnValue = '';
    });
  }

  // Hàm initAdminMenu dùng để khởi tạo trạng thái và các phụ thuộc cần thiết; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function initAdminMenu() {
    const body = document.body;
    const toggle = document.querySelector('[data-admin-menu-toggle]');
    const sidebar = document.getElementById('adminSidebar');
    const backdrop = document.querySelector('[data-admin-sidebar-backdrop]');
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!body.classList.contains('admin-body') || !toggle || !sidebar || !backdrop) return;

    const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])';
    const desktopMedia = window.matchMedia('(min-width: 921px)');
    let lastFocused = null;

    // Hàm syncSidebarAccessibility dùng để đồng bộ dữ liệu giữa các định dạng hoặc nguồn khác nhau; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
    const syncSidebarAccessibility = () => {
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (desktopMedia.matches) {
        sidebar.removeAttribute('aria-hidden');
        sidebar.inert = false;
        return;
      }
      const isOpen = body.classList.contains('admin-menu-open');
      sidebar.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
      sidebar.inert = !isOpen;
    };

    // Hàm closeMenu dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
    const closeMenu = ({ restoreFocus = true } = {}) => {
      body.classList.remove('admin-menu-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Mở menu quản trị');
      backdrop.hidden = true;
      syncSidebarAccessibility();
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (restoreFocus && lastFocused) lastFocused.focus();
    };

    // Hàm openMenu dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
    const openMenu = () => {
      lastFocused = document.activeElement;
      body.classList.add('admin-menu-open');
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', 'Đóng menu quản trị');
      backdrop.hidden = false;
      syncSidebarAccessibility();
      sidebar.querySelector(focusableSelector)?.focus();
    };

    toggle.addEventListener('click', () => {
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (body.classList.contains('admin-menu-open')) closeMenu();
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      else openMenu();
    });

    backdrop.addEventListener('click', () => closeMenu());
    sidebar.querySelectorAll('a[href]').forEach((link) => {
      link.addEventListener('click', () => closeMenu({ restoreFocus: false }));
    });

    document.addEventListener('keydown', (event) => {
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (!body.classList.contains('admin-menu-open')) return;

      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMenu();
        return;
      }

      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (event.key !== 'Tab') return;
      const focusable = Array.from(sidebar.querySelectorAll(focusableSelector));
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    desktopMedia.addEventListener('change', (event) => {
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (event.matches) closeMenu({ restoreFocus: false });
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      else syncSidebarAccessibility();
    });
    syncSidebarAccessibility();
  }

  function initAdminPasswordForms(root = document) {
    if (typeof root?.querySelectorAll !== 'function') return;
    root.querySelectorAll('form[data-password-match-form]:not([data-password-validation-ready])').forEach((form) => {
      const password = form.querySelector('[data-password-primary]');
      const confirm = form.querySelector('[data-password-confirm]');
      if (!password || !confirm) return;
      form.dataset.passwordValidationReady = 'true';

      const validate = () => {
        const value = password.value;
        const isStrong = value.length >= 10
          && !/\s/u.test(value)
          && /\p{Ll}/u.test(value)
          && /\p{Lu}/u.test(value)
          && /\p{N}/u.test(value)
          && /[\p{P}\p{S}]/u.test(value);
        password.setCustomValidity(
          value && !isStrong
            ? 'Mật khẩu cần ít nhất 10 ký tự, gồm chữ hoa, chữ thường, chữ số và ký tự đặc biệt; không có khoảng trắng.'
            : ''
        );
        confirm.setCustomValidity(
          confirm.value && value !== confirm.value ? 'Hai mật khẩu chưa trùng khớp.' : ''
        );
      };
      password.addEventListener('input', validate);
      confirm.addEventListener('input', validate);
      form.addEventListener('submit', validate);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initAdminDirtyGuard();
    initAdminMenu();
    initAdminPasswordForms();
  });
})();
