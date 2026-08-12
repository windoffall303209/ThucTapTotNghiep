// Mã JavaScript phía trình duyệt common điều khiển tương tác và cập nhật giao diện người dùng.
(function () {
  document.addEventListener('DOMContentLoaded', () => {
    initPasswordMatchForms();
    initAccountPolicies();
    initVerificationCodes();
  });

  function initVerificationCodes() {
    document.querySelectorAll('[data-verification-code-group]').forEach((group) => {
      const digits = Array.from(group.querySelectorAll('[data-verification-digit]'));
      const valueInput = group.querySelector('[data-verification-code-value]');
      if (digits.length !== 6 || !valueInput) return;

      const syncValue = () => {
        valueInput.value = digits.map((digit) => digit.value).join('');
      };
      const distribute = (value, startIndex = 0) => {
        const clean = String(value || '').replace(/\D/gu, '').slice(0, digits.length - startIndex);
        if (!clean) return;
        clean.split('').forEach((character, offset) => {
          digits[startIndex + offset].value = character;
        });
        syncValue();
        digits[Math.min(startIndex + clean.length, digits.length - 1)].focus();
      };

      digits.forEach((digit, index) => {
        digit.addEventListener('input', () => {
          const clean = digit.value.replace(/\D/gu, '');
          if (clean.length > 1) {
            distribute(clean, index);
            return;
          }
          digit.value = clean.slice(-1);
          syncValue();
          if (digit.value && index < digits.length - 1) digits[index + 1].focus();
        });
        digit.addEventListener('keydown', (event) => {
          if (event.key === 'Backspace' && !digit.value && index > 0) {
            event.preventDefault();
            digits[index - 1].value = '';
            digits[index - 1].focus();
            syncValue();
          } else if (event.key === 'ArrowLeft' && index > 0) {
            event.preventDefault();
            digits[index - 1].focus();
          } else if (event.key === 'ArrowRight' && index < digits.length - 1) {
            event.preventDefault();
            digits[index + 1].focus();
          }
        });
        digit.addEventListener('focus', () => digit.select());
      });
      group.addEventListener('paste', (event) => {
        const pasted = event.clipboardData?.getData('text') || '';
        if (!/\d/u.test(pasted)) return;
        event.preventDefault();
        distribute(pasted, 0);
      });
      group.closest('form')?.addEventListener('submit', syncValue);
      syncValue();
    });

    document.querySelectorAll('[data-verification-code]').forEach((input) => {
      input.addEventListener('input', () => {
        const clean = input.value.replace(/\D/gu, '').slice(0, 6);
        if (clean !== input.value) input.value = clean;
      });
    });
  }

  function initAccountPolicies() {
    document.querySelectorAll('[data-fullname-policy]').forEach((input) => {
      let isComposing = false;

      const sanitize = ({ trim = false } = {}) => {
        const original = input.value;
        const cursor = input.selectionStart;
        const cleanPart = (value) => value
          .normalize('NFKC')
          .replace(/[^\p{L}\p{M}\s]/gu, '')
          .replace(/\s+/gu, ' ');
        let sanitized = cleanPart(original);
        if (trim) sanitized = sanitized.trim();
        if (sanitized === original) return;

        input.value = sanitized;
        if (cursor !== null && !trim) {
          const nextCursor = cleanPart(original.slice(0, cursor)).length;
          input.setSelectionRange(nextCursor, nextCursor);
        }
      };

      const validate = () => {
        const value = input.value.trim();
        input.setCustomValidity(
          value && !/^[\p{L}\p{M}]+(?: [\p{L}\p{M}]+)*$/u.test(value)
            ? 'Họ và tên chỉ được chứa chữ cái và khoảng trắng.'
            : ''
        );
      };
      input.addEventListener('compositionstart', () => { isComposing = true; });
      input.addEventListener('compositionend', () => {
        isComposing = false;
        sanitize();
        validate();
      });
      input.addEventListener('input', () => {
        if (isComposing) return;
        sanitize();
        validate();
      });
      input.addEventListener('blur', () => {
        sanitize({ trim: true });
        validate();
      });
    });

    document.querySelectorAll('[data-password-policy]').forEach((input) => {
      const validate = () => {
        const value = input.value;
        const isStrong = value.length >= 10
          && !/\s/u.test(value)
          && /\p{Ll}/u.test(value)
          && /\p{Lu}/u.test(value)
          && /\p{N}/u.test(value)
          && /[\p{P}\p{S}]/u.test(value);
        input.setCustomValidity(
          value && !isStrong
            ? 'Mật khẩu cần ít nhất 10 ký tự, gồm chữ hoa, chữ thường, chữ số và ký tự đặc biệt; không có khoảng trắng.'
            : ''
        );
      };
      input.addEventListener('input', validate);
      input.addEventListener('blur', validate);
    });
  }

  // Báo lệch mật khẩu ngay trên form thay vì đợi server trả trang lỗi. Dùng
  // setCustomValidity để trình duyệt tự hiện bong bóng cạnh đúng ô đang sai.
  function initPasswordMatchForms() {
    document.querySelectorAll('form[data-password-match-form]').forEach((form) => {
      const password = form.querySelector('[data-password-primary], [name="password"]');
      const confirm = form.querySelector('[data-password-confirm], [name="confirmPassword"]');
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
