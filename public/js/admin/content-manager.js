// M? JavaScript ph?a tr?nh duy?t content manager ?i?u khi?n t??ng t?c v? c?p nh?t giao di?n ng??i d?ng.
(function () {
  const {
    boundsForCells,
    cellRect,
    clampGridSize,
    clampSpan,
    collectPreviewChoices,
    createBaseGridCells,
    createGridCell,
    debounce,
    ensurePreviewPlaceholders,
    escapeAttribute,
    escapeHtml,
    getPreviewImages,
    gridCellPreview,
    gridCellTypeLabel,
    initConfirmForms,
    initLazyMath,
    initRenderedGrids,
    isHexColor,
    isImageMarkedForRemoval,
    maxPreviewImageIndex,
    normalizeGridCell,
    normalizeRect,
    parseGridLayoutValue,
    parsePreviewImages,
    rectContainsCell,
    rectIntersectsCell,
    refreshIcons,
    renderAnswerArea,
    renderMath,
    renderQuestionContent,
    renderTheoryCardPreview,
    stripRemovedPreviewPlaceholders,
    theoryTypeLabel,
    translateDifficulty,
    translateLayout
  } = window.AppUI;
  let contentRequestSequence = 0;

  // H?m nextContentRequestId d?ng ?? x? l? y?u c?u, ?i?u ph?i c?c b??c nghi?p v? v? ph?n h?i l?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  function nextContentRequestId(scope) {
    contentRequestSequence += 1;
    return `${scope}:${contentRequestSequence}`;
  }

  // H?m confirmDiscard d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  async function confirmDiscard(root, message) {
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (typeof window.AdminDirtyForms?.confirmDiscard !== 'function') return true;
    return window.AdminDirtyForms.confirmDiscard(root, {
      message,
      confirmLabel: 'Bỏ thay đổi',
      cancelLabel: 'Tiếp tục chỉnh sửa'
    });
  }

  // H?m initAdminPreview d?ng ?? kh?i t?o tr?ng th?i v? c?c ph? thu?c c?n thi?t; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  function initAdminPreview(root = document) {
    const previewForms = Array.from(root.querySelectorAll('[data-question-preview-form]:not([data-question-preview-ready])'));
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (previewForms.length > 0) {
      previewForms.forEach((form) => {
        const parentDetails = form.closest('details');
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (parentDetails && !parentDetails.open) {
          // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
          if (parentDetails.dataset.questionPreviewToggleReady !== 'true') {
            parentDetails.dataset.questionPreviewToggleReady = 'true';
            parentDetails.addEventListener('toggle', () => {
              // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
              if (parentDetails.open) {
                initAdminPreview(parentDetails);
                initGridEditors(parentDetails);
                initAuthoringModeControls(parentDetails);
                initRenderedGrids(parentDetails);
              }
            });
          }
          return;
        }

        form.dataset.questionPreviewReady = 'true';
        initQuestionPreviewForm(form);
        initQuestionFormGuards(form.parentElement || document);
      });
      return;
    }

    const legacyPreview = root.querySelector('#adminQuestionPreview');
    const legacyContentInput = root.querySelector('[data-preview-source="content"]');
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (legacyPreview && legacyContentInput) {
      initQuestionPreviewForm(root, {
        preview: legacyPreview,
        contentInput: legacyContentInput,
        placeholderList: root.querySelector('#imagePlaceholderList')
      });
    }
  }

  // H?m initQuestionPreviewForm d?ng ?? kh?i t?o tr?ng th?i v? c?c ph? thu?c c?n thi?t; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  function initQuestionPreviewForm(form, overrides = {}) {
    const preview = overrides.preview || form.querySelector('[data-question-preview]');
    const contentInput = overrides.contentInput || form.querySelector('[data-preview-content]') || form.querySelector('[data-preview-source="content"]');
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!preview || !contentInput) return;

    const imageInput = form.querySelector('[data-preview-images]');
    const imageWidthInput = form.querySelector('[data-preview-image-width]');
    const imageAltInput = form.querySelector('[data-preview-image-alt]');
    const existingImagesInput = form.querySelector('[data-preview-existing-images]');
    const placeholderList = overrides.placeholderList || form.querySelector('[data-preview-placeholder-list]');
    const layoutInput = form.querySelector('[name="layout_template"]');
    const layoutVariantInput = form.querySelector('[data-layout-variant], [name="layout_variant"]');
    const questionTypeInput = form.querySelector('[data-question-type], [name="question_type"]');
    const gridInput = form.querySelector('[data-grid-layout-input]');

    // H?m updatePreview d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
    const updatePreview = () => {
      const allExistingImages = parsePreviewImages(existingImagesInput?.value);
      const existingImages = allExistingImages
        .filter((image) => !isImageMarkedForRemoval(form, 'remove_question_images', image));
      const uploadImages = getPreviewImages(imageInput, imageWidthInput, imageAltInput, {
        startIndex: maxPreviewImageIndex(existingImages, 'image')
      });
      const images = [...existingImages, ...uploadImages];
      const previewText = ensurePreviewPlaceholders(
        stripRemovedPreviewPlaceholders(contentInput.value || 'Đề bài sẽ hiển thị tại đây.', allExistingImages, form, 'remove_question_images'),
        uploadImages
      );
      const question = {
        question_type: questionTypeInput?.value || 'MULTIPLE_CHOICE',
        layout_template: normalizeStorageLayout(layoutVariantInput?.value || layoutInput?.value || 'STACK_VERTICAL'),
        content: {
          text: previewText,
          images,
          layout_variant: layoutVariantInput?.value || layoutInput?.value || 'STACK_VERTICAL',
          grid_layout: parseGridLayoutValue(gridInput?.value)
        },
        choices: (questionTypeInput?.value || 'MULTIPLE_CHOICE') === 'FILL_IN_THE_BLANK'
          ? []
          : collectPreviewChoices(form)
      };

      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (placeholderList) {
        placeholderList.hidden = images.length === 0;
        placeholderList.innerHTML = images.map((image) => `
          <span>${escapeHtml(`[${image.id}]`)}</span>
        `).join('');
      }

      // Thu hồi các blob URL của lượt xem trước cũ NGAY TRƯỚC khi thay nội
      // dung: ảnh chọn từ máy được cấp URL tạm bằng createObjectURL, không thu
      // hồi thì mỗi lần gõ phím lại rò thêm một tấm ảnh trong bộ nhớ.
      preview.querySelectorAll('img[src^="blob:"]').forEach((img) => URL.revokeObjectURL(img.src));
      preview.innerHTML = `
        <div class="question-content">${renderQuestionContent(question)}</div>
        ${renderAnswerArea(question, { preview: true })}
      `;
      renderMath(preview);
    };
    const updatePreviewDebounced = debounce(updatePreview, 200);

    initQuestionTypeControls(form, updatePreview);

    form.querySelectorAll([
      '[data-preview-content]',
      '[data-preview-source]',
      '[data-preview-choice]',
      '[data-preview-images]',
      '[data-preview-image-width]',
      '[data-preview-image-alt]',
      '[data-preview-choice-images]',
      '[data-preview-choice-image-width]',
      '[data-preview-choice-image-alt]',
      '[name="layout_template"]',
      '[name="layout_variant"]',
      '[data-layout-variant]',
      '[name="question_type"]',
      '[data-question-type]',
      '[data-grid-layout-input]',
      '[name="remove_question_images"]',
      '[name^="remove_choice_images_"]'
    ].join(',')).forEach((input) => {
      // Gõ chữ thì hoãn 200ms cho tới khi ngừng tay; sự kiện change (chọn
      // file, đổi ô chọn) thưa nên cập nhật ngay.
      input.addEventListener('input', updatePreviewDebounced);
      input.addEventListener('change', updatePreview);
    });
    form.addEventListener?.('reset', () => window.setTimeout(updatePreview, 0));
    updatePreview();
  }

  // Kiểm tra biểu mẫu câu hỏi ngay trên trình duyệt, phản chiếu đúng các quy tắc
  // của validateQuestionBody ở controllers/AdminController.js. Mục đích không phải
  // thay thế kiểm tra phía server mà là chặn vòng gửi đi rồi chuyển hướng, vì
  // chuyển hướng làm mất trắng toàn bộ nội dung đang soạn và cả các tệp ảnh đã
  // chọn (trình duyệt không cho phép nạp lại giá trị của input type=file).
  const ANSWER_KEYS = ['A', 'B', 'C', 'D'];

  // H?m initQuestionFormGuards d?ng ?? kh?i t?o tr?ng th?i v? c?c ph? thu?c c?n thi?t; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  function initQuestionFormGuards(root = document) {
    root.querySelectorAll('[data-question-preview-form]:not([data-question-guard-ready])').forEach((form) => {
      form.dataset.questionGuardReady = 'true';
      form.addEventListener('submit', (event) => {
        const message = validateQuestionForm(form);
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (!message) {
          clearFormError(form);
          return;
        }
        event.preventDefault();
        showFormError(form, message);
      });
    });
  }

  // H?m countChoiceImages d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  function countChoiceImages(form, key) {
    const existingInput = form.querySelector(`[data-preview-choice-existing-images="${key}"]`);
    const existing = parsePreviewImages(existingInput?.value)
      .filter((image) => !isImageMarkedForRemoval(form, `remove_choice_images_${key}`, image));
    const uploads = form.querySelector(`[data-preview-choice-images="${key}"]`)?.files?.length || 0;
    return existing.length + uploads;
  }

  // H?m validateQuestionForm d?ng ?? ki?m tra t?nh h?p l? v? c?c ?i?u ki?n an to?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  function validateQuestionForm(form) {
    const questionType = form.querySelector('[data-question-type], [name="question_type"]')?.value
      || 'MULTIPLE_CHOICE';
    const authoringMode = form.querySelector('[name="authoring_mode"]')?.value || 'fields';
    const gridLayout = parseGridLayoutValue(form.querySelector('[data-grid-layout-input]')?.value);
    const hasGrid = authoringMode === 'canvas' && gridLayout.enabled;
    const contentText = String(form.querySelector('[data-preview-content]')?.value || '').trim();

    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!contentText && !hasGrid) {
      return 'Chưa có đề bài. Em hãy nhập nội dung đề bài trước khi lưu.';
    }

    const correctAnswer = String(form.querySelector('[name="correct_answer"]:not([disabled])')?.value || '').trim();
    const freeAnswer = String(form.querySelector('[name="correct_answer_free"]:not([disabled])')?.value || '').trim();

    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (questionType === 'FILL_IN_THE_BLANK') {
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (!freeAnswer) return 'Chưa nhập đáp án đúng cho dạng điền khuyết.';
      return null;
    }

    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!correctAnswer) return 'Chưa chọn đáp án đúng cho câu hỏi.';

    // Lưới canvas có thể tự chứa các ô đáp án, khi đó không cần bốn phương án rời.
    const gridAnswerKeys = new Set(
      (gridLayout.cells || [])
        .filter((cell) => cell.type === 'answer' && cell.answer_key)
        .map((cell) => String(cell.answer_key).toUpperCase())
    );
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (hasGrid && gridAnswerKeys.size >= 2 && gridAnswerKeys.has(correctAnswer.toUpperCase())) {
      return null;
    }

    const thieu = ANSWER_KEYS.filter((key) => {
      const text = String(form.querySelector(`[data-preview-choice="${key}"]`)?.value || '').trim();
      return !text && countChoiceImages(form, key) === 0;
    });
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (thieu.length > 0) {
      return `Phương án ${thieu.join(', ')} còn trống. Mỗi phương án cần có nội dung chữ hoặc ảnh minh họa.`;
    }

    const layout = form.querySelector('[name="layout_variant"], [data-layout-variant], [name="layout_template"]')?.value;
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (layout === 'IMAGE_IN_CHOICES'
      && ANSWER_KEYS.every((key) => countChoiceImages(form, key) === 0)) {
      return 'Bố cục ảnh trong đáp án cần có ít nhất một ảnh ở các phương án.';
    }

    return null;
  }

  // H?m showFormError d?ng ?? chu?n b? v? hi?n th? k?t qu? cho ng??i d?ng; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  function showFormError(form, message) {
    let box = form.querySelector('[data-form-error]');
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!box) {
      box = document.createElement('div');
      box.className = 'flash flash-danger form-error-box';
      box.setAttribute('role', 'alert');
      box.dataset.formError = 'true';
      const anchor = form.querySelector('.form-actions') || form.firstElementChild;
      form.insertBefore(box, anchor);
    }
    box.textContent = message;
    box.hidden = false;
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // H?m clearFormError d?ng ?? x?a ho?c gi?i ph?ng t?i nguy?n theo ?i?u ki?n an to?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  function clearFormError(form) {
    const box = form.querySelector('[data-form-error]');
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (box) box.hidden = true;
  }

  // H?m initQuestionTypeControls d?ng ?? kh?i t?o tr?ng th?i v? c?c ph? thu?c c?n thi?t; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  function initQuestionTypeControls(form, updatePreview) {
    const typeInput = form.querySelector('[data-question-type], [name="question_type"]');
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!typeInput || typeInput.dataset.questionTypeReady === 'true') return;

    const choicePanel = form.querySelector('[data-choice-panel]');
    const correctChoicePanel = form.querySelector('[data-correct-choice-panel]');
    const correctChoiceInput = correctChoicePanel?.querySelector('[name="correct_answer"]');
    const correctFreePanel = form.querySelector('[data-correct-free-panel]');
    const correctFreeInput = correctFreePanel?.querySelector('[name="correct_answer_free"]');
    const interactionInput = form.querySelector('[data-question-interaction], [name="question_interaction"]');

    // H?m sync d?ng ?? ??ng b? d? li?u gi?a c?c ??nh d?ng ho?c ngu?n kh?c nhau; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
    const sync = () => {
      const isFreeAnswer = typeInput.value === 'FILL_IN_THE_BLANK';
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (choicePanel) choicePanel.hidden = isFreeAnswer;
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (correctChoicePanel) correctChoicePanel.hidden = isFreeAnswer;
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (correctFreePanel) correctFreePanel.hidden = !isFreeAnswer;

      choicePanel?.querySelectorAll('input, select, textarea').forEach((input) => {
        input.disabled = isFreeAnswer;
      });

      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (correctChoiceInput) {
        correctChoiceInput.disabled = isFreeAnswer;
        correctChoiceInput.required = !isFreeAnswer;
      }
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (correctFreeInput) {
        correctFreeInput.disabled = !isFreeAnswer;
        correctFreeInput.required = isFreeAnswer;
      }
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (interactionInput && isFreeAnswer && interactionInput.value === 'choose') {
        interactionInput.value = 'fill_blank';
      }
      updatePreview?.();
    };

    typeInput.dataset.questionTypeReady = 'true';
    typeInput.addEventListener('change', sync);
    sync();
  }

  // H?m normalizeStorageLayout d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  function normalizeStorageLayout(value) {
    const layout = String(value || 'STACK_VERTICAL').toUpperCase();
    return [
      'STACK_VERTICAL',
      'SPLIT_HORIZONTAL_LEFT_IMAGE',
      'SPLIT_HORIZONTAL_RIGHT_IMAGE',
      'IMAGE_IN_CHOICES'
    ].includes(layout) ? layout : 'STACK_VERTICAL';
  }

  // H?m initAdminQuestionBank d?ng ?? kh?i t?o tr?ng th?i v? c?c ph? thu?c c?n thi?t; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  function initAdminQuestionBank() {
    initContentManagers();
    initQuestionDetailsControls();

    const dialog = document.getElementById('questionCreateDialog');
    const lessonInput = document.getElementById('createQuestionLessonId');
    const lessonLabel = document.getElementById('createQuestionLessonLabel');
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!dialog || !lessonInput || !lessonLabel) return;

    document.querySelectorAll('[data-create-question]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();

        const form = dialog.querySelector('form');
        form?.reset();
        lessonInput.value = button.dataset.lessonId || '';
        lessonLabel.textContent = button.dataset.lessonLabel || 'Bài học đã chọn';

        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (typeof dialog.showModal === 'function') {
          dialog.showModal();
        } else {
          dialog.setAttribute('open', '');
        }
      });
    });

    dialog.querySelectorAll('[data-question-modal-close]').forEach((button) => {
      button.addEventListener('click', () => closeDialog(dialog));
    });

    dialog.addEventListener('click', (event) => {
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (event.target === dialog) closeDialog(dialog);
    });
  }

  // H?m initQuestionDetailsControls d?ng ?? kh?i t?o tr?ng th?i v? c?c ph? thu?c c?n thi?t; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  function initQuestionDetailsControls(root = document) {
    root.querySelectorAll('[data-close-details]:not([data-close-details-ready])').forEach((button) => {
      button.dataset.closeDetailsReady = 'true';
      button.addEventListener('click', async () => {
        const details = button.closest('details');
        const form = button.closest('form');
        const canClose = await confirmDiscard(
          form || details,
          'Biểu mẫu đang có thay đổi chưa lưu. Bạn có chắc muốn hủy và đóng biểu mẫu?'
        );
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (!canClose) return;
        form?.reset();
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (details) details.open = false;
      });
    });
  }

  // H?m initTheoryEditors d?ng ?? kh?i t?o tr?ng th?i v? c?c ph? thu?c c?n thi?t; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  function initTheoryEditors(root = document) {
    const forms = Array.from(root.querySelectorAll('[data-theory-preview-form]:not([data-theory-preview-ready])'));
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (forms.length === 0) return;

    initQuestionDetailsControls(root);
    forms.forEach((form) => {
      const parentDetails = form.closest('details');
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (parentDetails && !parentDetails.open) {
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (parentDetails.dataset.theoryPreviewToggleReady !== 'true') {
            parentDetails.dataset.theoryPreviewToggleReady = 'true';
            parentDetails.addEventListener('toggle', () => {
              // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
              if (parentDetails.open) {
                initTheoryEditors(parentDetails);
                initGridEditors(parentDetails);
                initAuthoringModeControls(parentDetails);
                initRenderedGrids(parentDetails);
              }
            });
        }
        return;
      }

      form.dataset.theoryPreviewReady = 'true';
      initTheoryPreviewForm(form);
    });
  }

  // H?m initTheoryPreviewForm d?ng ?? kh?i t?o tr?ng th?i v? c?c ph? thu?c c?n thi?t; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  function initTheoryPreviewForm(form) {
    const preview = form.querySelector('[data-theory-preview]');
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!preview) return;

    const titleInput = form.querySelector('[data-theory-title]');
    const typeInput = form.querySelector('[data-theory-type]');
    const layoutInput = form.querySelector('[data-theory-layout]');
    const displayTextInput = form.querySelector('[data-theory-display-text]');
    const bodyInput = form.querySelector('[data-theory-body]');
    const studentTaskInput = form.querySelector('[data-theory-student-task]');
    const exampleInput = form.querySelector('[data-theory-example]');
    const rememberInput = form.querySelector('[data-theory-remember]');
    const imageInput = form.querySelector('[data-theory-images]');
    const existingImagesInput = form.querySelector('[data-theory-existing-images]');
    const gridInput = form.querySelector('[data-grid-layout-input]');

    // H?m updatePreview d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
    const updatePreview = () => {
      const existingImages = parsePreviewImages(existingImagesInput?.value)
        .filter((image) => !isImageMarkedForRemoval(form, 'remove_theory_images', image));
      const uploadImages = Array.from(imageInput?.files || []).map((file, index) => ({
        id: `theory-preview-image-${existingImages.length + index + 1}`,
        url: URL.createObjectURL(file),
        alt_text: file.name || `Ảnh minh họa ${index + 1}`
      }));
      const images = [...existingImages, ...uploadImages];
      // Thu hồi blob URL của lượt xem trước cũ, cùng lý do với preview câu hỏi.
      preview.querySelectorAll('img[src^="blob:"]').forEach((img) => URL.revokeObjectURL(img.src));
      preview.innerHTML = renderTheoryCardPreview({
        type: typeInput?.value || 'concept',
        layout: layoutInput?.value || 'text_first',
        display_text: displayTextInput?.value || '',
        student_task: studentTaskInput?.value || '',
        remember: rememberInput?.value || '',
        title: titleInput?.value || 'Tiêu đề thẻ lý thuyết',
        body: bodyInput?.value || 'Nội dung lý thuyết sẽ hiển thị tại đây.',
        example: exampleInput?.value || '',
        grid_layout: parseGridLayoutValue(gridInput?.value),
        images
      });
      renderMath(preview);
      refreshIcons();
    };

    form.querySelectorAll('[data-theory-type], [data-theory-layout], [data-theory-title], [data-theory-display-text], [data-theory-body], [data-theory-student-task], [data-theory-example], [data-theory-remember], [data-theory-images], [data-grid-layout-input], [name="remove_theory_images"]').forEach((input) => {
      input.addEventListener('input', debounce(updatePreview, 200));
      input.addEventListener('change', updatePreview);
    });

    updatePreview();
  }

  // H?m initProgressiveAuthoringForms d?ng ?? kh?i t?o tr?ng th?i v? c?c ph? thu?c c?n thi?t; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  function initProgressiveAuthoringForms(root = document) {
    root.querySelectorAll('form[data-question-preview-form], form[data-theory-preview-form]').forEach((form) => {
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (form.dataset.progressiveFormReady === 'true') return;
      form.dataset.progressiveFormReady = 'true';
      form.classList.add('progressive-authoring-form');

      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (form.matches('[data-question-preview-form]')) {
        form.querySelectorAll('.choice-editor').forEach((choiceEditor) => {
          const optionalItems = Array.from(choiceEditor.children)
            .filter((item) => item.matches('.choice-fieldset, .two-fields'));
          // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
          if (optionalItems.length === 0) return;

          const key = choiceEditor.querySelector('[data-preview-choice]')?.dataset.previewChoice || '';
          const details = document.createElement('details');
          details.className = 'choice-optional-panel';
          details.innerHTML = `<summary>Tùy chọn đáp án ${escapeHtml(key)}</summary><div class="choice-optional-content"></div>`;
          const content = details.querySelector('.choice-optional-content');
          optionalItems[0].before(details);
          optionalItems.forEach((item) => content.appendChild(item));
        });
      }

      const optionalPanel = document.createElement('details');
      optionalPanel.className = 'form-optional-panel';
      optionalPanel.innerHTML = `
        <summary>
          <span><i data-lucide="sliders-horizontal" class="lucide-icon"></i> Tùy chọn nâng cao</span>
          <small>Ảnh, bố cục, canvas và xem trước</small>
        </summary>
        <div class="form-optional-content"></div>
      `;
      const optionalContent = optionalPanel.querySelector('.form-optional-content');
      const optionalItems = [];

      // H?m addOptional d?ng ?? t?o b?n ghi ho?c t?i nguy?n m?i sau khi ki?m tra ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
      const addOptional = (item) => {
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (item && !optionalItems.includes(item)) optionalItems.push(item);
      };

      addOptional(form.querySelector(':scope > [data-authoring-mode]'));
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (form.matches('[data-question-preview-form]')) {
        addOptional(form.querySelector('[data-layout-variant]')?.closest('label'));
        addOptional(form.querySelector('[data-question-interaction]')?.closest('label'));
        form.querySelectorAll(':scope > fieldset.image-fieldset').forEach(addOptional);
      } else {
        addOptional(form.querySelector('[data-theory-display-text]')?.closest('label'));
        addOptional(form.querySelector('[data-theory-student-task]')?.closest('.two-fields'));
        addOptional(form.querySelector('[data-theory-example]')?.closest('label'));
        addOptional(form.querySelector('[data-theory-remember]')?.closest('label'));
        addOptional(form.querySelector('[data-theory-images]')?.closest('label'));
      }
      addOptional(form.querySelector(':scope > [data-grid-editor]'));
      addOptional(form.querySelector(':scope > .question-form-preview'));

      optionalItems.forEach((item) => optionalContent.appendChild(item));
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (optionalItems.length > 0) {
        const actionRows = Array.from(form.querySelectorAll(':scope > .form-actions'));
        const finalActions = actionRows[actionRows.length - 1];
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (finalActions) form.insertBefore(optionalPanel, finalActions);
        // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
        else form.appendChild(optionalPanel);
      }

      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (form.querySelector('[data-authoring-mode-input]')?.value === 'canvas') {
        optionalPanel.open = true;
      }
    });

    refreshIcons();
  }

  // H?m initAuthoringModeControls d?ng ?? kh?i t?o tr?ng th?i v? c?c ph? thu?c c?n thi?t; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  function initAuthoringModeControls(root = document) {
    root.querySelectorAll('[data-authoring-mode]:not([data-authoring-mode-ready])').forEach((switcher) => {
      const form = switcher.closest('form');
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (!form) return;
      switcher.dataset.authoringModeReady = 'true';
      const hiddenInput = form.querySelector('[data-authoring-mode-input]');
      const radios = Array.from(switcher.querySelectorAll('input[type="radio"]'));
      const panels = Array.from(form.querySelectorAll('[data-author-mode-panel]'));
      const gridInput = form.querySelector('[data-grid-layout-input]');
      const gridEnabledInput = form.querySelector('[data-grid-enabled]');

      // H?m setGridEnabled d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
      const setGridEnabled = (enabled, notifyChange = true) => {
        const grid = parseGridLayoutValue(gridInput?.value);
        grid.enabled = enabled;
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (gridInput) {
          gridInput.value = JSON.stringify(grid);
          // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
          if (notifyChange) gridInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (gridEnabledInput) {
          gridEnabledInput.checked = enabled;
          // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
          if (notifyChange) gridEnabledInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
      };

      // H?m applyMode d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
      const applyMode = (mode, notifyChange = true) => {
        const normalizedMode = mode === 'canvas' ? 'canvas' : 'fields';
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (hiddenInput) hiddenInput.value = normalizedMode;
        radios.forEach((radio) => {
          radio.checked = radio.value === normalizedMode;
        });
        panels.forEach((panel) => {
          const isActive = panel.dataset.authorModePanel === normalizedMode;
          panel.hidden = !isActive;
          panel.querySelectorAll('input, textarea, select, button').forEach((control) => {
            // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
            if (control.matches('[data-grid-enabled]')) return;
            control.disabled = !isActive;
          });
        });
        setGridEnabled(normalizedMode === 'canvas', notifyChange);
      };

      radios.forEach((radio) => {
        radio.addEventListener('change', () => {
          // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
          if (radio.checked) applyMode(radio.value);
        });
      });

      // Chỉ đồng bộ giao diện khi form vừa được nạp. Không phát input/change ở đây,
      // nếu không bộ cảnh báo rời trang sẽ hiểu nhầm là quản trị viên đã sửa dữ liệu.
      applyMode(hiddenInput?.value || radios.find((radio) => radio.checked)?.value || 'fields', false);
    });
  }

  // H?m initGridEditors d?ng ?? kh?i t?o tr?ng th?i v? c?c ph? thu?c c?n thi?t; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  function initGridEditors(root = document) {
    root.querySelectorAll('[data-grid-editor]:not([data-grid-editor-ready])').forEach((editor) => {
      const input = editor.closest('form')?.querySelector('[data-grid-layout-input]');
      const canvas = editor.querySelector('[data-grid-canvas]');
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (!input || !canvas) return;

      editor.dataset.gridEditorReady = 'true';
      const state = {
        grid: parseGridLayoutValue(input.value),
        selectedIds: new Set(),
        dragStart: null,
        isDragging: false
      };
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (!state.grid.cells.length) state.grid.cells = createBaseGridCells(state.grid.rows, state.grid.columns);

      const enabledInput = editor.querySelector('[data-grid-enabled]');
      const rowsInput = editor.querySelector('[data-grid-rows]');
      const columnsInput = editor.querySelector('[data-grid-columns]');
      const typeInput = editor.querySelector('[data-grid-cell-type]');
      const textInput = editor.querySelector('[data-grid-cell-text]');
      const imageInput = editor.querySelector('[data-grid-cell-image]');
      const answerInput = editor.querySelector('[data-grid-cell-answer]');
      const alignInput = editor.querySelector('[data-grid-cell-align]');
      const backgroundInput = editor.querySelector('[data-grid-cell-background]');

      // H?m syncInputs d?ng ?? ??ng b? d? li?u gi?a c?c ??nh d?ng ho?c ngu?n kh?c nhau; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
      const syncInputs = (notifyChange = false) => {
        enabledInput.checked = Boolean(state.grid.enabled);
        rowsInput.value = state.grid.rows;
        columnsInput.value = state.grid.columns;
        input.value = JSON.stringify(state.grid);
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (notifyChange) input.dispatchEvent(new Event('input', { bubbles: true }));
      };

      // H?m selectedCells d?ng ?? l?a ch?n ph??ng ?n ph? h?p d?a tr?n tr?ng th?i v? ?u ti?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
      const selectedCells = () => Array.from(state.selectedIds)
        .map((id) => state.grid.cells.find((cell) => cell.id === id))
        .filter(Boolean);

      // H?m syncPanel d?ng ?? ??ng b? d? li?u gi?a c?c ??nh d?ng ho?c ngu?n kh?c nhau; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
      const syncPanel = () => {
        const cell = selectedCells()[0] || state.grid.cells[0];
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (!cell) return;
        typeInput.value = cell.type || 'text';
        textInput.value = cell.text || '';
        imageInput.value = cell.image_url || '';
        answerInput.value = cell.answer_key || '';
        alignInput.value = cell.align || 'center';
        backgroundInput.value = isHexColor(cell.background) ? cell.background : '#ffffff';
      };

      // H?m render d?ng ?? chu?n b? v? hi?n th? k?t qu? cho ng??i d?ng; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
      const render = (notifyChange = false) => {
        editor.classList.toggle('is-disabled', !state.grid.enabled);
        canvas.style.setProperty('--grid-rows', state.grid.rows);
        canvas.style.setProperty('--grid-columns', state.grid.columns);
        canvas.innerHTML = state.grid.cells.map((cell) => `
          <button class="grid-editor-cell ${state.selectedIds.has(cell.id) ? 'is-selected' : ''}" type="button"
            data-cell-id="${escapeAttribute(cell.id)}"
            style="grid-row:${cell.row} / span ${cell.rowSpan}; grid-column:${cell.col} / span ${cell.colSpan}; ${cell.background ? `background:${escapeAttribute(cell.background)};` : ''}">
            <span class="grid-cell-type">${gridCellTypeLabel(cell.type)}${cell.answer_key ? ` ${escapeHtml(cell.answer_key)}` : ''}</span>
            <span class="grid-cell-preview">${gridCellPreview(cell)}</span>
          </button>
        `).join('');
        syncInputs(notifyChange);
        syncPanel();
        renderMath(canvas);
      };

      // H?m selectRect d?ng ?? l?a ch?n ph??ng ?n ph? h?p d?a tr?n tr?ng th?i v? ?u ti?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
      const selectRect = (startCell, endCell) => {
        const rect = normalizeRect(cellRect(startCell), cellRect(endCell));
        state.selectedIds = new Set(
          state.grid.cells
            .filter((cell) => rectContainsCell(rect, cell))
            .map((cell) => cell.id)
        );
        render();
      };

      canvas.addEventListener('mousedown', (event) => {
        const button = event.target.closest('[data-cell-id]');
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (!button) return;
        const cell = state.grid.cells.find((item) => item.id === button.dataset.cellId);
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (!cell) return;
        state.dragStart = cell;
        state.isDragging = true;
        state.selectedIds = new Set([cell.id]);
        render();
      });

      canvas.addEventListener('mouseover', (event) => {
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (!state.isDragging || !state.dragStart) return;
        const button = event.target.closest('[data-cell-id]');
        const cell = state.grid.cells.find((item) => item.id === button?.dataset.cellId);
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (cell) selectRect(state.dragStart, cell);
      });

      // Listener gắn ở document nên sống lâu hơn canvas: partial admin nạp lại
      // là canvas cũ bị thay nhưng listener cũ vẫn tích lũy. Cho nó tự gỡ khi
      // thấy canvas không còn trong DOM.
      const onDocumentMouseUp = () => {
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (!canvas.isConnected) {
          document.removeEventListener('mouseup', onDocumentMouseUp);
          return;
        }
        state.isDragging = false;
        state.dragStart = null;
      };
      document.addEventListener('mouseup', onDocumentMouseUp);

      // H?m applyPanelToSelection d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
      const applyPanelToSelection = () => {
        const cells = selectedCells();
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (!cells.length) return;
        cells.forEach((cell) => {
          cell.type = typeInput.value || 'text';
          cell.text = textInput.value || '';
          cell.image_url = imageInput.value || '';
          cell.answer_key = answerInput.value || '';
          cell.align = alignInput.value || 'center';
          cell.background = backgroundInput.value === '#ffffff' ? '' : backgroundInput.value;
        });
        render(true);
      };

      [typeInput, textInput, imageInput, answerInput, alignInput, backgroundInput].forEach((control) => {
        control?.addEventListener('input', applyPanelToSelection);
        control?.addEventListener('change', applyPanelToSelection);
      });

      enabledInput.addEventListener('change', () => {
        state.grid.enabled = enabledInput.checked;
        render(true);
      });

      [rowsInput, columnsInput].forEach((control) => {
        control.addEventListener('change', () => {
          const nextRows = clampGridSize(rowsInput.value);
          const nextColumns = clampGridSize(columnsInput.value);
          state.grid.rows = nextRows;
          state.grid.columns = nextColumns;
          state.grid.cells = createBaseGridCells(nextRows, nextColumns);
          state.selectedIds.clear();
          render(true);
        });
      });

      editor.querySelector('[data-grid-merge]')?.addEventListener('click', async () => {
        const cells = selectedCells();
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (cells.length < 2) return;
        const rect = boundsForCells(cells);
        const affected = state.grid.cells.filter((cell) => rectIntersectsCell(rect, cell));
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (!affected.every((cell) => rectContainsCell(rect, cell))) {
          await window.AppUI.alert({
            title: 'Không thể gộp ô',
            message: 'Vùng gộp không hợp lệ vì đang cắt ngang một ô đã gộp.',
            tone: 'warning'
          });
          return;
        }
        const master = { ...cells[0], id: `grid-cell-${Date.now()}`, row: rect.row, col: rect.col, rowSpan: rect.rowSpan, colSpan: rect.colSpan };
        state.grid.cells = state.grid.cells.filter((cell) => !affected.some((item) => item.id === cell.id));
        state.grid.cells.push(master);
        state.grid.cells.sort((a, b) => (a.row - b.row) || (a.col - b.col));
        state.selectedIds = new Set([master.id]);
        render(true);
      });

      editor.querySelector('[data-grid-unmerge]')?.addEventListener('click', () => {
        const cell = selectedCells()[0];
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (!cell || (cell.rowSpan === 1 && cell.colSpan === 1)) return;
        state.grid.cells = state.grid.cells.filter((item) => item.id !== cell.id);
        // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
        for (let row = cell.row; row < cell.row + cell.rowSpan; row += 1) {
          // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
          for (let col = cell.col; col < cell.col + cell.colSpan; col += 1) {
            state.grid.cells.push(createGridCell(row, col));
          }
        }
        state.grid.cells.sort((a, b) => (a.row - b.row) || (a.col - b.col));
        state.selectedIds.clear();
        render(true);
      });

      editor.querySelector('[data-grid-clear]')?.addEventListener('click', () => {
        selectedCells().forEach((cell) => {
          cell.type = 'empty';
          cell.text = '';
          cell.image_url = '';
          cell.answer_key = '';
          cell.background = '';
        });
        render(true);
      });

      render();
    });
  }

  // H?m initContentManagers d?ng ?? kh?i t?o tr?ng th?i v? c?c ph? thu?c c?n thi?t; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  function initContentManagers() {
    document.querySelectorAll('[data-content-manager]:not([data-content-manager-ready])').forEach((manager) => {
      manager.dataset.contentManagerReady = 'true';

      const kind = manager.dataset.contentManager;
      const lessonButtons = Array.from(manager.querySelectorAll('[data-lesson-select]'));
      const gradeButtons = Array.from(manager.querySelectorAll('[data-grade-filter]'));
      const searchInput = manager.querySelector('[data-lesson-search]');
      const emptyResult = manager.querySelector('[data-lesson-empty]');
      const emptyWorkspace = manager.querySelector('[data-workspace-empty]');
      const workspacePanel = manager.querySelector('[data-workspace-panel]');
      const workspaceTitle = manager.querySelector('[data-workspace-title]');
      const workspaceMeta = manager.querySelector('[data-workspace-meta]');
      const shell = manager.querySelector('[data-manager-shell]');
      const closeButton = manager.querySelector('[data-workspace-close]');
      let activeGrade = 'all';

      // H?m normalizedText d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
      const normalizedText = (value) => String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase()
        .trim();

      // H?m applyFilters d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
      const applyFilters = () => {
        const query = normalizedText(searchInput?.value);
        let visibleCount = 0;

        lessonButtons.forEach((button) => {
          const matchesGrade = activeGrade === 'all' || button.dataset.grade === activeGrade;
          const matchesQuery = !query || normalizedText(button.dataset.searchText).includes(query);
          button.hidden = !(matchesGrade && matchesQuery);
          // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
          if (!button.hidden) visibleCount += 1;
        });

        manager.querySelectorAll('[data-lesson-chapter]').forEach((chapter) => {
          chapter.hidden = !Array.from(chapter.querySelectorAll('[data-lesson-select]'))
            .some((button) => !button.hidden);
        });
        manager.querySelectorAll('[data-lesson-group]').forEach((group) => {
          group.hidden = !Array.from(group.querySelectorAll('[data-lesson-chapter]'))
            .some((chapter) => !chapter.hidden);
        });

        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (emptyResult) emptyResult.hidden = visibleCount > 0;
      };

      // H?m setLessonInUrl d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
      const setLessonInUrl = (lessonId) => {
        const url = new URL(window.location.href);
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (lessonId) url.searchParams.set('lesson', lessonId);
        // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
        else url.searchParams.delete('lesson');
        window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
      };

      // H?m activateLesson d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
      const activateLesson = async (button, options = {}) => {
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (!button || !shell || !workspacePanel) return;
        const canChangeLesson = await confirmDiscard(
          shell,
          'Bài đang mở có thay đổi chưa lưu. Nếu chọn bài khác, các thay đổi này sẽ bị mất.'
        );
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (!canChangeLesson) return;

        lessonButtons.forEach((item) => {
          const isActive = item === button;
          item.classList.toggle('is-active', isActive);
          item.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (workspaceTitle) workspaceTitle.textContent = button.dataset.lessonTitle || 'Bài học';
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (workspaceMeta) workspaceMeta.textContent = button.dataset.lessonMeta || '';
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (emptyWorkspace) emptyWorkspace.hidden = true;
        workspacePanel.hidden = false;

        shell.dataset.lessonId = button.dataset.lessonId || '';
        shell.dataset.currentPage = '1';
        delete shell.dataset.loaded;
        delete shell.dataset.loadedPage;
        setShellBusy(shell, false);

        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (options.updateUrl !== false) setLessonInUrl(button.dataset.lessonId);

        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (kind === 'questions') {
          await fetchLessonQuestions(shell, 1, { discardConfirmed: true });
        } else {
          await fetchLessonTheory(shell, { discardConfirmed: true });
        }

        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (options.scroll !== false && window.matchMedia('(max-width: 920px)').matches) {
          workspacePanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      };

      gradeButtons.forEach((button) => {
        button.addEventListener('click', () => {
          activeGrade = button.dataset.gradeFilter || 'all';
          gradeButtons.forEach((item) => {
            const isActive = item === button;
            item.classList.toggle('is-active', isActive);
            item.setAttribute('aria-pressed', isActive ? 'true' : 'false');
          });
          applyFilters();
        });
      });

      searchInput?.addEventListener('input', applyFilters);
      lessonButtons.forEach((button) => {
        button.addEventListener('click', () => activateLesson(button));
      });

      closeButton?.addEventListener('click', async () => {
        const canClose = await confirmDiscard(
          shell,
          'Bài đang mở có thay đổi chưa lưu. Nếu đóng không gian làm việc, các thay đổi này sẽ bị mất.'
        );
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (!canClose) return;
        lessonButtons.forEach((button) => button.classList.remove('is-active'));
        lessonButtons.forEach((button) => button.setAttribute('aria-pressed', 'false'));
        workspacePanel.hidden = true;
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (emptyWorkspace) emptyWorkspace.hidden = false;
        shell.innerHTML = '';
        setLessonInUrl('');
      });

      applyFilters();
      const selectedLessonId = manager.dataset.selectedLesson;
      const initialButton = lessonButtons.find((button) => button.dataset.lessonId === selectedLessonId)
        || lessonButtons[0];
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (initialButton) activateLesson(initialButton, { updateUrl: Boolean(selectedLessonId), scroll: false });
    });
  }

  // Luong "flow-step" cu (initQuestionFlowSteps / loadLessonQuestions) da bi go:
  // khong con view nao co [data-question-flow] nen toan bo nhanh nay la code chet.
  // fetchLessonQuestions / fetchLessonTheory ben duoi van song vi trang admin goi
  // truc tiep khi mo tung bai.

  function setShellBusy(shell, isBusy) {
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!shell) return;
    shell.setAttribute('aria-busy', isBusy ? 'true' : 'false');
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (isBusy) shell.dataset.loading = 'true';
    // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
    else delete shell.dataset.loading;
  }

  // H?m fetchLessonQuestions d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  async function fetchLessonQuestions(shell, page = 1, options = {}) {
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!shell) return;
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (
      !options.discardConfirmed
      && !await confirmDiscard(
        shell,
        'Danh sách câu hỏi có thay đổi chưa lưu. Nếu tải nội dung khác, các thay đổi này sẽ bị mất.'
      )
    ) return;
    const lessonId = shell.dataset.lessonId;
    const requestId = nextContentRequestId(`${lessonId}:${page}`);
    shell.dataset.requestId = requestId;
    setShellBusy(shell, true);
    shell.innerHTML = '<div class="empty-state compact">Đang tải danh sách câu hỏi...</div>';

    // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
    try {
      // Bộ lọc độ khó/từ khóa lưu trên dataset của shell để các lần lật trang
      // sau vẫn giữ nguyên điều kiện lọc.
      const params = new URLSearchParams({ page: String(page), limit: '8' });
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (shell.dataset.filterDifficulty) params.set('difficulty', shell.dataset.filterDifficulty);
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (shell.dataset.filterKeyword) params.set('q', shell.dataset.filterKeyword);
      const url = `/admin/questions/lesson/${encodeURIComponent(lessonId)}?${params.toString()}`;
      const response = await fetch(url, {
        headers: { 'X-Requested-With': 'fetch' }
      });
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (!response.ok) throw new Error('Không tải được dữ liệu câu hỏi.');

      const html = await response.text();
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (shell.dataset.requestId !== requestId) return;
      shell.innerHTML = html;
      shell.dataset.loaded = 'true';
      shell.dataset.currentPage = String(page);
      shell.dataset.loadedPage = String(page);
      initProgressiveAuthoringForms(shell);
      initAdminPreview(shell);
      initGridEditors(shell);
      initAuthoringModeControls(shell);
      initRenderedGrids(shell);
      initQuestionDetailsControls(shell);
      initQuestionEditLoaders(shell);
      initQuestionFormGuards(shell);
      initConfirmForms(shell);
      initLazyMath(shell);
      bindQuestionPagination(shell);
      refreshIcons();
    } catch (error) {
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (shell.dataset.requestId !== requestId) return;
      shell.innerHTML = '<div class="empty-state compact danger">Không tải được danh sách câu hỏi. Vui lòng tải lại trang hoặc thử lại.</div>';
    } finally {
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (shell.dataset.requestId === requestId) setShellBusy(shell, false);
    }
  }

  // H?m bindQuestionPagination d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  function bindQuestionPagination(shell) {
    shell.querySelectorAll('[data-question-page]').forEach((button) => {
      button.addEventListener('click', () => {
        const page = Number(button.dataset.questionPage || 1);
        fetchLessonQuestions(shell, page);
      });
    });

    // Thanh lọc trong bài: submit là tải lại partial từ trang 1 với điều kiện
    // mới; "Bỏ lọc" xóa điều kiện rồi tải lại toàn bộ.
    shell.querySelectorAll('[data-question-filter]').forEach((form) => {
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const canFilter = await confirmDiscard(
          shell,
          'Có biểu mẫu câu hỏi chưa lưu. Nếu áp dụng bộ lọc, các thay đổi này sẽ bị mất.'
        );
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (!canFilter) return;
        shell.dataset.filterDifficulty = String(form.querySelector('[name="difficulty"]')?.value || '');
        shell.dataset.filterKeyword = String(form.querySelector('[name="q"]')?.value || '').trim();
        delete shell.dataset.loadedPage;
        fetchLessonQuestions(shell, 1, { discardConfirmed: true });
      });

      form.querySelector('[data-question-filter-clear]')?.addEventListener('click', async () => {
        const canClearFilter = await confirmDiscard(
          shell,
          'Có biểu mẫu câu hỏi chưa lưu. Nếu bỏ bộ lọc, các thay đổi này sẽ bị mất.'
        );
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (!canClearFilter) return;
        delete shell.dataset.filterDifficulty;
        delete shell.dataset.filterKeyword;
        delete shell.dataset.loadedPage;
        fetchLessonQuestions(shell, 1, { discardConfirmed: true });
      });
    });
  }

  // H?m initQuestionEditLoaders d?ng ?? kh?i t?o tr?ng th?i v? c?c ph? thu?c c?n thi?t; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  function initQuestionEditLoaders(root = document) {
    root.querySelectorAll('.inline-edit-panel:not([data-edit-loader-ready])').forEach((details) => {
      const shell = details.querySelector('[data-question-edit-shell]');
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (!shell) return;
      details.dataset.editLoaderReady = 'true';
      details.addEventListener('toggle', () => {
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (!details.open || shell.dataset.loaded === 'true' || shell.dataset.loading === 'true') return;
        loadQuestionEditForm(shell);
      });
    });
  }

  // H?m loadQuestionEditForm d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  async function loadQuestionEditForm(shell) {
    const canLoad = await confirmDiscard(
      shell,
      'Form sửa câu hỏi có thay đổi chưa lưu. Nếu tải lại, các thay đổi này sẽ bị mất.'
    );
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!canLoad) return;
    setShellBusy(shell, true);
    shell.innerHTML = '<div class="empty-state compact">Đang tải form sửa câu hỏi...</div>';

    // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
    try {
      const response = await fetch(`/admin/questions/${encodeURIComponent(shell.dataset.questionId)}/edit`, {
        headers: { 'X-Requested-With': 'fetch' }
      });
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (!response.ok) throw new Error('Không tải được form sửa.');

      shell.innerHTML = await response.text();
      shell.dataset.loaded = 'true';
      initProgressiveAuthoringForms(shell);
      initAdminPreview(shell);
      initGridEditors(shell);
      initAuthoringModeControls(shell);
      initRenderedGrids(shell);
      initQuestionDetailsControls(shell);
      initQuestionFormGuards(shell);
      initLazyMath(shell);
      refreshIcons();
    } catch (error) {
      shell.innerHTML = '<div class="empty-state compact danger">Không tải được form sửa câu hỏi. Vui lòng thử lại.</div>';
    } finally {
      setShellBusy(shell, false);
    }
  }

  // H?m fetchLessonTheory d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  async function fetchLessonTheory(shell, options = {}) {
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!shell) return;
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (
      !options.discardConfirmed
      && !await confirmDiscard(
        shell,
        'Nội dung lý thuyết có thay đổi chưa lưu. Nếu tải nội dung khác, các thay đổi này sẽ bị mất.'
      )
    ) return;
    const lessonId = shell.dataset.lessonId;
    const requestId = nextContentRequestId(lessonId);
    shell.dataset.requestId = requestId;

    setShellBusy(shell, true);
    shell.innerHTML = '<div class="empty-state compact">Đang tải thẻ lý thuyết...</div>';

    // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
    try {
      const response = await fetch(`/admin/theory/lesson/${encodeURIComponent(lessonId)}`, {
        headers: { 'X-Requested-With': 'fetch' }
      });
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (!response.ok) throw new Error('Không tải được dữ liệu lý thuyết.');

      const html = await response.text();
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (shell.dataset.requestId !== requestId) return;
      shell.innerHTML = html;
      shell.dataset.loaded = 'true';
      initProgressiveAuthoringForms(shell);
      initAdminPreview(shell);
      initTheoryEditors(shell);
      initGridEditors(shell);
      initAuthoringModeControls(shell);
      initRenderedGrids(shell);
      initConfirmForms(shell);
      initLazyMath(shell);
      refreshIcons();
    } catch (error) {
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (shell.dataset.requestId !== requestId) return;
      shell.innerHTML = '<div class="empty-state compact danger">Không tải được thẻ lý thuyết. Vui lòng tải lại trang hoặc thử lại.</div>';
    } finally {
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (shell.dataset.requestId === requestId) setShellBusy(shell, false);
    }
  }

  // H?m closeDialog d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  function closeDialog(dialog) {
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (typeof dialog.close === 'function') {
      dialog.close();
    } else {
      dialog.removeAttribute('open');
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    initProgressiveAuthoringForms();
    initAdminPreview();
    initAdminQuestionBank();
    initTheoryEditors();
    initGridEditors();
    initAuthoringModeControls();
    initQuestionEditLoaders();
    initQuestionFormGuards();
  });
})();
