(function () {
  document.addEventListener('DOMContentLoaded', () => {
    refreshIcons();
    renderInitialMath();
    initProgressiveAuthoringForms();
    initAdminPreview();
    initAdminQuestionBank();
    initTheoryEditors();
    initGridEditors();
    initAuthoringModeControls();
    initRenderedGrids();
    initQuestionEditLoaders();
    initLazyMath();
    initQuestionFormGuards();
    initConfirmForms();
    initAdminDirtyGuard();
  });

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

  // Form mang thuộc tính data-confirm là thao tác không hoàn tác được (xóa chương,
  // xóa bài học). Hỏi lại trước khi gửi đi.
  function initConfirmForms(root = document) {
    root.querySelectorAll('form[data-confirm]:not([data-confirm-ready])').forEach((form) => {
      form.dataset.confirmReady = 'true';
      form.addEventListener('submit', (event) => {
        if (!window.confirm(form.dataset.confirm)) event.preventDefault();
      });
    });
  }

  function refreshIcons() {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  // Hoãn thực thi tới khi người dùng ngừng gõ. Preview của form soạn thảo chạy
  // lại cả KaTeX; không hoãn thì mỗi phím gõ là một lượt dựng lại toàn bộ khung
  // xem trước, máy yếu gõ chữ thấy khựng rõ rệt.
  function debounce(fn, delayMs = 200) {
    let timer = null;
    return (...args) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => fn(...args), delayMs);
    };
  }

  function renderMath(root = document.body) {
    if (window.renderMathInElement) {
      normalizeMathTextNodes(root);
      window.renderMathInElement(root, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
          { left: '\\[', right: '\\]', display: true },
          { left: '\\(', right: '\\)', display: false }
        ],
        throwOnError: false
      });
    }
  }

  function renderInitialMath() {
    document.querySelectorAll('.math-content:not(.math-lazy)').forEach((node) => renderMath(node));
  }

  function initLazyMath(root = document) {
    const nodes = Array.from(root.querySelectorAll('.math-lazy:not([data-math-ready])'));
    if (nodes.length === 0) return;

    const renderNode = (node) => {
      if (!node || node.dataset.mathReady === 'true') return;
      node.dataset.mathReady = 'true';
      renderMath(node);
    };

    if (!('IntersectionObserver' in window)) {
      nodes.forEach(renderNode);
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        renderNode(entry.target);
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '240px 0px' });

    nodes.forEach((node) => observer.observe(node));
  }

  function normalizeMathTextNodes(root) {
    const startNode = root || document.body;
    const walker = document.createTreeWalker(startNode, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (parent.closest('script, style, textarea, input, select, option, pre, code, .katex')) {
          return NodeFilter.FILTER_REJECT;
        }
        return node.nodeValue && node.nodeValue.includes('\\')
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_SKIP;
      }
    });

    const latexCommands = [
      'frac', 'dfrac', 'tfrac', 'sqrt', 'times', 'cdot', 'div',
      'le', 'leq', 'ge', 'geq', 'neq', 'approx', 'sim',
      'pi', 'alpha', 'beta', 'gamma', 'delta', 'theta',
      'angle', 'triangle', 'overline', 'widehat',
      'parallel', 'perp', 'circ', 'degree',
      'mathbb', 'mathcal', 'mathrm',
      'in', 'notin', 'subset', 'subseteq', 'cup', 'cap', 'emptyset', 'varnothing',
      'sin', 'cos', 'tan', 'log',
      'left', 'right', 'begin', 'end',
      'sum', 'prod', 'int', 'lim', 'infty', 'pm', 'mp'
    ].join('|');
    const escapedCommandPattern = new RegExp(`\\\\\\\\{2,}(?=(${latexCommands})\\b)`, 'g');

    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      node.nodeValue = node.nodeValue.replace(escapedCommandPattern, '\\');
    });
  }

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

      editor.querySelector('[data-grid-merge]')?.addEventListener('click', () => {
        const cells = selectedCells();
        if (cells.length < 2) return;
        const rect = boundsForCells(cells);
        const affected = state.grid.cells.filter((cell) => rectIntersectsCell(rect, cell));
        if (!affected.every((cell) => rectContainsCell(rect, cell))) {
          window.alert('Vùng gộp không hợp lệ vì đang cắt ngang một ô đã gộp.');
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

  function createBaseGridCells(rows, columns) {
    const cells = [];
    for (let row = 1; row <= rows; row += 1) {
      for (let col = 1; col <= columns; col += 1) cells.push(createGridCell(row, col));
    }
    return cells;
  }

  function createGridCell(row, col) {
    return { id: `grid-cell-${row}-${col}-${Date.now()}-${Math.random().toString(16).slice(2)}`, row, col, rowSpan: 1, colSpan: 1, type: 'empty', text: '', image_url: '', answer_key: '', align: 'center', background: '' };
  }

  function parseGridLayoutValue(value) {
    try {
      const parsed = typeof value === 'string' && value ? JSON.parse(value) : value;
      const rows = clampGridSize(parsed?.rows || 5);
      const columns = clampGridSize(parsed?.columns || 5);
      const cells = Array.isArray(parsed?.cells) && parsed.cells.length
        ? parsed.cells.map((cell, index) => normalizeGridCell(cell, index, rows, columns)).filter(Boolean)
        : createBaseGridCells(rows, columns);
      return { enabled: Boolean(parsed?.enabled), rows, columns, cells };
    } catch (error) {
      return { enabled: false, rows: 5, columns: 5, cells: createBaseGridCells(5, 5) };
    }
  }

  function normalizeGridCell(cell, index, rows, columns) {
    const row = clampSpan(cell?.row || 1, rows);
    const col = clampSpan(cell?.col || 1, columns);
    return {
      id: String(cell?.id || `grid-cell-${index + 1}`),
      row,
      col,
      rowSpan: clampSpan(cell?.rowSpan || 1, rows - row + 1),
      colSpan: clampSpan(cell?.colSpan || 1, columns - col + 1),
      type: String(cell?.type || 'text'),
      text: String(cell?.text || ''),
      image_url: String(cell?.image_url || ''),
      answer_key: String(cell?.answer_key || '').toUpperCase(),
      align: ['left', 'center', 'right'].includes(cell?.align) ? cell.align : 'center',
      background: String(cell?.background || '')
    };
  }

  function clampGridSize(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(Math.max(Math.round(number), 1), 10) : 5;
  }

  function clampSpan(value, max) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(Math.max(Math.round(number), 1), Math.max(max, 1)) : 1;
  }

  function cellRect(cell) {
    return { row: cell.row, col: cell.col, rowEnd: cell.row + cell.rowSpan - 1, colEnd: cell.col + cell.colSpan - 1 };
  }

  function normalizeRect(a, b) {
    const row = Math.min(a.row, b.row);
    const col = Math.min(a.col, b.col);
    const rowEnd = Math.max(a.rowEnd, b.rowEnd);
    const colEnd = Math.max(a.colEnd, b.colEnd);
    return { row, col, rowEnd, colEnd, rowSpan: rowEnd - row + 1, colSpan: colEnd - col + 1 };
  }

  function boundsForCells(cells) {
    return cells.map(cellRect).reduce((rect, item) => normalizeRect(rect, item));
  }

  function rectContainsCell(rect, cell) {
    const item = cellRect(cell);
    return item.row >= rect.row && item.col >= rect.col && item.rowEnd <= rect.rowEnd && item.colEnd <= rect.colEnd;
  }

  function rectIntersectsCell(rect, cell) {
    const item = cellRect(cell);
    return item.row <= rect.rowEnd && item.rowEnd >= rect.row && item.col <= rect.colEnd && item.colEnd >= rect.col;
  }

  function gridCellTypeLabel(type) {
    const labels = {
      empty: 'Trống',
      text: 'Chữ',
      image: 'Ảnh',
      formula: 'CT',
      question_text: 'Đề',
      answer: 'ĐA',
      free_answer_input: 'Điền',
      solution: 'Giải',
      remember: 'Nhớ',
      instruction: 'HD'
    };
    return labels[type] || 'Chữ';
  }

  function gridCellPreview(cell) {
    if (cell.type === 'image') return cell.image_url ? 'Đã có ảnh' : 'Chưa có ảnh';
    if (cell.type === 'free_answer_input') return 'Ô nhập đáp án';
    return escapeHtml(cell.text || '');
  }

  function isHexColor(value) {
    return /^#[0-9a-f]{6}$/i.test(String(value || ''));
  }

  function parsePreviewImages(value) {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((image) => image?.url) : [];
    } catch (error) {
      return [];
    }
  }

  // Chỉ có MỘT bản renderTheoryCardPreview. Trước đây file có hai bản trùng tên,
  // bản khai báo sau (bản đầy đủ, có layout và grid) đè bản trước theo cơ chế
  // hoisting nên bản trước là code chết và đã được xóa.
  function renderTheoryCardPreview(card) {
    const imagesHtml = (card.images || []).map((image) => `
      <span class="question-image">
        <img src="${escapeAttribute(image.url || '')}" alt="${escapeAttribute(image.alt_text || 'Hình minh họa lý thuyết')}">
      </span>
    `).join('');

    return `
      <article class="theory-preview-card theory-layout-${escapeAttribute(card.layout || 'text_first')}">
        <span class="card-index">Xem trước - ${escapeHtml(theoryTypeLabel(card.type))}</span>
        <h2>${escapeHtml(card.title || '')}</h2>
        ${card.display_text ? `<p class="theory-display-text">${escapeHtml(card.display_text)}</p>` : ''}
        ${renderGridLayout(card.grid_layout)}
        ${imagesHtml ? `<div class="theory-image-row">${imagesHtml}</div>` : ''}
        <div class="theory-body">${escapeHtml(card.body || '')}</div>
        ${card.student_task ? `<p class="theory-task"><strong>Việc cần làm:</strong> ${escapeHtml(card.student_task)}</p>` : ''}
        ${card.example ? `<p class="muted">${escapeHtml(card.example)}</p>` : ''}
        ${card.remember ? `<p class="theory-remember"><strong>Ghi nhớ:</strong> ${escapeHtml(card.remember)}</p>` : ''}
      </article>
    `;
  }

  function theoryTypeLabel(type) {
    const labels = {
      observe: 'Quan sát',
      concept: 'Kiến thức',
      model: 'Ví dụ mẫu',
      quick_try: 'Thử nhanh',
      remember: 'Ghi nhớ'
    };
    return labels[type] || 'Kiến thức';
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
        delete shell.dataset.loading;

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

  async function fetchLessonQuestions(shell, page = 1) {
    if (!shell || shell.dataset.loading === 'true') return;
    const lessonId = shell.dataset.lessonId;
    const requestId = `${lessonId}:${page}:${Date.now()}`;
    shell.dataset.requestId = requestId;
    shell.dataset.loading = 'true';
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
      if (shell.dataset.requestId === requestId) delete shell.dataset.loading;
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
    shell.dataset.loading = 'true';
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
      delete shell.dataset.loading;
    }
  }

  async function fetchLessonTheory(shell) {
    if (!shell || shell.dataset.loading === 'true') return;
    const lessonId = shell.dataset.lessonId;
    const requestId = `${lessonId}:${Date.now()}`;
    shell.dataset.requestId = requestId;

    shell.dataset.loading = 'true';
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
      if (shell.dataset.requestId === requestId) delete shell.dataset.loading;
    }
  }

  function closeDialog(dialog) {
    if (typeof dialog.close === 'function') {
      dialog.close();
    } else {
      dialog.removeAttribute('open');
    }
  }

  function getPreviewImages(imageInput, imageWidthInput, imageAltInput, options = {}) {
    const files = Array.from(imageInput?.files || []);
    const width = Number(imageWidthInput?.value || options.defaultWidth || 70);
    const altText = imageAltInput?.value || options.defaultAlt || 'Hình minh họa';
    const idPrefix = options.idPrefix || 'image';
    const startIndex = Number(options.startIndex || 0);

    return files.map((file, index) => ({
      id: `${idPrefix}-${startIndex + index + 1}`,
      url: URL.createObjectURL(file),
      width_percent: Number.isFinite(width) ? Math.min(Math.max(width, 20), 100) : 70,
      alt_text: files.length === 1 ? altText : `${altText} ${index + 1}`
    }));
  }

  function collectPreviewChoices(form) {
    return Array.from(form.querySelectorAll('[data-preview-choice]')).map((input) => {
      const key = input.dataset.previewChoice;
      const existingInput = form.querySelector(`[data-preview-choice-existing-images="${key}"]`);
      const existingImages = parsePreviewImages(existingInput?.value)
        .filter((image) => !isImageMarkedForRemoval(form, `remove_choice_images_${key}`, image));
      const uploadImages = getPreviewImages(
        form.querySelector(`[data-preview-choice-images="${key}"]`),
        form.querySelector(`[data-preview-choice-image-width="${key}"]`),
        form.querySelector(`[data-preview-choice-image-alt="${key}"]`),
        {
          idPrefix: `choice-${key}-image`,
          startIndex: maxPreviewImageIndex(existingImages, `choice-${key}-image`),
          defaultWidth: 100,
          defaultAlt: `Hình minh họa đáp án ${key}`
        }
      );

      return {
        key,
        text: input.value || 'Chưa nhập đáp án',
        images: [...existingImages, ...uploadImages]
      };
    });
  }

  function ensurePreviewPlaceholders(text, images) {
    let value = text || '';
    images.forEach((image) => {
      if (image.id && !value.includes(`[${image.id}]`)) {
        value = `${value}\n\n[${image.id}]`;
      }
    });
    return value;
  }

  function isImageMarkedForRemoval(form, fieldName, image) {
    const id = String(image?.id || image?.url || '');
    if (!id) return false;
    return Array.from(form.querySelectorAll(`[name="${fieldName}"]:checked`))
      .some((input) => input.value === id);
  }

  function stripRemovedPreviewPlaceholders(text, images, form, fieldName) {
    let value = text || '';
    images.forEach((image) => {
      if (isImageMarkedForRemoval(form, fieldName, image) && image.id) {
        value = value.replaceAll(`[${image.id}]`, '');
      }
    });
    return value;
  }

  function maxPreviewImageIndex(images, idPrefix) {
    const pattern = new RegExp(`^${escapeRegExp(idPrefix)}-(\\d+)$`);
    return (images || []).reduce((max, image) => {
      const match = String(image?.id || '').match(pattern);
      return match ? Math.max(max, Number(match[1]) || 0) : max;
    }, 0);
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function normalizeImagesForRender(images) {
    return (Array.isArray(images) ? images : [])
      .map((image, index) => ({
        id: String(image?.id || `image-${index + 1}`),
        url: String(image?.url || image?.src || image?.image_url || ''),
        width_percent: Number(image?.width_percent || image?.width || 100),
        alt_text: String(image?.alt_text || image?.alt || 'Hình minh họa')
      }))
      .filter((image) => image.url);
  }

  function renderImageNode(image, fallbackAlt = 'Hình minh họa') {
    const width = Number(image.width_percent || 100);
    return `
      <span class="question-image" style="max-width:${Math.min(Math.max(width, 20), 100)}%">
        <img src="${escapeAttribute(image.url || '')}" alt="${escapeAttribute(image.alt_text || fallbackAlt)}" loading="lazy" decoding="async">
      </span>
    `;
  }

  function renderImageRow(images, className = 'question-image-row', fallbackAlt = 'Hình minh họa') {
    const html = normalizeImagesForRender(images).map((image) => renderImageNode(image, fallbackAlt)).join('');
    return html ? `<div class="${className}">${html}</div>` : '';
  }

  function renderTextWithImagePlaceholders(text, images, fallbackAlt = 'Hình minh họa') {
    const normalizedImages = normalizeImagesForRender(images);
    let html = escapeHtml(text || '');
    const usedImageIds = new Set();

    normalizedImages.forEach((image) => {
      const placeholder = escapeHtml(`[${image.id}]`);
      if (!html.includes(placeholder)) return;
      html = html.replaceAll(placeholder, renderImageNode(image, fallbackAlt));
      usedImageIds.add(image.id);
    });

    const textHtml = html.replace(/\r?\n/g, '<br>');
    const missingImages = normalizedImages.filter((image) => !usedImageIds.has(image.id));

    return `
      <div class="question-text-row">${textHtml}</div>
      ${renderImageRow(missingImages, 'question-image-row', fallbackAlt)}
    `;
  }

  function stripImagePlaceholders(text, images) {
    let value = String(text || '');
    normalizeImagesForRender(images).forEach((image) => {
      value = value.replaceAll(`[${image.id}]`, '');
    });
    return value;
  }

  function initRenderedGrids(root = document) {
    root.querySelectorAll('[data-grid-render]:not([data-grid-render-ready])').forEach((node) => {
      node.dataset.gridRenderReady = 'true';
      node.innerHTML = renderGridLayout(parseGridLayoutValue(node.dataset.gridRender));
      renderMath(node);
    });
  }

  function renderGridLayout(gridLayout, options = {}) {
    const grid = parseGridLayoutValue(gridLayout);
    if (!grid.enabled) return '';
    return `
      <div class="content-grid-layout" style="--grid-rows:${grid.rows}; --grid-columns:${grid.columns};">
        ${grid.cells.map((cell) => renderGridCell(cell, options)).join('')}
      </div>
    `;
  }

  function renderGridCell(cell, options = {}) {
    const style = [
      `grid-row:${cell.row} / span ${cell.rowSpan}`,
      `grid-column:${cell.col} / span ${cell.colSpan}`,
      cell.background ? `background:${escapeAttribute(cell.background)}` : '',
      cell.align ? `text-align:${escapeAttribute(cell.align)}` : ''
    ].filter(Boolean).join(';');
    const content = renderGridCellContent(cell, options);
    const classes = `content-grid-cell grid-cell-${escapeAttribute(cell.type || 'text')}`;

    if (cell.type === 'answer' && cell.answer_key && !options.preview) {
      return `<button class="${classes} answer-choice" type="button" data-answer="${escapeAttribute(cell.answer_key)}" style="${style}">${content}</button>`;
    }

    return `<div class="${classes}" style="${style}">${content}</div>`;
  }

  function renderGridCellContent(cell, options = {}) {
    if (cell.type === 'empty') return '';
    if (cell.type === 'image') {
      return cell.image_url
        ? `<img src="${escapeAttribute(cell.image_url)}" alt="${escapeAttribute(cell.text || 'Hình minh họa')}" loading="lazy" decoding="async">`
        : '<span class="muted">Chưa có ảnh</span>';
    }
    if (cell.type === 'answer') {
      const label = cell.answer_key ? `<span>${escapeHtml(cell.answer_key)}</span>` : '';
      return `${label}<strong>${escapeHtml(cell.text || 'Đáp án')}</strong>`;
    }
    if (cell.type === 'free_answer_input') {
      return options.preview
        ? '<div class="free-answer-input preview-free-answer">Học sinh sẽ điền đáp án tại đây</div>'
        : '<input class="free-answer-input" data-free-answer-input autocomplete="off" inputmode="decimal" placeholder="Nhập đáp án">';
    }
    return escapeHtml(cell.text || '').replace(/\r?\n/g, '<br>');
  }

  function gridHasInteractiveAnswer(gridLayout) {
    const grid = parseGridLayoutValue(gridLayout);
    return grid.enabled && grid.cells.some((cell) => cell.type === 'answer' || cell.type === 'free_answer_input');
  }

  function renderQuestionContent(questionOrContent) {
    const question = questionOrContent && questionOrContent.content
      ? questionOrContent
      : { content: questionOrContent || {}, layout_template: 'STACK_VERTICAL' };
    const content = question.content || {};
    const images = normalizeImagesForRender(content.images);
    const layout = content.layout_variant || question.layout_template || 'STACK_VERTICAL';
    const gridHtml = renderGridLayout(content.grid_layout);

    if (layout === 'VISUAL_TOP' || layout === 'VISUAL_BOTTOM') {
      const imagePanel = renderImageRow(images, 'question-image-row split-image-row', 'Hình minh họa đề bài');
      const textPanel = `<div class="question-text-row">${escapeHtml(stripImagePlaceholders(content.text, images)).replace(/\r?\n/g, '<br>')}</div>`;
      return `
        <div class="question-visual-stack ${layout === 'VISUAL_TOP' ? 'visual-top' : 'visual-bottom'}">
          ${gridHtml}
          ${layout === 'VISUAL_TOP' ? `${imagePanel}${textPanel}` : `${textPanel}${imagePanel}`}
        </div>
      `;
    }

    if (layout === 'SPLIT_HORIZONTAL_LEFT_IMAGE' || layout === 'SPLIT_HORIZONTAL_RIGHT_IMAGE') {
      const imagePanel = renderImageRow(images, 'question-image-row split-image-row', 'Hình minh họa đề bài');
      const textPanel = `<div class="question-text-row">${escapeHtml(stripImagePlaceholders(content.text, images)).replace(/\r?\n/g, '<br>')}</div>`;
      return `
        <div class="question-split-layout ${layout === 'SPLIT_HORIZONTAL_LEFT_IMAGE' ? 'image-left' : 'image-right'}">
          ${gridHtml}
          ${layout === 'SPLIT_HORIZONTAL_LEFT_IMAGE' ? `${imagePanel}${textPanel}` : `${textPanel}${imagePanel}`}
        </div>
      `;
    }

    return `${gridHtml}${renderTextWithImagePlaceholders(content.text, images, 'Hình minh họa đề bài')}`;
  }

  function answerGridClass(question) {
    const layout = question?.content?.layout_variant || question?.layout_template;
    return layout === 'IMAGE_IN_CHOICES' ? 'answer-grid-image-choices' : '';
  }

  function renderAnswerArea(question, options = {}) {
    if (gridHasInteractiveAnswer(question?.content?.grid_layout)) {
      return '';
    }

    if (question?.question_type === 'FILL_IN_THE_BLANK') {
      const inputHtml = options.preview
        ? '<div class="free-answer-input preview-free-answer">Học sinh sẽ điền đáp án tại đây</div>'
        : '<input class="free-answer-input" data-free-answer-input autocomplete="off" inputmode="decimal" placeholder="Nhập đáp án của em">';
      return `<div class="free-answer-area">${inputHtml}</div>`;
    }

    return `
      <div class="answer-grid ${answerGridClass(question)}">
        ${renderChoices(question, options)}
      </div>
    `;
  }

  function renderChoices(question, options = {}) {
    return (question.choices || []).map((choice) => {
      const tag = options.preview ? 'div' : 'button';
      const typeAttr = options.preview ? '' : ' type="button"';
      const previewClass = options.preview ? ' preview-choice' : '';
      const images = renderImageRow(choice.images, 'choice-image-row', `Hình minh họa đáp án ${choice.key}`);
      const text = choice.text ? `<strong>${escapeHtml(choice.text)}</strong>` : '<strong class="muted">Đáp án bằng hình ảnh</strong>';
      return `
        <${tag} class="answer-choice${previewClass}"${typeAttr} data-answer="${escapeAttribute(choice.key)}">
          <span>${escapeHtml(choice.key)}</span>
          <div class="choice-body">
            ${text}
            ${images}
          </div>
        </${tag}>
      `;
    }).join('');
  }

  function renderExplanationContent(explanation) {
    const images = normalizeImagesForRender(explanation?.images);
    const text = String(explanation?.text || '').trim();
    const steps = Array.isArray(explanation?.steps) && explanation.steps.length
      ? `<ol>${explanation.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol>`
      : '';
    const textHtml = text ? `<div class="explanation-text math-content">${renderTextWithImagePlaceholders(text, images, 'Hình minh họa lời giải')}</div>` : '';

    return `
      ${textHtml || renderImageRow(images, 'explanation-image-row', 'Hình minh họa lời giải')}
      ${steps}
    `;
  }

  function translateDifficulty(value) {
    const map = {
      EASY: 'Dễ',
      MEDIUM: 'Trung bình',
      HARD: 'Khó',
      EXPERT: 'Nâng cao'
    };
    return map[value] || value || 'Chưa phân loại';
  }

  function translateLayout(value) {
    const map = {
      STACK_VERTICAL: 'Xếp dọc',
      SPLIT_HORIZONTAL_LEFT_IMAGE: 'Ảnh trái',
      SPLIT_HORIZONTAL_RIGHT_IMAGE: 'Ảnh phải',
      IMAGE_IN_CHOICES: 'Ảnh trong đáp án'
    };
    return map[value] || 'Xếp dọc';
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replaceAll('`', '&#096;');
  }
  window.AppUI = {
    escapeHtml,
    renderAnswerArea,
    renderExplanationContent,
    renderMath,
    renderQuestionContent
  };
})();
