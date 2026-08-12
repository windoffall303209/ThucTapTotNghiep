// Mã JavaScript phía trình duyệt content manager điều khiển tương tác và cập nhật giao diện người dùng.
(function () {
  const {
    collectPreviewChoices,
    debounce,
    ensurePreviewPlaceholders,
    escapeAttribute,
    escapeHtml,
    getPreviewImages,
    initConfirmForms,
    initLazyMath,
    initRenderedGrids,
    isImageMarkedForRemoval,
    maxPreviewImageIndex,
    parseGridLayoutValue,
    parsePreviewImages,
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

  // Hàm nextContentRequestId dùng để xử lý yêu cầu, điều phối các bước nghiệp vụ và phản hồi lỗi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function nextContentRequestId(scope) {
    contentRequestSequence += 1;
    return `${scope}:${contentRequestSequence}`;
  }

  // Hàm confirmDiscard dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  async function confirmDiscard(root, message) {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (typeof window.AdminDirtyForms?.confirmDiscard !== 'function') return true;
    return window.AdminDirtyForms.confirmDiscard(root, {
      message,
      confirmLabel: 'Bỏ thay đổi',
      cancelLabel: 'Tiếp tục chỉnh sửa'
    });
  }

  // Hàm initAdminPreview dùng để khởi tạo trạng thái và các phụ thuộc cần thiết; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function initAdminPreview(root = document) {
    const previewForms = Array.from(root.querySelectorAll('[data-question-preview-form]:not([data-question-preview-ready])'));
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (previewForms.length > 0) {
      previewForms.forEach((form) => {
        const parentDetails = form.closest('details');
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (parentDetails && !parentDetails.open) {
          // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
          if (parentDetails.dataset.questionPreviewToggleReady !== 'true') {
            parentDetails.dataset.questionPreviewToggleReady = 'true';
            parentDetails.addEventListener('toggle', () => {
              // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
              if (parentDetails.open) {
                initAdminPreview(parentDetails);
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
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (legacyPreview && legacyContentInput) {
      initQuestionPreviewForm(root, {
        preview: legacyPreview,
        contentInput: legacyContentInput,
        placeholderList: root.querySelector('#imagePlaceholderList')
      });
    }
  }

  // Hàm initQuestionPreviewForm dùng để khởi tạo trạng thái và các phụ thuộc cần thiết; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function initQuestionPreviewForm(form, overrides = {}) {
    const preview = overrides.preview || form.querySelector('[data-question-preview]');
    const contentInput = overrides.contentInput || form.querySelector('[data-preview-content]') || form.querySelector('[data-preview-source="content"]');
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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

    // Hàm updatePreview dùng để cập nhật trạng thái hoặc dữ liệu theo quy tắc nghiệp vụ; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
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

      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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

  // Hàm initQuestionFormGuards dùng để khởi tạo trạng thái và các phụ thuộc cần thiết; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function initQuestionFormGuards(root = document) {
    root.querySelectorAll('[data-question-preview-form]:not([data-question-guard-ready])').forEach((form) => {
      form.dataset.questionGuardReady = 'true';
      form.addEventListener('submit', (event) => {
        const message = validateQuestionForm(form);
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (!message) {
          clearFormError(form);
          return;
        }
        event.preventDefault();
        showFormError(form, message);
      });
    });
  }

  // Hàm countChoiceImages dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function countChoiceImages(form, key) {
    const existingInput = form.querySelector(`[data-preview-choice-existing-images="${key}"]`);
    const existing = parsePreviewImages(existingInput?.value)
      .filter((image) => !isImageMarkedForRemoval(form, `remove_choice_images_${key}`, image));
    const uploads = form.querySelector(`[data-preview-choice-images="${key}"]`)?.files?.length || 0;
    return existing.length + uploads;
  }

  // Hàm validateQuestionForm dùng để kiểm tra tính hợp lệ và các điều kiện an toàn; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function validateQuestionForm(form) {
    const questionType = form.querySelector('[data-question-type], [name="question_type"]')?.value
      || 'MULTIPLE_CHOICE';
    const contentText = String(form.querySelector('[data-preview-content]')?.value || '').trim();

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!contentText) {
      return 'Chưa có đề bài. Em hãy nhập nội dung đề bài trước khi lưu.';
    }

    const correctAnswer = String(form.querySelector('[name="correct_answer"]:not([disabled])')?.value || '').trim();
    const freeAnswer = String(form.querySelector('[name="correct_answer_free"]:not([disabled])')?.value || '').trim();

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (questionType === 'FILL_IN_THE_BLANK') {
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (!freeAnswer) return 'Chưa nhập đáp án đúng cho dạng điền khuyết.';
      return null;
    }

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!correctAnswer) return 'Chưa chọn đáp án đúng cho câu hỏi.';

    const thieu = ANSWER_KEYS.filter((key) => {
      const text = String(form.querySelector(`[data-preview-choice="${key}"]`)?.value || '').trim();
      return !text && countChoiceImages(form, key) === 0;
    });
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (thieu.length > 0) {
      return `Phương án ${thieu.join(', ')} còn trống. Mỗi phương án cần có nội dung chữ hoặc ảnh minh họa.`;
    }

    const layout = form.querySelector('[name="layout_variant"], [data-layout-variant], [name="layout_template"]')?.value;
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (layout === 'IMAGE_IN_CHOICES'
      && ANSWER_KEYS.every((key) => countChoiceImages(form, key) === 0)) {
      return 'Bố cục ảnh trong đáp án cần có ít nhất một ảnh ở các phương án.';
    }

    return null;
  }

  // Hàm showFormError dùng để chuẩn bị và hiển thị kết quả cho người dùng; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function showFormError(form, message) {
    let box = form.querySelector('[data-form-error]');
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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

  // Hàm clearFormError dùng để xóa hoặc giải phóng tài nguyên theo điều kiện an toàn; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function clearFormError(form) {
    const box = form.querySelector('[data-form-error]');
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (box) box.hidden = true;
  }

  // Hàm initQuestionTypeControls dùng để khởi tạo trạng thái và các phụ thuộc cần thiết; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function initQuestionTypeControls(form, updatePreview) {
    const typeInput = form.querySelector('[data-question-type], [name="question_type"]');
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!typeInput || typeInput.dataset.questionTypeReady === 'true') return;

    const choicePanel = form.querySelector('[data-choice-panel]');
    const correctChoicePanel = form.querySelector('[data-correct-choice-panel]');
    const correctChoiceInput = correctChoicePanel?.querySelector('[name="correct_answer"]');
    const correctFreePanel = form.querySelector('[data-correct-free-panel]');
    const correctFreeInput = correctFreePanel?.querySelector('[name="correct_answer_free"]');
    const interactionInput = form.querySelector('[data-question-interaction], [name="question_interaction"]');

    // Hàm sync dùng để đồng bộ dữ liệu giữa các định dạng hoặc nguồn khác nhau; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
    const sync = () => {
      const isFreeAnswer = typeInput.value === 'FILL_IN_THE_BLANK';
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (choicePanel) choicePanel.hidden = isFreeAnswer;
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (correctChoicePanel) correctChoicePanel.hidden = isFreeAnswer;
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (correctFreePanel) correctFreePanel.hidden = !isFreeAnswer;

      choicePanel?.querySelectorAll('input, select, textarea').forEach((input) => {
        input.disabled = isFreeAnswer;
      });

      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (correctChoiceInput) {
        correctChoiceInput.disabled = isFreeAnswer;
        correctChoiceInput.required = !isFreeAnswer;
      }
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (correctFreeInput) {
        correctFreeInput.disabled = !isFreeAnswer;
        correctFreeInput.required = isFreeAnswer;
      }
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (interactionInput && isFreeAnswer && interactionInput.value === 'choose') {
        interactionInput.value = 'fill_blank';
      }
      updatePreview?.();
    };

    typeInput.dataset.questionTypeReady = 'true';
    typeInput.addEventListener('change', sync);
    sync();
  }

  // Hàm normalizeStorageLayout dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function normalizeStorageLayout(value) {
    const layout = String(value || 'STACK_VERTICAL').toUpperCase();
    return [
      'STACK_VERTICAL',
      'SPLIT_HORIZONTAL_LEFT_IMAGE',
      'SPLIT_HORIZONTAL_RIGHT_IMAGE',
      'IMAGE_IN_CHOICES'
    ].includes(layout) ? layout : 'STACK_VERTICAL';
  }

  // Hàm initAdminQuestionBank dùng để khởi tạo trạng thái và các phụ thuộc cần thiết; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function initAdminQuestionBank() {
    initContentManagers();
    initQuestionDetailsControls();

    const dialog = document.getElementById('questionCreateDialog');
    const lessonInput = document.getElementById('createQuestionLessonId');
    const lessonLabel = document.getElementById('createQuestionLessonLabel');
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!dialog || !lessonInput || !lessonLabel) return;

    document.querySelectorAll('[data-create-question]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();

        const form = dialog.querySelector('form');
        form?.reset();
        lessonInput.value = button.dataset.lessonId || '';
        lessonLabel.textContent = button.dataset.lessonLabel || 'Bài học đã chọn';

        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (event.target === dialog) closeDialog(dialog);
    });
  }

  // Hàm initQuestionDetailsControls dùng để khởi tạo trạng thái và các phụ thuộc cần thiết; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
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
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (!canClose) return;
        form?.reset();
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (details) details.open = false;
      });
    });
  }

  // Hàm initTheoryEditors dùng để khởi tạo trạng thái và các phụ thuộc cần thiết; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function initTheoryEditors(root = document) {
    const forms = Array.from(root.querySelectorAll('[data-theory-preview-form]:not([data-theory-preview-ready])'));
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (forms.length === 0) return;

    initQuestionDetailsControls(root);
    forms.forEach((form) => {
      const parentDetails = form.closest('details');
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (parentDetails && !parentDetails.open) {
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (parentDetails.dataset.theoryPreviewToggleReady !== 'true') {
            parentDetails.dataset.theoryPreviewToggleReady = 'true';
            parentDetails.addEventListener('toggle', () => {
              // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
              if (parentDetails.open) {
                initTheoryEditors(parentDetails);
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

  // Hàm initTheoryPreviewForm dùng để khởi tạo trạng thái và các phụ thuộc cần thiết; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function initTheoryPreviewForm(form) {
    const preview = form.querySelector('[data-theory-preview]');
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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

    // Hàm updatePreview dùng để cập nhật trạng thái hoặc dữ liệu theo quy tắc nghiệp vụ; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
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

  // Hàm initProgressiveAuthoringForms dùng để khởi tạo trạng thái và các phụ thuộc cần thiết; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function initProgressiveAuthoringForms(root = document) {
    root.querySelectorAll('form[data-question-preview-form], form[data-theory-preview-form]').forEach((form) => {
      if (form.dataset.progressiveFormReady === 'true') return;
      form.dataset.progressiveFormReady = 'true';
      form.classList.add('progressive-authoring-form');
    });
    initStudentPreviewDialogs(root);
  }

  function initStudentPreviewDialogs(root = document) {
    root.querySelectorAll('[data-student-preview-dialog]:not([data-student-preview-ready])').forEach((dialog) => {
      const form = dialog.closest('form');
      if (!form) return;
      dialog.dataset.studentPreviewReady = 'true';

      form.querySelectorAll('[data-open-student-preview]').forEach((button) => {
        button.addEventListener('click', () => {
          if (typeof dialog.showModal === 'function') dialog.showModal();
          else dialog.setAttribute('open', '');
          dialog.querySelector('[data-close-student-preview]')?.focus();
        });
      });
      dialog.querySelector('[data-close-student-preview]')?.addEventListener('click', () => closeDialog(dialog));
      dialog.addEventListener('click', (event) => {
        if (event.target === dialog) closeDialog(dialog);
      });
    });
  }

  // Hàm initContentManagers dùng để khởi tạo trạng thái và các phụ thuộc cần thiết; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
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

      // Hàm normalizedText dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
      const normalizedText = (value) => String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase()
        .trim();

      // Hàm applyFilters dùng để cập nhật trạng thái hoặc dữ liệu theo quy tắc nghiệp vụ; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
      const applyFilters = () => {
        const query = normalizedText(searchInput?.value);
        let visibleCount = 0;

        lessonButtons.forEach((button) => {
          const matchesGrade = activeGrade === 'all' || button.dataset.grade === activeGrade;
          const matchesQuery = !query || normalizedText(button.dataset.searchText).includes(query);
          button.hidden = !(matchesGrade && matchesQuery);
          // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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

        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (emptyResult) emptyResult.hidden = visibleCount > 0;
      };

      // Hàm setLessonInUrl dùng để cập nhật trạng thái hoặc dữ liệu theo quy tắc nghiệp vụ; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
      const setLessonInUrl = (lessonId) => {
        const url = new URL(window.location.href);
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (lessonId) url.searchParams.set('lesson', lessonId);
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        else url.searchParams.delete('lesson');
        window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
      };

      // Hàm activateLesson dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
      const activateLesson = async (button, options = {}) => {
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (!button || !shell || !workspacePanel) return;
        const canChangeLesson = await confirmDiscard(
          shell,
          'Bài đang mở có thay đổi chưa lưu. Nếu chọn bài khác, các thay đổi này sẽ bị mất.'
        );
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (!canChangeLesson) return;

        lessonButtons.forEach((item) => {
          const isActive = item === button;
          item.classList.toggle('is-active', isActive);
          item.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (workspaceTitle) workspaceTitle.textContent = button.dataset.lessonTitle || 'Bài học';
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (workspaceMeta) workspaceMeta.textContent = button.dataset.lessonMeta || '';
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (emptyWorkspace) emptyWorkspace.hidden = true;
        workspacePanel.hidden = false;

        shell.dataset.lessonId = button.dataset.lessonId || '';
        shell.dataset.currentPage = '1';
        delete shell.dataset.loaded;
        delete shell.dataset.loadedPage;
        setShellBusy(shell, false);

        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (options.updateUrl !== false) setLessonInUrl(button.dataset.lessonId);

        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (kind === 'questions') {
          await fetchLessonQuestions(shell, 1, { discardConfirmed: true });
        } else {
          await fetchLessonTheory(shell, { discardConfirmed: true });
        }

        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (!canClose) return;
        lessonButtons.forEach((button) => button.classList.remove('is-active'));
        lessonButtons.forEach((button) => button.setAttribute('aria-pressed', 'false'));
        workspacePanel.hidden = true;
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (emptyWorkspace) emptyWorkspace.hidden = false;
        shell.innerHTML = '';
        setLessonInUrl('');
      });

      applyFilters();
      const selectedLessonId = manager.dataset.selectedLesson;
      const initialButton = lessonButtons.find((button) => button.dataset.lessonId === selectedLessonId)
        || lessonButtons[0];
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (initialButton) activateLesson(initialButton, { updateUrl: Boolean(selectedLessonId), scroll: false });
    });
  }

  // Luong "flow-step" cu (initQuestionFlowSteps / loadLessonQuestions) da bi go:
  // khong con view nao co [data-question-flow] nen toan bo nhanh nay la code chet.
  // fetchLessonQuestions / fetchLessonTheory ben duoi van song vi trang admin goi
  // truc tiep khi mo tung bai.

  function setShellBusy(shell, isBusy) {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!shell) return;
    shell.setAttribute('aria-busy', isBusy ? 'true' : 'false');
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (isBusy) shell.dataset.loading = 'true';
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    else delete shell.dataset.loading;
  }

  // Hàm fetchLessonQuestions dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  async function fetchLessonQuestions(shell, page = 1, options = {}) {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!shell) return;
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    try {
      // Bộ lọc độ khó/từ khóa lưu trên dataset của shell để các lần lật trang
      // sau vẫn giữ nguyên điều kiện lọc.
      const params = new URLSearchParams({ page: String(page), limit: '8' });
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (shell.dataset.filterDifficulty) params.set('difficulty', shell.dataset.filterDifficulty);
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (shell.dataset.filterKeyword) params.set('q', shell.dataset.filterKeyword);
      const url = `/admin/questions/lesson/${encodeURIComponent(lessonId)}?${params.toString()}`;
      const response = await fetch(url, {
        headers: { 'X-Requested-With': 'fetch' }
      });
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (!response.ok) throw new Error('Không tải được dữ liệu câu hỏi.');

      const html = await response.text();
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (shell.dataset.requestId !== requestId) return;
      shell.innerHTML = html;
      shell.dataset.loaded = 'true';
      shell.dataset.currentPage = String(page);
      shell.dataset.loadedPage = String(page);
      initProgressiveAuthoringForms(shell);
      initAdminPreview(shell);
      initRenderedGrids(shell);
      initQuestionDetailsControls(shell);
      initQuestionEditLoaders(shell);
      initQuestionFormGuards(shell);
      initConfirmForms(shell);
      initLazyMath(shell);
      bindQuestionPagination(shell);
      refreshIcons();
    } catch (error) {
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (shell.dataset.requestId !== requestId) return;
      shell.innerHTML = '<div class="empty-state compact danger">Không tải được danh sách câu hỏi. Vui lòng tải lại trang hoặc thử lại.</div>';
    } finally {
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (shell.dataset.requestId === requestId) setShellBusy(shell, false);
    }
  }

  // Hàm bindQuestionPagination dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
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
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (!canClearFilter) return;
        delete shell.dataset.filterDifficulty;
        delete shell.dataset.filterKeyword;
        delete shell.dataset.loadedPage;
        fetchLessonQuestions(shell, 1, { discardConfirmed: true });
      });
    });
  }

  // Hàm initQuestionEditLoaders dùng để khởi tạo trạng thái và các phụ thuộc cần thiết; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function initQuestionEditLoaders(root = document) {
    root.querySelectorAll('.inline-edit-panel:not([data-edit-loader-ready])').forEach((details) => {
      const shell = details.querySelector('[data-question-edit-shell]');
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (!shell) return;
      details.dataset.editLoaderReady = 'true';
      details.addEventListener('toggle', () => {
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (!details.open || shell.dataset.loaded === 'true' || shell.dataset.loading === 'true') return;
        loadQuestionEditForm(shell);
      });
    });
  }

  // Hàm loadQuestionEditForm dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  async function loadQuestionEditForm(shell) {
    const canLoad = await confirmDiscard(
      shell,
      'Form sửa câu hỏi có thay đổi chưa lưu. Nếu tải lại, các thay đổi này sẽ bị mất.'
    );
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!canLoad) return;
    setShellBusy(shell, true);
    shell.innerHTML = '<div class="empty-state compact">Đang tải form sửa câu hỏi...</div>';

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    try {
      const response = await fetch(`/admin/questions/${encodeURIComponent(shell.dataset.questionId)}/edit`, {
        headers: { 'X-Requested-With': 'fetch' }
      });
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (!response.ok) throw new Error('Không tải được form sửa.');

      shell.innerHTML = await response.text();
      shell.dataset.loaded = 'true';
      initProgressiveAuthoringForms(shell);
      initAdminPreview(shell);
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

  // Hàm fetchLessonTheory dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  async function fetchLessonTheory(shell, options = {}) {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!shell) return;
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    try {
      const response = await fetch(`/admin/theory/lesson/${encodeURIComponent(lessonId)}`, {
        headers: { 'X-Requested-With': 'fetch' }
      });
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (!response.ok) throw new Error('Không tải được dữ liệu lý thuyết.');

      const html = await response.text();
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (shell.dataset.requestId !== requestId) return;
      shell.innerHTML = html;
      shell.dataset.loaded = 'true';
      initProgressiveAuthoringForms(shell);
      initAdminPreview(shell);
      initTheoryEditors(shell);
      initRenderedGrids(shell);
      initConfirmForms(shell);
      initLazyMath(shell);
      refreshIcons();
    } catch (error) {
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (shell.dataset.requestId !== requestId) return;
      shell.innerHTML = '<div class="empty-state compact danger">Không tải được thẻ lý thuyết. Vui lòng tải lại trang hoặc thử lại.</div>';
    } finally {
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (shell.dataset.requestId === requestId) setShellBusy(shell, false);
    }
  }

  // Hàm closeDialog dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function closeDialog(dialog) {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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
    initQuestionEditLoaders();
    initQuestionFormGuards();
  });
})();
