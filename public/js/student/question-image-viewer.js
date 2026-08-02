(function () {
  let viewer = null;
  let viewerImage = null;
  let viewerCaption = null;
  let returnFocusTo = null;

  function ensureViewer() {
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

  function openViewer(image) {
    const dialog = ensureViewer();
    returnFocusTo = image;
    viewerImage.src = image.currentSrc || image.src;
    viewerImage.alt = image.alt || 'Ảnh minh họa của câu hỏi';
    viewerCaption.textContent = image.alt || 'Ảnh minh họa của câu hỏi';

    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  function closeViewer() {
    if (!viewer) return;
    if (typeof viewer.close === 'function') viewer.close();
    else {
      viewer.removeAttribute('open');
      viewerImage.removeAttribute('src');
      returnFocusTo?.focus();
      returnFocusTo = null;
    }
  }

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
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        openViewer(image);
      });
    });
  }

  window.StudentQuestionImages = { enhance };
  document.addEventListener('DOMContentLoaded', () => enhance(document));
})();
