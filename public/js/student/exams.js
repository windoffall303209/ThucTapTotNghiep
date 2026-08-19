// Mã JavaScript phía trình duyệt exams điều khiển tương tác và cập nhật giao diện người dùng.
(function () {
  function initMultiLessonPicker() {
    document.querySelectorAll('[data-multi-lesson-form]').forEach((form) => {
      const checkboxes = Array.from(form.querySelectorAll('[data-multi-lesson-checkbox]'));
      const countLabel = form.querySelector('[data-selected-lesson-count]');
      const note = form.querySelector('[data-multi-lesson-note]');
      const search = form.querySelector('[data-multi-lesson-search]');
      const empty = form.querySelector('[data-multi-lesson-empty]');
      const submitButtons = Array.from(form.querySelectorAll('[data-multi-lesson-submit]'));

      const updateSelection = (changedCheckbox = null) => {
        let selected = checkboxes.filter((checkbox) => checkbox.checked);
        if (selected.length > 20 && changedCheckbox) {
          changedCheckbox.checked = false;
          selected = checkboxes.filter((checkbox) => checkbox.checked);
          note.textContent = 'Mỗi đề được chọn tối đa 20 bài.';
        } else if (selected.length < 2) {
          note.textContent = 'Chọn ít nhất 2 bài. Mỗi bài đã chọn sẽ có câu hỏi trong đề.';
        } else {
          note.textContent = `${selected.length} bài đã sẵn sàng. Chọn số câu bằng hoặc lớn hơn số bài.`;
        }
        countLabel.textContent = selected.length > 0 ? `Đã chọn ${selected.length} bài` : 'Chưa chọn bài';
        submitButtons.forEach((button) => {
          button.disabled = selected.length < 2 || selected.length > Number(button.value);
        });
      };

      checkboxes.forEach((checkbox) => {
        checkbox.addEventListener('change', () => updateSelection(checkbox));
      });

      search?.addEventListener('input', () => {
        const keyword = search.value.trim().toLocaleLowerCase('vi');
        let visibleCount = 0;
        form.querySelectorAll('[data-picker-chapter]').forEach((chapter) => {
          let chapterMatches = 0;
          chapter.querySelectorAll('[data-picker-lesson]').forEach((lesson) => {
            const matches = !keyword || String(lesson.dataset.searchText || '').includes(keyword);
            lesson.hidden = !matches;
            if (matches) chapterMatches += 1;
          });
          chapter.hidden = chapterMatches === 0;
          if (keyword && chapterMatches > 0) chapter.open = true;
          visibleCount += chapterMatches;
        });
        if (empty) empty.hidden = visibleCount > 0;
      });

      updateSelection();
    });
  }

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

  document.addEventListener('DOMContentLoaded', () => {
    initMultiLessonPicker();
    initSubmitBusyForms();
  });
})();
