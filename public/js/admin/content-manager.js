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

  function initAdminPreview(root = document) {
    const previewForms = Array.from(root.querySelectorAll('[data-question-preview-form]:not([data-question-preview-ready])'));
    if (previewForms.length > 0) {
      previewForms.forEach((form) => {
        const parentDetails = form.closest('details');
        if (parentDetails && !parentDetails.open) {
          if (parentDetails.dataset.questionPreviewToggleReady !== 'true') {
            parentDetails.dataset.questionPreviewToggleReady = 'true';
            parentDetails.addEventListener('toggle', () => {
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
    if (legacyPreview && legacyContentInput) {
      initQuestionPreviewForm(root, {
        preview: legacyPreview,
        contentInput: legacyContentInput,
        placeholderList: root.querySelector('#imagePlaceholderList')
      });
    }
  }

  function initQuestionPreviewForm(form, overrides = {}) {
    const preview = overrides.preview || form.querySelector('[data-question-preview]');
    const contentInput = overrides.contentInput || form.querySelector('[data-preview-content]') || form.querySelector('[data-preview-source="content"]');
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

  function initQuestionFormGuards(root = document) {
    root.querySelectorAll('[data-question-preview-form]:not([data-question-guard-ready])').forEach((form) => {
      form.dataset.questionGuardReady = 'true';
      form.addEventListener('submit', (event) => {
        const message = validateQuestionForm(form);
        if (!message) {
          clearFormError(form);
          return;
        }
        event.preventDefault();
        showFormError(form, message);
      });
    });
  }

  function countChoiceImages(form, key) {
    const existingInput = form.querySelector(`[data-preview-choice-existing-images="${key}"]`);
    const existing = parsePreviewImages(existingInput?.value)
      .filter((image) => !isImageMarkedForRemoval(form, `remove_choice_images_${key}`, image));
    const uploads = form.querySelector(`[data-preview-choice-images="${key}"]`)?.files?.length || 0;
    return existing.length + uploads;
  }

  function validateQuestionForm(form) {
    const questionType = form.querySelector('[data-question-type], [name="question_type"]')?.value
      || 'MULTIPLE_CHOICE';
    const authoringMode = form.querySelector('[name="authoring_mode"]')?.value || 'fields';
    const gridLayout = parseGridLayoutValue(form.querySelector('[data-grid-layout-input]')?.value);
    const hasGrid = authoringMode === 'canvas' && gridLayout.enabled;
    const contentText = String(form.querySelector('[data-preview-content]')?.value || '').trim();

    if (!contentText && !hasGrid) {
      return 'Chưa có đề bài. Em hãy nhập nội dung đề bài trước khi lưu.';
    }

    const correctAnswer = String(form.querySelector('[name="correct_answer"]:not([disabled])')?.value || '').trim();
    const freeAnswer = String(form.querySelector('[name="correct_answer_free"]:not([disabled])')?.value || '').trim();

    if (questionType === 'FILL_IN_THE_BLANK') {
      if (!freeAnswer) return 'Chưa nhập đáp án đúng cho dạng điền khuyết.';
      return null;
    }

    if (!correctAnswer) return 'Chưa chọn đáp án đúng cho câu hỏi.';

    // Lưới canvas có thể tự chứa các ô đáp án, khi đó không cần bốn phương án rời.
    const gridAnswerKeys = new Set(
      (gridLayout.cells || [])
        .filter((cell) => cell.type === 'answer' && cell.answer_key)
        .map((cell) => String(cell.answer_key).toUpperCase())
    );
    if (hasGrid && gridAnswerKeys.size >= 2 && gridAnswerKeys.has(correctAnswer.toUpperCase())) {
      return null;
    }

    const thieu = ANSWER_KEYS.filter((key) => {
      const text = String(form.querySelector(`[data-preview-choice="${key}"]`)?.value || '').trim();
      return !text && countChoiceImages(form, key) === 0;
    });
    if (thieu.length > 0) {
      return `Phương án ${thieu.join(', ')} còn trống. Mỗi phương án cần có nội dung chữ hoặc ảnh minh họa.`;
    }

    const layout = form.querySelector('[name="layout_variant"], [data-layout-variant], [name="layout_template"]')?.value;
    if (layout === 'IMAGE_IN_CHOICES'
      && ANSWER_KEYS.every((key) => countChoiceImages(form, key) === 0)) {
      return 'Bố cục ảnh trong đáp án cần có ít nhất một ảnh ở các phương án.';
    }

    return null;
  }

  function showFormError(form, message) {
    let box = form.querySelector('[data-form-error]');
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

  function clearFormError(form) {
    const box = form.querySelector('[data-form-error]');
    if (box) box.hidden = true;
  }

  function initQuestionTypeControls(form, updatePreview) {
    const typeInput = form.querySelector('[data-question-type], [name="question_type"]');
    if (!typeInput || typeInput.dataset.questionTypeReady === 'true') return;

    const choicePanel = form.querySelector('[data-choice-panel]');
    const correctChoicePanel = form.querySelector('[data-correct-choice-panel]');
    const correctChoiceInput = correctChoicePanel?.querySelector('[name="correct_answer"]');
    const correctFreePanel = form.querySelector('[data-correct-free-panel]');
    const correctFreeInput = correctFreePanel?.querySelector('[name="correct_answer_free"]');
    const interactionInput = form.querySelector('[data-question-interaction], [name="question_interaction"]');

    const sync = () => {
      const isFreeAnswer = typeInput.value === 'FILL_IN_THE_BLANK';
      if (choicePanel) choicePanel.hidden = isFreeAnswer;
      if (correctChoicePanel) correctChoicePanel.hidden = isFreeAnswer;
      if (correctFreePanel) correctFreePanel.hidden = !isFreeAnswer;

      choicePanel?.querySelectorAll('input, select, textarea').forEach((input) => {
        input.disabled = isFreeAnswer;
      });

      if (correctChoiceInput) {
        correctChoiceInput.disabled = isFreeAnswer;
        correctChoiceInput.required = !isFreeAnswer;
      }
      if (correctFreeInput) {
        correctFreeInput.disabled = !isFreeAnswer;
        correctFreeInput.required = isFreeAnswer;
      }
      if (interactionInput && isFreeAnswer && interactionInput.value === 'choose') {
        interactionInput.value = 'fill_blank';
      }
      updatePreview?.();
    };

    typeInput.dataset.questionTypeReady = 'true';
    typeInput.addEventListener('change', sync);
    sync();
  }

  function normalizeStorageLayout(value) {
    const layout = String(value || 'STACK_VERTICAL').toUpperCase();
    return [
      'STACK_VERTICAL',
      'SPLIT_HORIZONTAL_LEFT_IMAGE',
      'SPLIT_HORIZONTAL_RIGHT_IMAGE',
      'IMAGE_IN_CHOICES'
    ].includes(layout) ? layout : 'STACK_VERTICAL';
  }

  function initAdminQuestionBank() {
    initContentManagers();
    initQuestionDetailsControls();

    const dialog = document.getElementById('questionCreateDialog');
    const lessonInput = document.getElementById('createQuestionLessonId');
    const lessonLabel = document.getElementById('createQuestionLessonLabel');
    if (!dialog || !lessonInput || !lessonLabel) return;

    document.querySelectorAll('[data-create-question]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();

        const form = dialog.querySelector('form');
        form?.reset();
        lessonInput.value = button.dataset.lessonId || '';
        lessonLabel.textContent = button.dataset.lessonLabel || 'Bài học đã chọn';

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
      if (event.target === dialog) closeDialog(dialog);
    });
  }

  function initQuestionDetailsControls(root = document) {
    root.querySelectorAll('[data-close-details]:not([data-close-details-ready])').forEach((button) => {
      button.dataset.closeDetailsReady = 'true';
      button.addEventListener('click', () => {
        const details = button.closest('details');
        const form = button.closest('form');
        form?.reset();
        if (details) details.open = false;
      });
    });
  }

  function initTheoryEditors(root = document) {
    const forms = Array.from(root.querySelectorAll('[data-theory-preview-form]:not([data-theory-preview-ready])'));
    if (forms.length === 0) return;

    initQuestionDetailsControls(root);
    forms.forEach((form) => {
      const parentDetails = form.closest('details');
      if (parentDetails && !parentDetails.open) {
        if (parentDetails.dataset.theoryPreviewToggleReady !== 'true') {
            parentDetails.dataset.theoryPreviewToggleReady = 'true';
            parentDetails.addEventListener('toggle', () => {
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

  function initTheoryPreviewForm(form) {
    const preview = form.querySelector('[data-theory-preview]');
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

  function initProgressiveAuthoringForms(root = document) {
    root.querySelectorAll('form[data-question-preview-form], form[data-theory-preview-form]').forEach((form) => {
      if (form.dataset.progressiveFormReady === 'true') return;
      form.dataset.progressiveFormReady = 'true';
      form.classList.add('progressive-authoring-form');

      if (form.matches('[data-question-preview-form]')) {
        form.querySelectorAll('.choice-editor').forEach((choiceEditor) => {
          const optionalItems = Array.from(choiceEditor.children)
            .filter((item) => item.matches('.choice-fieldset, .two-fields'));
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

      const addOptional = (item) => {
        if (item && !optionalItems.includes(item)) optionalItems.push(item);
      };

      addOptional(form.querySelector(':scope > [data-authoring-mode]'));
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
      if (optionalItems.length > 0) {
        const actionRows = Array.from(form.querySelectorAll(':scope > .form-actions'));
        const finalActions = actionRows[actionRows.length - 1];
        if (finalActions) form.insertBefore(optionalPanel, finalActions);
        else form.appendChild(optionalPanel);
      }

      if (form.querySelector('[data-authoring-mode-input]')?.value === 'canvas') {
        optionalPanel.open = true;
      }
    });

    refreshIcons();
  }

  function initAuthoringModeControls(root = document) {
    root.querySelectorAll('[data-authoring-mode]:not([data-authoring-mode-ready])').forEach((switcher) => {
      const form = switcher.closest('form');
      if (!form) return;
      switcher.dataset.authoringModeReady = 'true';
      const hiddenInput = form.querySelector('[data-authoring-mode-input]');
      const radios = Array.from(switcher.querySelectorAll('input[type="radio"]'));
      const panels = Array.from(form.querySelectorAll('[data-author-mode-panel]'));
      const gridInput = form.querySelector('[data-grid-layout-input]');
      const gridEnabledInput = form.querySelector('[data-grid-enabled]');

      const setGridEnabled = (enabled, notifyChange = true) => {
        const grid = parseGridLayoutValue(gridInput?.value);
        grid.enabled = enabled;
        if (gridInput) {
          gridInput.value = JSON.stringify(grid);
          if (notifyChange) gridInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (gridEnabledInput) {
          gridEnabledInput.checked = enabled;
          if (notifyChange) gridEnabledInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
      };

      const applyMode = (mode, notifyChange = true) => {
        const normalizedMode = mode === 'canvas' ? 'canvas' : 'fields';
        if (hiddenInput) hiddenInput.value = normalizedMode;
        radios.forEach((radio) => {
          radio.checked = radio.value === normalizedMode;
        });
        panels.forEach((panel) => {
          const isActive = panel.dataset.authorModePanel === normalizedMode;
          panel.hidden = !isActive;
          panel.querySelectorAll('input, textarea, select, button').forEach((control) => {
            if (control.matches('[data-grid-enabled]')) return;
            control.disabled = !isActive;
          });
        });
        setGridEnabled(normalizedMode === 'canvas', notifyChange);
      };

      radios.forEach((radio) => {
        radio.addEventListener('change', () => {
          if (radio.checked) applyMode(radio.value);
        });
      });

      // Chỉ đồng bộ giao diện khi form vừa được nạp. Không phát input/change ở đây,
      // nếu không bộ cảnh báo rời trang sẽ hiểu nhầm là quản trị viên đã sửa dữ liệu.
      applyMode(hiddenInput?.value || radios.find((radio) => radio.checked)?.value || 'fields', false);
    });
  }

  function initGridEditors(root = document) {
    root.querySelectorAll('[data-grid-editor]:not([data-grid-editor-ready])').forEach((editor) => {
      const input = editor.closest('form')?.querySelector('[data-grid-layout-input]');
      const canvas = editor.querySelector('[data-grid-canvas]');
      if (!input || !canvas) return;

      editor.dataset.gridEditorReady = 'true';
      const state = {
        grid: parseGridLayoutValue(input.value),
        selectedIds: new Set(),
        dragStart: null,
        isDragging: false
      };
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

      const syncInputs = (notifyChange = false) => {
        enabledInput.checked = Boolean(state.grid.enabled);
        rowsInput.value = state.grid.rows;
        columnsInput.value = state.grid.columns;
        input.value = JSON.stringify(state.grid);
        if (notifyChange) input.dispatchEvent(new Event('input', { bubbles: true }));
      };

      const selectedCells = () => Array.from(state.selectedIds)
        .map((id) => state.grid.cells.find((cell) => cell.id === id))
        .filter(Boolean);

      const syncPanel = () => {
        const cell = selectedCells()[0] || state.grid.cells[0];
        if (!cell) return;
        typeInput.value = cell.type || 'text';
        textInput.value = cell.text || '';
        imageInput.value = cell.image_url || '';
        answerInput.value = cell.answer_key || '';
        alignInput.value = cell.align || 'center';
        backgroundInput.value = isHexColor(cell.background) ? cell.background : '#ffffff';
      };

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
        if (!button) return;
        const cell = state.grid.cells.find((item) => item.id === button.dataset.cellId);
        if (!cell) return;
        state.dragStart = cell;
        state.isDragging = true;
        state.selectedIds = new Set([cell.id]);
        render();
      });

      canvas.addEventListener('mouseover', (event) => {
        if (!state.isDragging || !state.dragStart) return;
        const button = event.target.closest('[data-cell-id]');
        const cell = state.grid.cells.find((item) => item.id === button?.dataset.cellId);
        if (cell) selectRect(state.dragStart, cell);
      });

      // Listener gắn ở document nên sống lâu hơn canvas: partial admin nạp lại
      // là canvas cũ bị thay nhưng listener cũ vẫn tích lũy. Cho nó tự gỡ khi
      // thấy canvas không còn trong DOM.
      const onDocumentMouseUp = () => {
        if (!canvas.isConnected) {
          document.removeEventListener('mouseup', onDocumentMouseUp);
          return;
        }
        state.isDragging = false;
        state.dragStart = null;
      };
      document.addEventListener('mouseup', onDocumentMouseUp);

      const applyPanelToSelection = () => {
        const cells = selectedCells();
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
        if (cells.length < 2) return;
        const rect = boundsForCells(cells);
        const affected = state.grid.cells.filter((cell) => rectIntersectsCell(rect, cell));
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
        if (!cell || (cell.rowSpan === 1 && cell.colSpan === 1)) return;
        state.grid.cells = state.grid.cells.filter((item) => item.id !== cell.id);
        for (let row = cell.row; row < cell.row + cell.rowSpan; row += 1) {
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

      const normalizedText = (value) => String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase()
        .trim();

      const applyFilters = () => {
        const query = normalizedText(searchInput?.value);
        let visibleCount = 0;

        lessonButtons.forEach((button) => {
          const matchesGrade = activeGrade === 'all' || button.dataset.grade === activeGrade;
          const matchesQuery = !query || normalizedText(button.dataset.searchText).includes(query);
          button.hidden = !(matchesGrade && matchesQuery);
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

        if (emptyResult) emptyResult.hidden = visibleCount > 0;
      };

      const setLessonInUrl = (lessonId) => {
        const url = new URL(window.location.href);
        if (lessonId) url.searchParams.set('lesson', lessonId);
        else url.searchParams.delete('lesson');
        window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
      };

      const activateLesson = async (button, options = {}) => {
        if (!button || !shell || !workspacePanel) return;

        lessonButtons.forEach((item) => item.classList.toggle('is-active', item === button));
        if (workspaceTitle) workspaceTitle.textContent = button.dataset.lessonTitle || 'Bài học';
        if (workspaceMeta) workspaceMeta.textContent = button.dataset.lessonMeta || '';
        if (emptyWorkspace) emptyWorkspace.hidden = true;
        workspacePanel.hidden = false;

        shell.dataset.lessonId = button.dataset.lessonId || '';
        shell.dataset.currentPage = '1';
        delete shell.dataset.loaded;
        delete shell.dataset.loadedPage;
        setShellBusy(shell, false);

        if (options.updateUrl !== false) setLessonInUrl(button.dataset.lessonId);

        if (kind === 'questions') {
          await fetchLessonQuestions(shell, 1);
        } else {
          await fetchLessonTheory(shell);
        }

        if (options.scroll !== false && window.matchMedia('(max-width: 920px)').matches) {
          workspacePanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      };

      gradeButtons.forEach((button) => {
        button.addEventListener('click', () => {
          activeGrade = button.dataset.gradeFilter || 'all';
          gradeButtons.forEach((item) => item.classList.toggle('is-active', item === button));
          applyFilters();
        });
      });

      searchInput?.addEventListener('input', applyFilters);
      lessonButtons.forEach((button) => {
        button.addEventListener('click', () => activateLesson(button));
      });

      closeButton?.addEventListener('click', () => {
        lessonButtons.forEach((button) => button.classList.remove('is-active'));
        workspacePanel.hidden = true;
        if (emptyWorkspace) emptyWorkspace.hidden = false;
        shell.innerHTML = '';
        setLessonInUrl('');
      });

      applyFilters();
      const selectedLessonId = manager.dataset.selectedLesson;
      const initialButton = lessonButtons.find((button) => button.dataset.lessonId === selectedLessonId)
        || lessonButtons[0];
      if (initialButton) activateLesson(initialButton, { updateUrl: Boolean(selectedLessonId), scroll: false });
    });
  }

  // Luong "flow-step" cu (initQuestionFlowSteps / loadLessonQuestions) da bi go:
  // khong con view nao co [data-question-flow] nen toan bo nhanh nay la code chet.
  // fetchLessonQuestions / fetchLessonTheory ben duoi van song vi trang admin goi
  // truc tiep khi mo tung bai.

  function setShellBusy(shell, isBusy) {
    if (!shell) return;
    shell.setAttribute('aria-busy', isBusy ? 'true' : 'false');
    if (isBusy) shell.dataset.loading = 'true';
    else delete shell.dataset.loading;
  }

  async function fetchLessonQuestions(shell, page = 1) {
    if (!shell || shell.dataset.loading === 'true') return;
    const lessonId = shell.dataset.lessonId;
    const requestId = `${lessonId}:${page}:${Date.now()}`;
    shell.dataset.requestId = requestId;
    setShellBusy(shell, true);
    shell.innerHTML = '<div class="empty-state compact">Đang tải danh sách câu hỏi...</div>';

    try {
      // Bộ lọc độ khó/từ khóa lưu trên dataset của shell để các lần lật trang
      // sau vẫn giữ nguyên điều kiện lọc.
      const params = new URLSearchParams({ page: String(page), limit: '8' });
      if (shell.dataset.filterDifficulty) params.set('difficulty', shell.dataset.filterDifficulty);
      if (shell.dataset.filterKeyword) params.set('q', shell.dataset.filterKeyword);
      const url = `/admin/questions/lesson/${encodeURIComponent(lessonId)}?${params.toString()}`;
      const response = await fetch(url, {
        headers: { 'X-Requested-With': 'fetch' }
      });
      if (!response.ok) throw new Error('Không tải được dữ liệu câu hỏi.');

      const html = await response.text();
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
      if (shell.dataset.requestId !== requestId) return;
      shell.innerHTML = '<div class="empty-state compact danger">Không tải được danh sách câu hỏi. Vui lòng tải lại trang hoặc thử lại.</div>';
    } finally {
      if (shell.dataset.requestId === requestId) setShellBusy(shell, false);
    }
  }

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
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        shell.dataset.filterDifficulty = String(form.querySelector('[name="difficulty"]')?.value || '');
        shell.dataset.filterKeyword = String(form.querySelector('[name="q"]')?.value || '').trim();
        delete shell.dataset.loadedPage;
        fetchLessonQuestions(shell, 1);
      });

      form.querySelector('[data-question-filter-clear]')?.addEventListener('click', () => {
        delete shell.dataset.filterDifficulty;
        delete shell.dataset.filterKeyword;
        delete shell.dataset.loadedPage;
        fetchLessonQuestions(shell, 1);
      });
    });
  }

  function initQuestionEditLoaders(root = document) {
    root.querySelectorAll('.inline-edit-panel:not([data-edit-loader-ready])').forEach((details) => {
      const shell = details.querySelector('[data-question-edit-shell]');
      if (!shell) return;
      details.dataset.editLoaderReady = 'true';
      details.addEventListener('toggle', () => {
        if (!details.open || shell.dataset.loaded === 'true' || shell.dataset.loading === 'true') return;
        loadQuestionEditForm(shell);
      });
    });
  }

  async function loadQuestionEditForm(shell) {
    setShellBusy(shell, true);
    shell.innerHTML = '<div class="empty-state compact">Đang tải form sửa câu hỏi...</div>';

    try {
      const response = await fetch(`/admin/questions/${encodeURIComponent(shell.dataset.questionId)}/edit`, {
        headers: { 'X-Requested-With': 'fetch' }
      });
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

  async function fetchLessonTheory(shell) {
    if (!shell || shell.dataset.loading === 'true') return;
    const lessonId = shell.dataset.lessonId;
    const requestId = `${lessonId}:${Date.now()}`;
    shell.dataset.requestId = requestId;

    setShellBusy(shell, true);
    shell.innerHTML = '<div class="empty-state compact">Đang tải thẻ lý thuyết...</div>';

    try {
      const response = await fetch(`/admin/theory/lesson/${encodeURIComponent(lessonId)}`, {
        headers: { 'X-Requested-With': 'fetch' }
      });
      if (!response.ok) throw new Error('Không tải được dữ liệu lý thuyết.');

      const html = await response.text();
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
      if (shell.dataset.requestId !== requestId) return;
      shell.innerHTML = '<div class="empty-state compact danger">Không tải được thẻ lý thuyết. Vui lòng tải lại trang hoặc thử lại.</div>';
    } finally {
      if (shell.dataset.requestId === requestId) setShellBusy(shell, false);
    }
  }

  function closeDialog(dialog) {
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
