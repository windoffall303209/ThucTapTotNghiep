// Mã JavaScript phía trình duyệt common điều khiển tương tác và cập nhật giao diện người dùng.
(function () {
  document.addEventListener('DOMContentLoaded', initPasswordMatchForms);

  // Báo lệch mật khẩu ngay trên form thay vì đợi server trả trang lỗi. Dùng
  // setCustomValidity để trình duyệt tự hiện bong bóng cạnh đúng ô đang sai.
  function initPasswordMatchForms() {
    document.querySelectorAll('form[data-password-match-form]').forEach((form) => {
      const password = form.querySelector('[name="password"]');
      const confirm = form.querySelector('[name="confirmPassword"]');
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (!password || !confirm) return;
  
      // Hàm checkMatch dùng để kiểm tra tính hợp lệ và các điều kiện an toàn; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
      const checkMatch = () => {
        confirm.setCustomValidity(
          confirm.value && password.value !== confirm.value
            ? 'Hai ô mật khẩu chưa giống nhau. Em kiểm tra lại nhé.'
            : ''
        );
      };
  
      password.addEventListener('input', checkMatch);
      confirm.addEventListener('input', checkMatch);
      form.addEventListener('submit', (event) => {
        checkMatch();
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (!form.checkValidity()) {
          event.preventDefault();
          form.reportValidity();
        }
      });
    });
  }

})();
