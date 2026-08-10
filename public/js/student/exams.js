// Mã JavaScript phía trình duyệt exams điều khiển tương tác và cập nhật giao diện người dùng.
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
          // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
          if (button !== trigger) button.disabled = true;
        });
  
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (trigger) {
          trigger.setAttribute('aria-busy', 'true');
          setButtonBusy(trigger, form.dataset.busyLabel || 'Đang xử lý...');
        }
      });
    });
  }

  // Hàm setButtonBusy dùng để cập nhật trạng thái hoặc dữ liệu theo quy tắc nghiệp vụ; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function setButtonBusy(button, busyLabel) {
    button.dataset.originalHtml = button.innerHTML;
    button.textContent = busyLabel;
  }

  document.addEventListener('DOMContentLoaded', initSubmitBusyForms);
})();
