// M? JavaScript ph?a tr?nh duy?t session review ?i?u khi?n t??ng t?c v? c?p nh?t giao di?n ng??i d?ng.
(function () {
  // Trang xem lại bài: nút "Chỉ xem câu sai" ẩn các câu đã đúng để em nhảy
  // thẳng tới phần cần sửa, không phải cuộn qua 15-20 câu.
  function initReviewFilter() {
    const buttons = document.querySelectorAll('[data-review-filter]');
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (buttons.length === 0) return;
  
    buttons.forEach((button) => {
      button.addEventListener('click', () => {
        const mode = button.dataset.reviewFilter;
        buttons.forEach((other) => {
          const isActive = other === button;
          other.classList.toggle('active', isActive);
          other.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
        document.querySelectorAll('[data-review-result]').forEach((item) => {
          item.hidden = mode === 'wrong' && item.dataset.reviewResult !== 'wrong';
        });
      });
    });
  }

  document.addEventListener('DOMContentLoaded', initReviewFilter);
})();
