// M? JavaScript ph?a tr?nh duy?t question image viewer ?i?u khi?n t??ng t?c v? c?p nh?t giao di?n ng??i d?ng.
(function () {
  let viewer = null;
  let viewerImage = null;
  let viewerCaption = null;
  let returnFocusTo = null;

  // H?m ensureViewer d?ng ?? ki?m tra t?nh h?p l? v? c?c ?i?u ki?n an to?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  function ensureViewer() {
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
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
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
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

  // H?m openViewer d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  function openViewer(image) {
    const dialog = ensureViewer();
    returnFocusTo = image;
    viewerImage.src = image.currentSrc || image.src;
    viewerImage.alt = image.alt || 'Ảnh minh họa của câu hỏi';
    viewerCaption.textContent = image.alt || 'Ảnh minh họa của câu hỏi';

    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (typeof dialog.showModal === 'function') dialog.showModal();
    // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
    else dialog.setAttribute('open', '');
  }

  // H?m closeViewer d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  function closeViewer() {
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!viewer) return;
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (typeof viewer.close === 'function') viewer.close();
    // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
    else {
      viewer.removeAttribute('open');
      viewerImage.removeAttribute('src');
      returnFocusTo?.focus();
      returnFocusTo = null;
    }
  }

  // H?m enhance d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
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
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        openViewer(image);
      });
    });
  }

  window.StudentQuestionImages = { enhance };
  document.addEventListener('DOMContentLoaded', () => enhance(document));
})();
