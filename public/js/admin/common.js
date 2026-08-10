// Mã JavaScript phía trình duyệt common điều khiển tương tác và cập nhật giao diện người dùng.
(function () {
  const dirtyForms = new Set();
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
      if (!form.isConnected) dirtyForms.delete(form);
    });
  }

  // Hàm markDirty dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function markDirty(form) {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (isTrackableForm(form)) dirtyForms.add(form);
  }

  // Hàm clearDirty dùng để xóa hoặc giải phóng tài nguyên theo điều kiện an toàn; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function clearDirty(form) {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (form) dirtyForms.delete(form);
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

    document.addEventListener('input', (event) => {
      markDirty(event.target.closest?.('form'));
    });

    document.addEventListener('change', (event) => {
      markDirty(event.target.closest?.('form'));
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

  document.addEventListener('DOMContentLoaded', () => {
    initAdminDirtyGuard();
    initAdminMenu();
  });
})();
