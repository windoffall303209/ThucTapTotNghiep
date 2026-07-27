(function () {
  // Trang xem lại bài: nút "Chỉ xem câu sai" ẩn các câu đã đúng để em nhảy
  // thẳng tới phần cần sửa, không phải cuộn qua 15-20 câu.
  function initReviewFilter() {
    const buttons = document.querySelectorAll('[data-review-filter]');
    if (buttons.length === 0) return;
  
    buttons.forEach((button) => {
      button.addEventListener('click', () => {
        const mode = button.dataset.reviewFilter;
        buttons.forEach((other) => other.classList.toggle('active', other === button));
        document.querySelectorAll('[data-review-result]').forEach((item) => {
          item.hidden = mode === 'wrong' && item.dataset.reviewResult !== 'wrong';
        });
      });
    });
  }

  document.addEventListener('DOMContentLoaded', initReviewFilter);
})();
