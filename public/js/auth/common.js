(function () {
  document.addEventListener('DOMContentLoaded', () => {
    initPasswordToggles();
    initPasswordMatchForms();
  });

  // Nút con mắt cạnh ô mật khẩu. Trẻ em gõ chậm và hay gõ nhầm; cho các em nhìn
  // thấy mình vừa gõ gì giảm hẳn số lần đăng nhập trượt.
  function initPasswordToggles() {
    document.querySelectorAll('[data-password-toggle]').forEach((button) => {
      const input = button.closest('.password-field')?.querySelector('input');
      if (!input) return;
      button.addEventListener('click', () => {
        const dangHien = input.type === 'text';
        input.type = dangHien ? 'password' : 'text';
        button.setAttribute('aria-pressed', dangHien ? 'false' : 'true');
        button.setAttribute('aria-label', dangHien ? 'Hiện mật khẩu' : 'Ẩn mật khẩu');
        const icon = button.querySelector('i[data-lucide], svg');
        if (icon) {
          const replacement = document.createElement('i');
          replacement.dataset.lucide = dangHien ? 'eye' : 'eye-off';
          replacement.className = 'lucide-icon';
          icon.replaceWith(replacement);
          refreshIcons();
        }
        input.focus();
      });
    });
  }
  
  // Báo lệch mật khẩu ngay trên form thay vì đợi server trả trang lỗi. Dùng
  // setCustomValidity để trình duyệt tự hiện bong bóng cạnh đúng ô đang sai.
  function initPasswordMatchForms() {
    document.querySelectorAll('form[data-password-match-form]').forEach((form) => {
      const password = form.querySelector('[name="password"]');
      const confirm = form.querySelector('[name="confirmPassword"]');
      if (!password || !confirm) return;
  
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
        if (!form.checkValidity()) {
          event.preventDefault();
          form.reportValidity();
        }
      });
    });
  }

  function refreshIcons() {
    if (window.lucide) window.lucide.createIcons();
  }
})();
