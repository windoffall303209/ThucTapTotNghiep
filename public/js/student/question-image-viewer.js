// Mã JavaScript phía trình duyệt question image viewer điều khiển tương tác và cập nhật giao diện người dùng.
(function () {
  let viewer = null;
  let viewerImage = null;
  let viewerCaption = null;
  let returnFocusTo = null;

  // Hàm ensureViewer dùng để kiểm tra tính hợp lệ và các điều kiện an toàn; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function ensureViewer() {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (viewer) return viewer;

    viewer = document.createElement('dialog');
    viewer.className = 'question-image-viewer';
    viewer.setAttribute('aria-label', 'Xem ảnh minh họa');

    const card = document.createElement('div');
    card.className = 'question-image-viewer-card';

    const media = document.createElement('div');
    media.className = 'question-image-viewer-media';

    viewerImage = document.createElement('img');
    viewerImage.alt = '';
    media.appendChild(viewerImage);

    viewerCaption = document.createElement('p');
    viewerCaption.className = 'question-image-viewer-caption';

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'question-image-viewer-close';
    closeButton.setAttribute('aria-label', 'Đóng ảnh lớn');
    closeButton.textContent = '×';
    closeButton.addEventListener('click', closeViewer);

    card.append(media, viewerCaption, closeButton);
    viewer.appendChild(card);
    viewer.addEventListener('click', (event) => {
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (event.target === viewer) closeViewer();
    });
    viewer.addEventListener('close', () => {
      viewerImage.removeAttribute('src');
      returnFocusTo?.focus();
      returnFocusTo = null;
    });
    document.body.appendChild(viewer);
    return viewer;
  }

  // Hàm openViewer dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function openViewer(image) {
    const dialog = ensureViewer();
    returnFocusTo = image;
    viewerImage.src = image.currentSrc || image.src;
    viewerImage.alt = image.alt || 'Ảnh minh họa của câu hỏi';
    viewerCaption.textContent = image.alt || 'Ảnh minh họa của câu hỏi';

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (typeof dialog.showModal === 'function') dialog.showModal();
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    else dialog.setAttribute('open', '');
  }

  // Hàm closeViewer dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function closeViewer() {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!viewer) return;
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (typeof viewer.close === 'function') viewer.close();
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    else {
      viewer.removeAttribute('open');
      viewerImage.removeAttribute('src');
      returnFocusTo?.focus();
      returnFocusTo = null;
    }
  }

  // Hàm enhance dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function enhance(root = document) {
    root.querySelectorAll('.question-content img:not([data-question-image-zoom])').forEach((image) => {
      image.dataset.questionImageZoom = 'true';
      image.tabIndex = 0;
      image.setAttribute('role', 'button');
      image.setAttribute('aria-haspopup', 'dialog');
      image.setAttribute('aria-label', `${image.alt || 'Ảnh minh họa'}. Nhấn để xem ảnh lớn.`);
      image.title = 'Nhấn để xem ảnh lớn';
      image.draggable = false;
      image.closest('.question-image')?.setAttribute('data-image-preview-ready', 'true');
      image.addEventListener('click', () => openViewer(image));
      image.addEventListener('keydown', (event) => {
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        openViewer(image);
      });
    });
  }

  window.StudentQuestionImages = { enhance };
  document.addEventListener('DOMContentLoaded', () => enhance(document));
})();
