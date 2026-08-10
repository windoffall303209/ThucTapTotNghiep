// M? JavaScript ph?a tr?nh duy?t exams ?i?u khi?n t??ng t?c v? c?p nh?t giao di?n ng??i d?ng.
(function () {
  // Form tạo đề gửi đi bằng POST rồi tải lại cả trang. Trong lúc chờ, học sinh
  // không thấy phản hồi nào nên hay bấm thêm lần nữa và tạo trùng đề.
  function initSubmitBusyForms() {
    document.querySelectorAll('[data-busy-form]').forEach((form) => {
      form.addEventListener('submit', (event) => {
        // Chặn bấm lần hai bằng cờ trên form. Tuyệt đối không dùng cách disable
        // nút submit: nút mang cặp name/value quyết định số câu, disable nó là
        // trình duyệt loại luôn giá trị đó khỏi dữ liệu gửi lên.
        if (form.dataset.submitting === 'true') {
          event.preventDefault();
          return;
        }
        form.dataset.submitting = 'true';
  
        const trigger = event.submitter
          || form.querySelector('button[type="submit"]:focus')
          || form.querySelector('button[type="submit"]');
  
        // Chỉ khóa các nút KHÁC nút vừa bấm. Nút vừa bấm luôn được giữ nguyên
        // trạng thái để giá trị của nó chắc chắn đi cùng request.
        form.querySelectorAll('button[type="submit"]').forEach((button) => {
          // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
          if (button !== trigger) button.disabled = true;
        });
  
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (trigger) {
          trigger.setAttribute('aria-busy', 'true');
          setButtonBusy(trigger, form.dataset.busyLabel || 'Đang xử lý...');
        }
      });
    });
  }

  // H?m setButtonBusy d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  function setButtonBusy(button, busyLabel) {
    button.dataset.originalHtml = button.innerHTML;
    button.textContent = busyLabel;
  }

  document.addEventListener('DOMContentLoaded', initSubmitBusyForms);
})();
