// Mã JavaScript phía trình duyệt settings điều khiển tương tác và cập nhật giao diện người dùng.
(function () {
  document.addEventListener('DOMContentLoaded', initSettingsCards);

  // Hàm initSettingsCards dùng để khởi tạo trạng thái và các phụ thuộc cần thiết; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function initSettingsCards() {
    const cards = Array.from(document.querySelectorAll('[data-settings-target]'));
    const modals = Array.from(document.querySelectorAll('[data-settings-modal]'));
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (cards.length === 0 || modals.length === 0) return;
    const returnFocusByModal = new WeakMap();
  
    // Hàm activateCard dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
    const activateCard = (card) => {
      const target = card.dataset.settingsTarget;
      cards.forEach((item) => item.classList.toggle('active', item === card));
    };
  
    cards.forEach((card) => {
      card.addEventListener('click', () => {
        const modal = modals.find((item) => item.dataset.settingsModal === card.dataset.settingsTarget);
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (!modal) return;
        activateCard(card);
        returnFocusByModal.set(modal, card);
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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
      // Hàm restoreModalFocus dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
      const restoreModalFocus = () => {
        const returnTarget = returnFocusByModal.get(modal);
        returnFocusByModal.delete(modal);
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (returnTarget?.isConnected) returnTarget.focus();
      };
      // Hàm closeModal dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
      const closeModal = async () => {
        const form = modal.querySelector('form');
        const canClose = typeof window.AdminDirtyForms?.confirmDiscard === 'function'
          ? await window.AdminDirtyForms.confirmDiscard(form || modal, {
              message: 'Cửa sổ cài đặt có thay đổi chưa lưu. Bạn có chắc muốn hủy các thay đổi này?'
            })
          : true;
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (!canClose) return;
        form?.reset();
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (typeof modal.close === 'function') modal.close();
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        else {
          modal.removeAttribute('open');
          restoreModalFocus();
        }
      };

      modal.querySelectorAll('[data-modal-close]').forEach((button) => {
        button.addEventListener('click', closeModal);
      });
      modal.addEventListener('click', (event) => {
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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
  
  // Hàm initModelSelectors dùng để khởi tạo trạng thái và các phụ thuộc cần thiết; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function initModelSelectors() {
    document.querySelectorAll('[data-model-select]').forEach((select) => {
      const form = select.closest('form') || document;
      const input = form.querySelector(`[data-model-input="${select.dataset.modelSelect}"]`);
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (!input) return;
  
      select.addEventListener('change', () => {
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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
  
  // Hàm initApiChecks dùng để kiểm tra tính hợp lệ và các điều kiện an toàn; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function initApiChecks() {
    document.querySelectorAll('[data-check-provider]').forEach((button) => {
      button.addEventListener('click', async () => {
        const form = button.closest('form');
        const status = form?.querySelector('[data-check-status]');
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (!form || !status) return;
  
        const originalHtml = button.innerHTML;
        const payload = Object.fromEntries(new FormData(form).entries());
        payload.provider = button.dataset.checkProvider;
  
        button.disabled = true;
        button.textContent = 'Đang check...';
        status.hidden = false;
        status.className = 'api-check-status';
        status.textContent = 'Đang kiểm tra kết nối...';
  
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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

  // Hàm refreshIcons dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function refreshIcons() {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (window.lucide) window.lucide.createIcons();
  }
})();
