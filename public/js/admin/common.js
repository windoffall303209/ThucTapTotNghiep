(function () {
  // Cảnh báo trước khi rời trang admin nếu form soạn thảo còn thay đổi chưa
  // lưu. Form soạn câu hỏi và thẻ lý thuyết nằm trong <details> và được nạp
  // động, nên dùng lắng nghe ủy quyền ở document thay vì gắn cho từng form:
  // form nạp về sau vẫn được phủ mà không phải nhớ gọi lại init.
  function initAdminDirtyGuard() {
    if (!document.body.classList.contains('admin-body')) return;
  
    let dirty = false;
  
    document.addEventListener('input', (event) => {
      if (event.target.closest('form')) dirty = true;
    });
  
    // Nộp form nào cũng coi như đã chốt: trang sắp reload theo POST, cảnh báo
    // lúc này chỉ cản admin lưu bài.
    document.addEventListener('submit', () => {
      dirty = false;
    });
  
    window.addEventListener('beforeunload', (event) => {
      if (!dirty) return;
      event.preventDefault();
      // Chuỗi trả về chỉ để trình duyệt cũ hiện hộp thoại; trình duyệt mới dùng
      // thông điệp chuẩn của chính nó.
      event.returnValue = '';
    });
  }

  document.addEventListener('DOMContentLoaded', initAdminDirtyGuard);
})();
