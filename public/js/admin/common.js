(function () {
  function initAdminDirtyGuard() {
    if (!document.body.classList.contains('admin-body')) return;

    let dirty = false;

    document.addEventListener('input', (event) => {
      if (event.target.closest('form')) dirty = true;
    });

    document.addEventListener('submit', () => {
      dirty = false;
    });

    window.addEventListener('beforeunload', (event) => {
      if (!dirty) return;
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
    let lastFocused = null;

    const closeMenu = ({ restoreFocus = true } = {}) => {
      body.classList.remove('admin-menu-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Mở menu quản trị');
      backdrop.hidden = true;
      if (restoreFocus && lastFocused) lastFocused.focus();
    };

    const openMenu = () => {
      lastFocused = document.activeElement;
      body.classList.add('admin-menu-open');
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', 'Đóng menu quản trị');
      backdrop.hidden = false;
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

    window.matchMedia('(min-width: 921px)').addEventListener('change', (event) => {
      if (event.matches) closeMenu({ restoreFocus: false });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initAdminDirtyGuard();
    initAdminMenu();
  });
})();
