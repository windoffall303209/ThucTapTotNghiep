(function (root, factory) {
  const renderer = factory();
  if (typeof module === 'object' && module.exports) module.exports = renderer;
  if (root) root.ContentRenderer = renderer;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replaceAll('`', '&#096;');
  }

  function renderFreeAnswerInput(label = 'Nhập đáp án của em') {
    return `<input class="free-answer-input" data-free-answer-input type="text" autocomplete="off" autocapitalize="off" spellcheck="false" inputmode="text" enterkeyhint="done" aria-label="${escapeAttribute(label)}" placeholder="${escapeAttribute(label)}">`;
  }

  function clamp(value, min, max, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(Math.max(Math.round(number), min), max) : fallback;
  }

  function parseGridLayoutValue(value) {
    try {
      const parsed = typeof value === 'string' && value ? JSON.parse(value) : value;
      const rows = clamp(parsed?.rows || 5, 1, 10, 5);
      const columns = clamp(parsed?.columns || 5, 1, 10, 5);
      const cells = Array.isArray(parsed?.cells)
        ? parsed.cells.map((cell, index) => ({
            id: String(cell?.id || `grid-cell-${index + 1}`),
            row: clamp(cell?.row || 1, 1, rows, 1),
            col: clamp(cell?.col || 1, 1, columns, 1),
            rowSpan: clamp(cell?.rowSpan || 1, 1, rows, 1),
            colSpan: clamp(cell?.colSpan || 1, 1, columns, 1),
            type: String(cell?.type || 'text'),
            text: String(cell?.text || ''),
            image_url: String(cell?.image_url || ''),
            answer_key: String(cell?.answer_key || '').toUpperCase(),
            align: ['left', 'center', 'right'].includes(cell?.align) ? cell.align : 'center',
            background: String(cell?.background || '')
          }))
        : [];
      return { enabled: Boolean(parsed?.enabled), rows, columns, cells };
    } catch (error) {
      return { enabled: false, rows: 5, columns: 5, cells: [] };
    }
  }

  function normalizeImages(images) {
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
    const width = Math.min(Math.max(Number(image.width_percent || 100), 20), 100);
    return `<span class="question-image" style="max-width:${width}%"><img src="${escapeAttribute(image.url)}" alt="${escapeAttribute(image.alt_text || fallbackAlt)}" loading="lazy" decoding="async"></span>`;
  }

  function renderImageRow(images, className = 'question-image-row', fallbackAlt = 'Hình minh họa') {
    const html = normalizeImages(images).map((image) => renderImageNode(image, fallbackAlt)).join('');
    return html ? `<div class="${escapeAttribute(className)}">${html}</div>` : '';
  }

  function stripImagePlaceholders(text, images) {
    let value = String(text || '');
    normalizeImages(images).forEach((image) => {
      value = value.replaceAll(`[${image.id}]`, '');
    });
    return value;
  }

  function renderTextWithImagePlaceholders(text, images, fallbackAlt = 'Hình minh họa') {
    const normalized = normalizeImages(images);
    let html = escapeHtml(text || '');
    const used = new Set();

    normalized.forEach((image) => {
      const placeholder = escapeHtml(`[${image.id}]`);
      if (!html.includes(placeholder)) return;
      html = html.replaceAll(placeholder, renderImageNode(image, fallbackAlt));
      used.add(image.id);
    });

    return `<div class="question-text-row">${html.replace(/\r?\n/g, '<br>')}</div>${renderImageRow(normalized.filter((image) => !used.has(image.id)), 'question-image-row', fallbackAlt)}`;
  }

  function renderGridCell(cell, options = {}) {
    const style = [
      `grid-row:${cell.row} / span ${cell.rowSpan}`,
      `grid-column:${cell.col} / span ${cell.colSpan}`,
      cell.background ? `background:${escapeAttribute(cell.background)}` : '',
      cell.align ? `text-align:${escapeAttribute(cell.align)}` : ''
    ].filter(Boolean).join(';');
    const classes = ['content-grid-cell', `grid-cell-${escapeAttribute(cell.type || 'text')}`];
    const isSelected = cell.answer_key && cell.answer_key === options.selectedAnswer;
    if (cell.type === 'answer' && cell.answer_key === options.correctAnswer) classes.push('correct');
    if (cell.type === 'answer' && isSelected && cell.answer_key !== options.correctAnswer) classes.push('wrong');

    let content = escapeHtml(cell.text || '').replace(/\r?\n/g, '<br>');
    if (cell.type === 'empty') content = '';
    if (cell.type === 'image') content = cell.image_url
      ? `<img src="${escapeAttribute(cell.image_url)}" alt="${escapeAttribute(cell.text || 'Hình minh họa')}" loading="lazy" decoding="async">`
      : '<span class="muted">Chưa có ảnh</span>';
    if (cell.type === 'answer') content = `${cell.answer_key ? `<span>${escapeHtml(cell.answer_key)}</span>` : ''}<strong>${escapeHtml(cell.text || 'Đáp án')}</strong>`;
    if (cell.type === 'free_answer_input') content = options.preview
      ? `<div class="free-answer-input preview-free-answer">${escapeHtml(options.selectedAnswer || 'Học sinh sẽ điền đáp án tại đây')}</div>`
      : renderFreeAnswerInput(`Nhập đáp án ở hàng ${cell.row}, cột ${cell.col}`);

    const tag = cell.type === 'answer' && cell.answer_key && !options.preview ? 'button' : 'div';
    if (tag === 'button') classes.push('answer-choice');
    const type = tag === 'button' ? ' type="button"' : '';
    const answer = tag === 'button' ? ` data-answer="${escapeAttribute(cell.answer_key)}"` : '';
    return `<${tag} class="${classes.join(' ')}"${type}${answer} style="${style}">${content}</${tag}>`;
  }

  function renderGridLayout(gridLayout, options = {}) {
    const grid = parseGridLayoutValue(gridLayout);
    if (!grid.enabled) return '';
    const layout = `<div class="content-grid-layout" style="--grid-rows:${grid.rows}; --grid-columns:${grid.columns};">${grid.cells.map((cell) => renderGridCell(cell, options)).join('')}</div>`;
    if (options.wrap === false) return layout;
    return `<div class="content-grid-render" role="region" aria-label="Bảng nội dung, có thể cuộn ngang" tabindex="0">${layout}</div>`;
  }

  function gridHasInteractiveAnswer(gridLayout) {
    const grid = parseGridLayoutValue(gridLayout);
    return grid.enabled && grid.cells.some((cell) => cell.type === 'answer' || cell.type === 'free_answer_input');
  }

  function renderQuestionContent(questionOrContent, options = {}) {
    const question = questionOrContent && questionOrContent.content
      ? questionOrContent
      : { content: questionOrContent || {}, layout_template: 'STACK_VERTICAL' };
    const content = question.content || {};
    const images = normalizeImages(content.images);
    const layout = content.layout_variant || question.layout_template || 'STACK_VERTICAL';
    const gridHtml = renderGridLayout(content.grid_layout, options);

    if (layout === 'VISUAL_TOP' || layout === 'VISUAL_BOTTOM') {
      const imagePanel = renderImageRow(images, 'question-image-row split-image-row', 'Hình minh họa đề bài');
      const textPanel = `<div class="question-text-row">${escapeHtml(stripImagePlaceholders(content.text, images)).replace(/\r?\n/g, '<br>')}</div>`;
      return `<div class="question-visual-stack ${layout === 'VISUAL_TOP' ? 'visual-top' : 'visual-bottom'}">${gridHtml}${layout === 'VISUAL_TOP' ? `${imagePanel}${textPanel}` : `${textPanel}${imagePanel}`}</div>`;
    }

    if (layout === 'SPLIT_HORIZONTAL_LEFT_IMAGE' || layout === 'SPLIT_HORIZONTAL_RIGHT_IMAGE') {
      const imagePanel = renderImageRow(images, 'question-image-row split-image-row', 'Hình minh họa đề bài');
      const textPanel = `<div class="question-text-row">${escapeHtml(stripImagePlaceholders(content.text, images)).replace(/\r?\n/g, '<br>')}</div>`;
      const imageLeft = layout === 'SPLIT_HORIZONTAL_LEFT_IMAGE';
      return `<div class="question-split-layout ${imageLeft ? 'image-left' : 'image-right'}">${gridHtml}${imageLeft ? `${imagePanel}${textPanel}` : `${textPanel}${imagePanel}`}</div>`;
    }

    return `${gridHtml}${renderTextWithImagePlaceholders(content.text, images, 'Hình minh họa đề bài')}`;
  }

  function answerGridClass(question) {
    const layout = question?.content?.layout_variant || question?.layout_template;
    return layout === 'IMAGE_IN_CHOICES' ? 'answer-grid-image-choices' : '';
  }

  function renderChoices(question, options = {}) {
    return (question.choices || []).map((choice) => {
      const tag = options.preview ? 'div' : 'button';
      const classes = ['answer-choice'];
      if (options.preview) classes.push('preview-choice');
      if (choice.key === options.correctAnswer) classes.push('correct');
      if (choice.key === options.selectedAnswer && choice.key !== options.correctAnswer) classes.push('wrong');
      const images = renderImageRow(choice.images, 'choice-image-row', `Hình minh họa đáp án ${choice.key}`);
      const text = choice.text ? `<strong>${escapeHtml(choice.text)}</strong>` : '<strong class="muted">Đáp án bằng hình ảnh</strong>';
      return `<${tag} class="${classes.join(' ')}"${options.preview ? '' : ' type="button"'} data-answer="${escapeAttribute(choice.key)}"><span>${escapeHtml(choice.key)}</span><div class="choice-body">${text}${images}</div></${tag}>`;
    }).join('');
  }

  function renderAnswerArea(question, options = {}) {
    if (gridHasInteractiveAnswer(question?.content?.grid_layout)) return '';
    if (question?.question_type === 'FILL_IN_THE_BLANK') {
      const value = options.preview && options.selectedAnswer ? escapeHtml(options.selectedAnswer) : 'Học sinh sẽ điền đáp án tại đây';
      const input = options.preview
        ? `<div class="free-answer-input preview-free-answer">${value}</div>`
        : renderFreeAnswerInput();
      return `<div class="free-answer-area">${input}</div>`;
    }
    return `<div class="answer-grid ${answerGridClass(question)}">${renderChoices(question, options)}</div>`;
  }

  function renderExplanationContent(explanation) {
    const images = normalizeImages(explanation?.images);
    const text = String(explanation?.text || '').trim();
    const steps = Array.isArray(explanation?.steps) && explanation.steps.length
      ? `<ol>${explanation.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol>`
      : '';
    const textHtml = text ? `<div class="explanation-text math-content">${renderTextWithImagePlaceholders(text, images, 'Hình minh họa lời giải')}</div>` : '';
    return `${textHtml || renderImageRow(images, 'explanation-image-row', 'Hình minh họa lời giải')}${steps}`;
  }

  function theoryTypeLabel(type) {
    return ({ observe: 'Quan sát', concept: 'Kiến thức', model: 'Ví dụ mẫu', quick_try: 'Thử nhanh', remember: 'Ghi nhớ' })[type] || 'Kiến thức';
  }

  function renderTheoryCardPreview(card) {
    return `<article class="theory-preview-card theory-layout-${escapeAttribute(card.layout || 'text_first')}"><span class="card-index">Xem trước - ${escapeHtml(theoryTypeLabel(card.type))}</span><h2>${escapeHtml(card.title || '')}</h2>${card.display_text ? `<p class="theory-display-text">${escapeHtml(card.display_text)}</p>` : ''}${renderGridLayout(card.grid_layout, { preview: true })}${renderImageRow(card.images, 'theory-image-row', 'Hình minh họa lý thuyết')}<div class="theory-body">${escapeHtml(card.body || '')}</div>${card.student_task ? `<p class="theory-task"><strong>Việc cần làm:</strong> ${escapeHtml(card.student_task)}</p>` : ''}${card.example ? `<p class="muted">${escapeHtml(card.example)}</p>` : ''}${card.remember ? `<p class="theory-remember"><strong>Ghi nhớ:</strong> ${escapeHtml(card.remember)}</p>` : ''}</article>`;
  }

  function translateDifficulty(value) {
    return ({ EASY: 'Dễ', MEDIUM: 'Trung bình', HARD: 'Khó', EXPERT: 'Nâng cao' })[value] || value || 'Chưa phân loại';
  }

  function translateLayout(value) {
    return ({ STACK_VERTICAL: 'Xếp dọc', SPLIT_HORIZONTAL_LEFT_IMAGE: 'Ảnh trái', SPLIT_HORIZONTAL_RIGHT_IMAGE: 'Ảnh phải', IMAGE_IN_CHOICES: 'Ảnh trong đáp án' })[value] || 'Xếp dọc';
  }

  return {
    escapeAttribute,
    escapeHtml,
    gridHasInteractiveAnswer,
    normalizeImages,
    parseGridLayoutValue,
    renderAnswerArea,
    renderExplanationContent,
    renderGridLayout,
    renderImageNode,
    renderImageRow,
    renderQuestionContent,
    renderTextWithImagePlaceholders,
    renderTheoryCardPreview,
    stripImagePlaceholders,
    theoryTypeLabel,
    translateDifficulty,
    translateLayout
  };
});
