(function () {
  const dirtyForms = new Set();
  let dirtyGuardReady = false;

  function isTrackableForm(form) {
    if (!form || form.matches?.('[data-dirty-guard="ignore"], [data-question-filter]')) return false;
    const method = String(form.getAttribute?.('method') || form.method || 'get').toLowerCase();
    return method !== 'get';
  }

  function pruneDirtyForms() {
    dirtyForms.forEach((form) => {
      if (!form.isConnected) dirtyForms.delete(form);
    });
  }

  function markDirty(form) {
    if (isTrackableForm(form)) dirtyForms.add(form);
  }

  function clearDirty(form) {
    if (form) dirtyForms.delete(form);
  }

  function dirtyFormsWithin(root = document) {
    pruneDirtyForms();
    return Array.from(dirtyForms).filter((form) =>
      root === document || (typeof root?.contains === 'function' && root.contains(form))
    );
  }

  function hasDirty(root = document) {
    return dirtyFormsWithin(root).length > 0;
  }

  async function confirmDiscard(root = document, options = {}) {
    const forms = dirtyFormsWithin(root);
    if (forms.length === 0) return true;

    const showConfirm = window.AppUI?.confirm;
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
    if (confirmed) forms.forEach(clearDirty);
    return Boolean(confirmed);
  }

  window.AdminDirtyForms = {
    clear: clearDirty,
    clearWithin(root = document) {
      dirtyFormsWithin(root).forEach(clearDirty);
    },
    confirmDiscard,
    hasDirty,
    mark: markDirty
  };

  function initAdminDirtyGuard() {
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
        if (!event.defaultPrevented) clearDirty(form);
      }, 0);
    });

    window.addEventListener('beforeunload', (event) => {
      if (!hasDirty()) return;
      event.preventDefault();
      event.returnValue = '';
    });
  }

  function initAdminMenu() {
    const body = document.body;
    const toggle = document.querySelector('[data-admin-menu-toggle]');
    const sidebar = document.getElementById('adminSidebar');
    const backdrop = document.querySelector('[data-admin-sidebar-backdrop]');
    if (!body.classList.contains('admin-body') || !toggle || !sidebar || !backdrop) return;

    const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])';
    const desktopMedia = window.matchMedia('(min-width: 921px)');
    let lastFocused = null;

    const syncSidebarAccessibility = () => {
      if (desktopMedia.matches) {
        sidebar.removeAttribute('aria-hidden');
        sidebar.inert = false;
        return;
      }
      const isOpen = body.classList.contains('admin-menu-open');
      sidebar.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
      sidebar.inert = !isOpen;
    };

    const closeMenu = ({ restoreFocus = true } = {}) => {
      body.classList.remove('admin-menu-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Mở menu quản trị');
      backdrop.hidden = true;
      syncSidebarAccessibility();
      if (restoreFocus && lastFocused) lastFocused.focus();
    };

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
      if (body.classList.contains('admin-menu-open')) closeMenu();
      else openMenu();
    });

    backdrop.addEventListener('click', () => closeMenu());
    sidebar.querySelectorAll('a[href]').forEach((link) => {
      link.addEventListener('click', () => closeMenu({ restoreFocus: false }));
    });

    document.addEventListener('keydown', (event) => {
      if (!body.classList.contains('admin-menu-open')) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        closeMenu();
        return;
      }

      if (event.key !== 'Tab') return;
      const focusable = Array.from(sidebar.querySelectorAll(focusableSelector));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    desktopMedia.addEventListener('change', (event) => {
      if (event.matches) closeMenu({ restoreFocus: false });
      else syncSidebarAccessibility();
    });
    syncSidebarAccessibility();
  }

  document.addEventListener('DOMContentLoaded', () => {
    initAdminDirtyGuard();
    initAdminMenu();
  });
})();
