(function () {
  document.addEventListener('DOMContentLoaded', initSettingsCards);

  function initSettingsCards() {
    const cards = Array.from(document.querySelectorAll('[data-settings-target]'));
    const modals = Array.from(document.querySelectorAll('[data-settings-modal]'));
    if (cards.length === 0 || modals.length === 0) return;
  
    const activateCard = (card) => {
      const target = card.dataset.settingsTarget;
      cards.forEach((item) => item.classList.toggle('active', item === card));
    };
  
    cards.forEach((card) => {
      card.addEventListener('click', () => {
        const modal = modals.find((item) => item.dataset.settingsModal === card.dataset.settingsTarget);
        if (!modal) return;
        activateCard(card);
        if (typeof modal.showModal === 'function') {
          modal.showModal();
        } else {
          modal.setAttribute('open', '');
        }
      });
    });
  
    const activeCard = cards.find((card) => card.classList.contains('active')) || cards[0];
    activateCard(activeCard);
  
    modals.forEach((modal) => {
      modal.querySelectorAll('[data-modal-close]').forEach((button) => {
        button.addEventListener('click', () => modal.close());
      });
      modal.addEventListener('click', (event) => {
        if (event.target === modal) modal.close();
      });
    });
  
    initModelSelectors();
    initApiChecks();
  }
  
  function initModelSelectors() {
    document.querySelectorAll('[data-model-select]').forEach((select) => {
      const form = select.closest('form') || document;
      const input = form.querySelector(`[data-model-input="${select.dataset.modelSelect}"]`);
      if (!input) return;
  
      select.addEventListener('change', () => {
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
  
  function initApiChecks() {
    document.querySelectorAll('[data-check-provider]').forEach((button) => {
      button.addEventListener('click', async () => {
        const form = button.closest('form');
        const status = form?.querySelector('[data-check-status]');
        if (!form || !status) return;
  
        const originalHtml = button.innerHTML;
        const payload = Object.fromEntries(new FormData(form).entries());
        payload.provider = button.dataset.checkProvider;
  
        button.disabled = true;
        button.textContent = 'Đang check...';
        status.hidden = false;
        status.className = 'api-check-status';
        status.textContent = 'Đang kiểm tra kết nối...';
  
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

  function refreshIcons() {
    if (window.lucide) window.lucide.createIcons();
  }
})();
