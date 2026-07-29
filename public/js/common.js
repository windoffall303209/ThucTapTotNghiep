(function () {
  document.addEventListener('DOMContentLoaded', () => {
    refreshIcons();
    renderInitialMath();
    initRenderedGrids();
    initLazyMath();
    initConfirmForms();
    initPasswordToggles();
    initFlashToasts();
    initAppDialog();
    initFlashModals();
  });

  let appDialogResolver = null;

  function initAppDialog(root = document) {
    const dialog = root.getElementById?.('appDialog') || document.getElementById('appDialog');
    if (!dialog || dialog.dataset.dialogReady === 'true') return dialog;
    dialog.dataset.dialogReady = 'true';

    dialog.querySelector('[data-app-dialog-confirm]')?.addEventListener('click', () => {
      closeAppDialog(dialog, true);
    });
    dialog.querySelector('[data-app-dialog-cancel]')?.addEventListener('click', () => {
      closeAppDialog(dialog, false);
    });
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      closeAppDialog(dialog, false);
    });
    dialog.addEventListener('close', () => settleAppDialog(dialog.returnValue === 'confirm'));
    return dialog;
  }

  function closeAppDialog(dialog, confirmed) {
    if (typeof dialog.close === 'function') {
      dialog.close(confirmed ? 'confirm' : 'cancel');
      return;
    }
    dialog.removeAttribute('open');
    settleAppDialog(confirmed);
  }

  function settleAppDialog(confirmed) {
    const resolver = appDialogResolver;
    appDialogResolver = null;
    if (resolver) resolver(Boolean(confirmed));
  }

  function showAppDialog(options = {}) {
    const dialog = initAppDialog();
    if (!dialog) return Promise.resolve(false);
    if (appDialogResolver) {
      const previousResolver = appDialogResolver;
      appDialogResolver = null;
      previousResolver(false);
      if (dialog.open) {
        if (typeof dialog.close === 'function') dialog.close('cancel');
        else dialog.removeAttribute('open');
      }
    }

    const tone = ['success', 'warning', 'danger'].includes(options.tone)
      ? options.tone
      : 'info';
    const iconName = tone === 'danger'
      ? 'circle-alert'
      : tone === 'warning'
        ? 'triangle-alert'
        : tone === 'success'
          ? 'circle-check'
          : 'info';
    dialog.dataset.tone = tone;
    dialog.querySelector('#appDialogTitle').textContent = options.title || 'Thông báo';
    dialog.querySelector('#appDialogMessage').textContent = options.message || '';

    const icon = dialog.querySelector('[data-app-dialog-icon]');
    if (icon) icon.innerHTML = `<i data-lucide="${iconName}" class="lucide-icon"></i>`;

    const cancelButton = dialog.querySelector('[data-app-dialog-cancel]');
    const confirmButton = dialog.querySelector('[data-app-dialog-confirm]');
    if (cancelButton) {
      cancelButton.hidden = options.showCancel === false;
      cancelButton.textContent = options.cancelLabel || 'Hủy';
    }
    if (confirmButton) confirmButton.textContent = options.confirmLabel || 'Đồng ý';
    refreshIcons();

    return new Promise((resolve) => {
      appDialogResolver = resolve;
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      window.setTimeout(() => confirmButton?.focus(), 0);
    });
  }

  function showAppAlert(options = {}) {
    return showAppDialog({ ...options, showCancel: false, confirmLabel: options.confirmLabel || 'Đã hiểu' });
  }

  function showAppConfirm(options = {}) {
    return showAppDialog({ ...options, showCancel: true });
  }

  function initFlashModals(root = document) {
    root.querySelectorAll('[data-flash-modal]').forEach((source) => {
      showAppAlert({
        title: source.dataset.title || 'Thông báo',
        message: source.dataset.message || '',
        tone: source.dataset.tone || 'info'
      });
      source.remove();
    });
  }

  function initFlashToasts(root = document) {
    root.querySelectorAll('[data-flash-autohide="true"]').forEach((flash) => {
      const requestedDuration = Number(flash.dataset.duration);
      const duration = Number.isFinite(requestedDuration) && requestedDuration > 0
        ? requestedDuration
        : 3000;
      window.setTimeout(() => {
        flash.classList.add('is-hiding');
        window.setTimeout(() => flash.remove(), 220);
      }, duration);
    });
  }

  // Form mang thuộc tính data-confirm là thao tác không hoàn tác được (xóa chương,
  // xóa bài học). Hỏi lại trước khi gửi đi.
  function initConfirmForms(root = document) {
    root.querySelectorAll('form[data-confirm]:not([data-confirm-ready])').forEach((form) => {
      form.dataset.confirmReady = 'true';
      form.addEventListener('submit', async (event) => {
        if (form.dataset.confirmBypass === 'true') {
          delete form.dataset.confirmBypass;
          return;
        }
        event.preventDefault();
        const submitter = event.submitter;
        const confirmed = await showAppConfirm({
          title: 'Xác nhận thao tác',
          message: form.dataset.confirm,
          tone: 'warning',
          confirmLabel: 'Tiếp tục'
        });
        if (!confirmed) return;
        form.dataset.confirmBypass = 'true';
        if (submitter && submitter.form === form) form.requestSubmit(submitter);
        else form.requestSubmit();
      });
    });
  }

  function refreshIcons() {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  function initPasswordToggles(root = document) {
    root.querySelectorAll('[data-password-toggle]:not([data-password-toggle-ready])').forEach((button) => {
      const input = button.closest('.password-field')?.querySelector('input');
      if (!input) return;
      button.dataset.passwordToggleReady = 'true';
      button.addEventListener('click', () => {
        const isVisible = input.type === 'text';
        input.type = isVisible ? 'password' : 'text';
        button.setAttribute('aria-pressed', isVisible ? 'false' : 'true');
        button.setAttribute('aria-label', isVisible ? 'Hiện mật khẩu' : 'Ẩn mật khẩu');
        const icon = button.querySelector('i[data-lucide], svg');
        if (icon) {
          const replacement = document.createElement('i');
          replacement.dataset.lucide = isVisible ? 'eye' : 'eye-off';
          replacement.className = 'lucide-icon';
          icon.replaceWith(replacement);
          refreshIcons();
        }
        input.focus();
      });
    });
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
    boundsForCells,
    cellRect,
    clampGridSize,
    clampSpan,
    collectPreviewChoices,
    createBaseGridCells,
    createGridCell,
    debounce,
    ensurePreviewPlaceholders,
    escapeAttribute: window.ContentRenderer?.escapeAttribute || escapeAttribute,
    escapeHtml: window.ContentRenderer?.escapeHtml || escapeHtml,
    getPreviewImages,
    gridCellPreview,
    gridCellTypeLabel,
    initConfirmForms,
    alert: showAppAlert,
    confirm: showAppConfirm,
    initAppDialog,
    initLazyMath,
    initPasswordToggles,
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
    renderAnswerArea: window.ContentRenderer?.renderAnswerArea || renderAnswerArea,
    renderExplanationContent: window.ContentRenderer?.renderExplanationContent || renderExplanationContent,
    renderMath,
    renderQuestionContent: window.ContentRenderer?.renderQuestionContent || renderQuestionContent,
    renderTheoryCardPreview: window.ContentRenderer?.renderTheoryCardPreview || renderTheoryCardPreview,
    stripRemovedPreviewPlaceholders,
    theoryTypeLabel: window.ContentRenderer?.theoryTypeLabel || theoryTypeLabel,
    translateDifficulty: window.ContentRenderer?.translateDifficulty || translateDifficulty,
    translateLayout: window.ContentRenderer?.translateLayout || translateLayout
  };
})();
