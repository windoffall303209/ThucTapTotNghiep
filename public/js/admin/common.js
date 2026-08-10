// M? JavaScript ph?a tr?nh duy?t common ?i?u khi?n t??ng t?c v? c?p nh?t giao di?n ng??i d?ng.
(function () {
  const dirtyForms = new Set();
  let dirtyGuardReady = false;

  // H?m isTrackableForm d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  function isTrackableForm(form) {
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!form || form.matches?.('[data-dirty-guard="ignore"], [data-question-filter]')) return false;
    const method = String(form.getAttribute?.('method') || form.method || 'get').toLowerCase();
    return method !== 'get';
  }

  // H?m pruneDirtyForms d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  function pruneDirtyForms() {
    dirtyForms.forEach((form) => {
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (!form.isConnected) dirtyForms.delete(form);
    });
  }

  // H?m markDirty d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  function markDirty(form) {
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (isTrackableForm(form)) dirtyForms.add(form);
  }

  // H?m clearDirty d?ng ?? x?a ho?c gi?i ph?ng t?i nguy?n theo ?i?u ki?n an to?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  function clearDirty(form) {
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (form) dirtyForms.delete(form);
  }

  // H?m dirtyFormsWithin d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  function dirtyFormsWithin(root = document) {
    pruneDirtyForms();
    return Array.from(dirtyForms).filter((form) =>
      root === document || (typeof root?.contains === 'function' && root.contains(form))
    );
  }

  // H?m hasDirty d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  function hasDirty(root = document) {
    return dirtyFormsWithin(root).length > 0;
  }

  // H?m confirmDiscard d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  async function confirmDiscard(root = document, options = {}) {
    const forms = dirtyFormsWithin(root);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (forms.length === 0) return true;

    const showConfirm = window.AppUI?.confirm;
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
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
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (confirmed) forms.forEach(clearDirty);
    return Boolean(confirmed);
  }

  window.AdminDirtyForms = {
    clear: clearDirty,
    // H?m clearWithin d?ng ?? x?a ho?c gi?i ph?ng t?i nguy?n theo ?i?u ki?n an to?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
    clearWithin(root = document) {
      dirtyFormsWithin(root).forEach(clearDirty);
    },
    confirmDiscard,
    hasDirty,
    mark: markDirty
  };

  // H?m initAdminDirtyGuard d?ng ?? kh?i t?o tr?ng th?i v? c?c ph? thu?c c?n thi?t; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  function initAdminDirtyGuard() {
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
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
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (!event.defaultPrevented) clearDirty(form);
      }, 0);
    });

    window.addEventListener('beforeunload', (event) => {
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (!hasDirty()) return;
      event.preventDefault();
      event.returnValue = '';
    });
  }

  // H?m initAdminMenu d?ng ?? kh?i t?o tr?ng th?i v? c?c ph? thu?c c?n thi?t; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  function initAdminMenu() {
    const body = document.body;
    const toggle = document.querySelector('[data-admin-menu-toggle]');
    const sidebar = document.getElementById('adminSidebar');
    const backdrop = document.querySelector('[data-admin-sidebar-backdrop]');
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!body.classList.contains('admin-body') || !toggle || !sidebar || !backdrop) return;

    const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])';
    const desktopMedia = window.matchMedia('(min-width: 921px)');
    let lastFocused = null;

    // H?m syncSidebarAccessibility d?ng ?? ??ng b? d? li?u gi?a c?c ??nh d?ng ho?c ngu?n kh?c nhau; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
    const syncSidebarAccessibility = () => {
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (desktopMedia.matches) {
        sidebar.removeAttribute('aria-hidden');
        sidebar.inert = false;
        return;
      }
      const isOpen = body.classList.contains('admin-menu-open');
      sidebar.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
      sidebar.inert = !isOpen;
    };

    // H?m closeMenu d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
    const closeMenu = ({ restoreFocus = true } = {}) => {
      body.classList.remove('admin-menu-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Mở menu quản trị');
      backdrop.hidden = true;
      syncSidebarAccessibility();
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (restoreFocus && lastFocused) lastFocused.focus();
    };

    // H?m openMenu d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
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
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (body.classList.contains('admin-menu-open')) closeMenu();
      // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
      else openMenu();
    });

    backdrop.addEventListener('click', () => closeMenu());
    sidebar.querySelectorAll('a[href]').forEach((link) => {
      link.addEventListener('click', () => closeMenu({ restoreFocus: false }));
    });

    document.addEventListener('keydown', (event) => {
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (!body.classList.contains('admin-menu-open')) return;

      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMenu();
        return;
      }

      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (event.key !== 'Tab') return;
      const focusable = Array.from(sidebar.querySelectorAll(focusableSelector));
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    desktopMedia.addEventListener('change', (event) => {
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (event.matches) closeMenu({ restoreFocus: false });
      // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
      else syncSidebarAccessibility();
    });
    syncSidebarAccessibility();
  }

  document.addEventListener('DOMContentLoaded', () => {
    initAdminDirtyGuard();
    initAdminMenu();
  });
})();
