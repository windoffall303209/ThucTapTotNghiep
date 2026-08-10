// M? JavaScript ph?a tr?nh duy?t settings ?i?u khi?n t??ng t?c v? c?p nh?t giao di?n ng??i d?ng.
(function () {
  document.addEventListener('DOMContentLoaded', initSettingsCards);

  // H?m initSettingsCards d?ng ?? kh?i t?o tr?ng th?i v? c?c ph? thu?c c?n thi?t; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  function initSettingsCards() {
    const cards = Array.from(document.querySelectorAll('[data-settings-target]'));
    const modals = Array.from(document.querySelectorAll('[data-settings-modal]'));
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (cards.length === 0 || modals.length === 0) return;
    const returnFocusByModal = new WeakMap();
  
    // H?m activateCard d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
    const activateCard = (card) => {
      const target = card.dataset.settingsTarget;
      cards.forEach((item) => item.classList.toggle('active', item === card));
    };
  
    cards.forEach((card) => {
      card.addEventListener('click', () => {
        const modal = modals.find((item) => item.dataset.settingsModal === card.dataset.settingsTarget);
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (!modal) return;
        activateCard(card);
        returnFocusByModal.set(modal, card);
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (typeof modal.showModal === 'function') {
          modal.showModal();
        } else {
          modal.setAttribute('open', '');
        }
        window.setTimeout(() => {
          modal.querySelector(
            'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])'
          )?.focus();
        }, 0);
      });
    });
  
    const activeCard = cards.find((card) => card.classList.contains('active')) || cards[0];
    activateCard(activeCard);

    modals.forEach((modal) => {
      // H?m restoreModalFocus d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
      const restoreModalFocus = () => {
        const returnTarget = returnFocusByModal.get(modal);
        returnFocusByModal.delete(modal);
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (returnTarget?.isConnected) returnTarget.focus();
      };
      // H?m closeModal d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
      const closeModal = async () => {
        const form = modal.querySelector('form');
        const canClose = typeof window.AdminDirtyForms?.confirmDiscard === 'function'
          ? await window.AdminDirtyForms.confirmDiscard(form || modal, {
              message: 'Cửa sổ cài đặt có thay đổi chưa lưu. Bạn có chắc muốn hủy các thay đổi này?'
            })
          : true;
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (!canClose) return;
        form?.reset();
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (typeof modal.close === 'function') modal.close();
        // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
        else {
          modal.removeAttribute('open');
          restoreModalFocus();
        }
      };

      modal.querySelectorAll('[data-modal-close]').forEach((button) => {
        button.addEventListener('click', closeModal);
      });
      modal.addEventListener('click', (event) => {
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (event.target === modal) closeModal();
      });
      modal.addEventListener('cancel', (event) => {
        event.preventDefault();
        closeModal();
      });
      modal.addEventListener('close', restoreModalFocus);
    });
  
    initModelSelectors();
    initApiChecks();
  }
  
  // H?m initModelSelectors d?ng ?? kh?i t?o tr?ng th?i v? c?c ph? thu?c c?n thi?t; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  function initModelSelectors() {
    document.querySelectorAll('[data-model-select]').forEach((select) => {
      const form = select.closest('form') || document;
      const input = form.querySelector(`[data-model-input="${select.dataset.modelSelect}"]`);
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (!input) return;
  
      select.addEventListener('change', () => {
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (select.value !== '__custom__') {
          input.value = select.value;
        }
      });
  
      input.addEventListener('input', () => {
        const option = Array.from(select.options).find((item) => item.value === input.value);
        select.value = option ? option.value : '__custom__';
      });
    });
  }
  
  // H?m initApiChecks d?ng ?? ki?m tra t?nh h?p l? v? c?c ?i?u ki?n an to?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  function initApiChecks() {
    document.querySelectorAll('[data-check-provider]').forEach((button) => {
      button.addEventListener('click', async () => {
        const form = button.closest('form');
        const status = form?.querySelector('[data-check-status]');
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (!form || !status) return;
  
        const originalHtml = button.innerHTML;
        const payload = Object.fromEntries(new FormData(form).entries());
        payload.provider = button.dataset.checkProvider;
  
        button.disabled = true;
        button.textContent = 'Đang check...';
        status.hidden = false;
        status.className = 'api-check-status';
        status.textContent = 'Đang kiểm tra kết nối...';
  
        // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
        try {
          const response = await fetch('/admin/settings/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const result = await response.json();
          status.classList.add(result.ok ? 'success' : 'danger');
          status.textContent = result.message || (response.ok ? 'Kết nối thành công.' : 'Kiểm tra thất bại.');
        } catch (error) {
          status.classList.add('danger');
          status.textContent = 'Không gọi được endpoint kiểm tra API.';
        } finally {
          button.disabled = false;
          button.innerHTML = originalHtml;
          refreshIcons();
        }
      });
    });
  }

  // H?m refreshIcons d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  function refreshIcons() {
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (window.lucide) window.lucide.createIcons();
  }
})();
