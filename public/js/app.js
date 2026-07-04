(function () {
  const state = {
    questions: [],
    currentIndex: 0,
    selectedAnswer: null,
    answered: false,
    startedAt: Date.now(),
    practiceSessionId: null
  };

  document.addEventListener('DOMContentLoaded', () => {
    refreshIcons();
    renderInitialMath();
    initPractice();
    initTheoryHelp();
    initAdminPreview();
    initSettingsCards();
    initAdminQuestionBank();
    initTheoryEditors();
    initQuestionEditLoaders();
    initLazyMath();
  });

  function refreshIcons() {
    if (window.lucide) {
      window.lucide.createIcons();
    }
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

  function initPractice() {
    const dataNode = document.getElementById('practice-data');
    const app = document.getElementById('practiceApp');
    if (!dataNode || !app) return;

    try {
      state.questions = JSON.parse(dataNode.textContent || '[]');
    } catch (error) {
      state.questions = [];
    }

    const contextNode = document.getElementById('practice-context');
    if (contextNode) {
      try {
        const context = JSON.parse(contextNode.textContent || '{}');
        state.practiceSessionId = context.practiceSessionId || null;
        state.currentIndex = Math.min(Number(context.currentIndex || 0), Math.max(state.questions.length - 1, 0));
      } catch (error) {
        state.practiceSessionId = null;
      }
    }

    renderCurrentQuestion();

    document.getElementById('submitAnswerButton')?.addEventListener('click', submitAnswer);
    document.getElementById('nextQuestionButton')?.addEventListener('click', nextQuestion);
    document.getElementById('finishPracticeButton')?.addEventListener('click', finishPractice);
    document.getElementById('aiHelpForm')?.addEventListener('submit', requestExerciseHelp);
  }

  function renderCurrentQuestion() {
    const app = document.getElementById('practiceApp');
    const counter = document.getElementById('questionCounter');
    const feedback = document.getElementById('answerFeedback');
    const nextButton = document.getElementById('nextQuestionButton');
    const submitButton = document.getElementById('submitAnswerButton');
    const finishButton = document.getElementById('finishPracticeButton');
    const question = state.questions[state.currentIndex];

    if (!app || !question) return;

    state.selectedAnswer = null;
    state.answered = false;
    state.startedAt = Date.now();
    if (feedback) feedback.hidden = true;
    if (nextButton) nextButton.hidden = true;
    if (finishButton) finishButton.hidden = state.currentIndex === 0;
    if (submitButton) submitButton.disabled = false;

    if (counter) {
      counter.textContent = `Câu ${state.currentIndex + 1}/${state.questions.length}`;
    }

    const choices = question.choices.map((choice) => `
      <button class="answer-choice" type="button" data-answer="${escapeHtml(choice.key)}">
        <span>${escapeHtml(choice.key)}</span>
        <strong>${escapeHtml(choice.text)}</strong>
      </button>
    `).join('');

    app.innerHTML = `
      <article class="question-card" data-question-id="${question.id}">
        <div class="question-content math-content">${renderQuestionContent(question.content)}</div>
        <div class="answer-grid">${choices}</div>
      </article>
    `;

    app.querySelectorAll('.answer-choice').forEach((button) => {
      button.addEventListener('click', () => {
        if (state.answered) return;
        state.selectedAnswer = button.dataset.answer;
        app.querySelectorAll('.answer-choice').forEach((item) => item.classList.remove('selected'));
        button.classList.add('selected');
      });
    });

    renderMath(app);
    refreshIcons();
  }

  async function submitAnswer() {
    const question = state.questions[state.currentIndex];
    const feedback = document.getElementById('answerFeedback');
    const submitButton = document.getElementById('submitAnswerButton');
    const nextButton = document.getElementById('nextQuestionButton');
    const finishButton = document.getElementById('finishPracticeButton');

    if (!question || !feedback) return;

    if (!state.selectedAnswer) {
      showFeedback('warning', 'Vui lòng chọn một đáp án trước khi nộp.');
      return;
    }

    submitButton.disabled = true;

    const response = await fetch(`/student/questions/${question.id}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selectedAnswer: state.selectedAnswer,
        practiceSessionId: state.practiceSessionId,
        questionIndex: state.currentIndex,
        timeSpentSeconds: Math.round((Date.now() - state.startedAt) / 1000)
      })
    });

    const result = await response.json();
    if (!result.ok) {
      showFeedback('danger', result.message || 'Không thể nộp đáp án.');
      submitButton.disabled = false;
      return;
    }

    state.answered = true;
    markAnswerState(result);
    showResultFeedback(result);

    if (nextButton && state.currentIndex < state.questions.length - 1) {
      nextButton.hidden = false;
    }
    if (finishButton) {
      finishButton.hidden = false;
    }
  }

  function markAnswerState(result) {
    document.querySelectorAll('.answer-choice').forEach((button) => {
      const answer = button.dataset.answer;
      if (answer === result.correctAnswer) {
        button.classList.add('correct');
      }
      if (answer === state.selectedAnswer && !result.isCorrect) {
        button.classList.add('wrong');
      }
    });
  }

  function showResultFeedback(result) {
    const title = result.isCorrect ? 'Đúng rồi' : 'Chưa đúng';
    const tone = result.isCorrect ? 'success' : 'danger';
    const misconception = result.misconception
      ? `<p><strong>Lỗi sai thường gặp:</strong> ${escapeHtml(result.misconception.explanation)}</p>`
      : '';
    const explanation = result.explanation
      ? `<div class="explanation-content"><strong>Lời giải:</strong>${renderExplanationContent(result.explanation)}</div>`
      : '';

    showFeedback(tone, `
      <h2>${title}</h2>
      <p>${escapeHtml(result.message)}</p>
      ${misconception}
      ${explanation}
    `, true);
  }

  function showFeedback(type, message, isHtml = false) {
    const feedback = document.getElementById('answerFeedback');
    if (!feedback) return;
    feedback.className = `answer-feedback feedback-${type}`;
    feedback.hidden = false;
    feedback.innerHTML = isHtml ? message : escapeHtml(message);
    renderMath(feedback);
  }

  function nextQuestion() {
    if (state.currentIndex < state.questions.length - 1) {
      state.currentIndex += 1;
      renderCurrentQuestion();
    }
  }

  async function finishPractice() {
    if (!state.practiceSessionId) {
      window.location.href = '/student/history';
      return;
    }

    const response = await fetch(`/student/sessions/${state.practiceSessionId}/finish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const result = await response.json();
    window.location.href = result.redirectUrl || '/student/history';
  }

  async function requestExerciseHelp(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.elements.message;
    const button = form.querySelector('button[type="submit"]');
    const question = state.questions[state.currentIndex];
    if (!question) return;

    const message = input.value.trim();
    appendChat('student', message || 'Em muốn được gợi ý thêm.');
    input.value = '';
    input.disabled = true;
    if (button) button.disabled = true;
    const thinkingNode = appendChat('ai', 'Mình đang xem câu này với em...', { loading: true });

    try {
      const response = await fetch('/api/ai/exercise-help', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId: question.id,
          practiceSessionId: state.practiceSessionId,
          selectedAnswer: state.selectedAnswer,
          message
        })
      });

      const result = await response.json();
      const reply = result.ok
        ? result.reply || 'Mình chưa tạo được gợi ý cho câu này. Em thử hỏi lại ngắn hơn nhé.'
        : result.message || 'Mình chưa hỗ trợ được lúc này. Em thử lại sau nhé.';
      updateChat(thinkingNode, reply);
    } catch (error) {
      updateChat(thinkingNode, 'Mình chưa kết nối được gia sư AI lúc này. Em thử gửi lại sau nhé.');
    } finally {
      input.disabled = false;
      if (button) button.disabled = false;
      input.focus();
    }
  }

  function appendChat(role, text, options = {}) {
    const box = document.getElementById('chatMessages');
    if (!box) return null;
    const node = document.createElement('div');
    node.className = `chat-message ${role === 'student' ? 'student' : 'ai'}${options.loading ? ' loading' : ''}`;
    renderChatNode(node, role, text);
    box.appendChild(node);
    box.scrollTop = box.scrollHeight;
    return node;
  }

  function updateChat(node, text) {
    if (!node) return;
    node.classList.remove('loading');
    renderChatNode(node, 'ai', text);
    const box = document.getElementById('chatMessages');
    if (box) box.scrollTop = box.scrollHeight;
  }

  function renderChatNode(node, role, text) {
    if (role === 'ai') {
      node.innerHTML = renderMarkdownText(text);
    } else {
      node.textContent = text;
    }
    renderMath(node);
  }

  function renderMarkdownText(value) {
    let html = escapeHtml(value || '');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    const lines = html.split(/\r?\n/);
    const output = [];
    let listItems = [];
    const flushList = () => {
      if (listItems.length > 0) {
        output.push(`<ul>${listItems.map((item) => `<li>${item}</li>`).join('')}</ul>`);
        listItems = [];
      }
    };

    lines.forEach((line) => {
      const bullet = line.match(/^\s*[-•]\s+(.+)$/);
      const numbered = line.match(/^\s*\d+\.\s+(.+)$/);
      if (bullet || numbered) {
        listItems.push((bullet || numbered)[1]);
        return;
      }
      flushList();
      if (line.trim()) output.push(`<p>${line}</p>`);
    });
    flushList();

    return output.join('');
  }

  function initTheoryHelp() {
    document.querySelectorAll('.theory-help-button').forEach((button) => {
      button.addEventListener('click', async () => {
        const card = button.closest('.theory-card');
        const replyBox = card.querySelector('.ai-inline-reply');
        button.disabled = true;
        button.textContent = 'Đang tạo giải thích...';

        const response = await fetch('/student/theory/help', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lessonId: button.dataset.lessonId,
            cardIndex: button.dataset.cardIndex
          })
        });
        const result = await response.json();

        replyBox.hidden = false;
        replyBox.textContent = result.reply || 'Chưa có phản hồi.';
        button.innerHTML = '<i data-lucide="message-circle" class="lucide-icon"></i> Nhờ AI giải thích';
        button.disabled = false;
        refreshIcons();
      });
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
              if (parentDetails.open) initAdminPreview(parentDetails);
            });
          }
          return;
        }

        form.dataset.questionPreviewReady = 'true';
        const preview = form.querySelector('[data-question-preview]');
        const contentInput = form.querySelector('[data-preview-content]');
        if (!preview || !contentInput) return;

        const imageInput = form.querySelector('[data-preview-images]');
        const imageWidthInput = form.querySelector('[data-preview-image-width]');
        const imageAltInput = form.querySelector('[data-preview-image-alt]');
        const placeholderList = form.querySelector('[data-preview-placeholder-list]');

        const updatePreview = () => {
          const choices = Array.from(form.querySelectorAll('[data-preview-choice]')).map((input) => ({
            key: input.dataset.previewChoice,
            text: input.value || 'Chưa nhập đáp án'
          }));
          const images = getPreviewImages(imageInput, imageWidthInput, imageAltInput);
          const previewText = ensurePreviewPlaceholders(contentInput.value || 'Đề bài sẽ hiển thị tại đây.', images);

          if (placeholderList) {
            placeholderList.hidden = images.length === 0;
            placeholderList.innerHTML = images.map((image) => `
              <span>${escapeHtml(`[${image.id}]`)}</span>
            `).join('');
          }

          preview.innerHTML = `
            <div class="question-content">${renderQuestionContent({ text: previewText, images })}</div>
            <div class="answer-grid">
              ${choices.map((choice) => `
                <div class="answer-choice preview-choice">
                  <span>${escapeHtml(choice.key)}</span>
                  <strong>${escapeHtml(choice.text)}</strong>
                </div>
              `).join('')}
            </div>
          `;
          renderMath(preview);
        };

        form.querySelectorAll('[data-preview-content], [data-preview-choice]').forEach((input) => {
          input.addEventListener('input', updatePreview);
        });
        [imageInput, imageWidthInput, imageAltInput].forEach((input) => {
          input?.addEventListener('input', updatePreview);
          input?.addEventListener('change', updatePreview);
        });
        form.addEventListener('reset', () => window.setTimeout(updatePreview, 0));
        updatePreview();
      });
      return;
    }

    const preview = root.querySelector('#adminQuestionPreview');
    const contentInput = root.querySelector('[data-preview-source="content"]');
    if (!preview || !contentInput) return;
    const imageInput = root.querySelector('[data-preview-images]');
    const imageWidthInput = root.querySelector('[data-preview-image-width]');
    const imageAltInput = root.querySelector('[data-preview-image-alt]');
    const placeholderList = root.querySelector('#imagePlaceholderList');

    const updatePreview = () => {
      const choices = Array.from(root.querySelectorAll('[data-preview-choice]')).map((input) => ({
        key: input.dataset.previewChoice,
        text: input.value || 'Chưa nhập đáp án'
      }));
      const images = getPreviewImages(imageInput, imageWidthInput, imageAltInput);
      const previewText = ensurePreviewPlaceholders(contentInput.value || 'Đề bài sẽ hiển thị tại đây.', images);

      if (placeholderList) {
        placeholderList.hidden = images.length === 0;
        placeholderList.innerHTML = images.map((image) => `
          <span>${escapeHtml(`[${image.id}]`)}</span>
        `).join('');
      }

      preview.innerHTML = `
        <div class="question-content">${renderQuestionContent({ text: previewText, images })}</div>
        <div class="answer-grid">
          ${choices.map((choice) => `
            <div class="answer-choice preview-choice">
              <span>${escapeHtml(choice.key)}</span>
              <strong>${escapeHtml(choice.text)}</strong>
            </div>
          `).join('')}
        </div>
      `;
      renderMath(preview);
    };

    root.querySelectorAll('[data-preview-source], [data-preview-choice]').forEach((input) => {
      input.addEventListener('input', updatePreview);
    });
    [imageInput, imageWidthInput, imageAltInput].forEach((input) => {
      input?.addEventListener('input', updatePreview);
      input?.addEventListener('change', updatePreview);
    });
    updatePreview();
  }

  function initSettingsCards() {
    const cards = Array.from(document.querySelectorAll('[data-settings-target]'));
    const modals = Array.from(document.querySelectorAll('[data-settings-modal]'));
    if (cards.length === 0 || modals.length === 0) return;

    const activateCard = (card) => {
      const target = card.dataset.settingsTarget;
      cards.forEach((item) => item.classList.toggle('active', item === card));
    };

    cards.forEach((card) => {
      card.addEventListener('click', () => {
        const modal = modals.find((item) => item.dataset.settingsModal === card.dataset.settingsTarget);
        if (!modal) return;
        activateCard(card);
        if (typeof modal.showModal === 'function') {
          modal.showModal();
        } else {
          modal.setAttribute('open', '');
        }
      });
    });

    const activeCard = cards.find((card) => card.classList.contains('active')) || cards[0];
    activateCard(activeCard);

    modals.forEach((modal) => {
      modal.querySelectorAll('[data-modal-close]').forEach((button) => {
        button.addEventListener('click', () => modal.close());
      });
      modal.addEventListener('click', (event) => {
        if (event.target === modal) modal.close();
      });
    });

    initModelSelectors();
    initApiChecks();
  }

  function initAdminQuestionBank() {
    initQuestionFlowSteps();
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
            if (parentDetails.open) initTheoryEditors(parentDetails);
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
    const bodyInput = form.querySelector('[data-theory-body]');
    const exampleInput = form.querySelector('[data-theory-example]');
    const imageInput = form.querySelector('[data-theory-images]');
    const existingImagesInput = form.querySelector('[data-theory-existing-images]');

    const updatePreview = () => {
      const existingImages = parsePreviewImages(existingImagesInput?.value);
      const uploadImages = Array.from(imageInput?.files || []).map((file, index) => ({
        url: URL.createObjectURL(file),
        alt_text: file.name || `Ảnh minh họa ${index + 1}`
      }));
      const images = [...existingImages, ...uploadImages];
      preview.innerHTML = renderTheoryCardPreview({
        title: titleInput?.value || 'Tiêu đề thẻ lý thuyết',
        body: bodyInput?.value || 'Nội dung lý thuyết sẽ hiển thị tại đây.',
        example: exampleInput?.value || '',
        images
      });
      renderMath(preview);
      refreshIcons();
    };

    form.querySelectorAll('[data-theory-title], [data-theory-body], [data-theory-example], [data-theory-images]').forEach((input) => {
      input.addEventListener('input', updatePreview);
      input.addEventListener('change', updatePreview);
    });

    updatePreview();
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

  function renderTheoryCardPreview(card) {
    const imagesHtml = (card.images || []).map((image) => `
      <span class="question-image">
        <img src="${escapeAttribute(image.url || '')}" alt="${escapeAttribute(image.alt_text || 'Hình minh họa lý thuyết')}">
      </span>
    `).join('');

    return `
      <article class="theory-preview-card">
        <span class="card-index">Xem trước</span>
        <h2>${escapeHtml(card.title || '')}</h2>
        <div class="theory-body">${escapeHtml(card.body || '')}</div>
        ${imagesHtml ? `<div class="theory-image-row">${imagesHtml}</div>` : ''}
        ${card.example ? `<p class="muted">${escapeHtml(card.example)}</p>` : ''}
      </article>
    `;
  }

  function initQuestionFlowSteps() {
    const flow = document.querySelector('[data-question-flow]');
    if (!flow) return;

    const steps = Array.from(flow.querySelectorAll('[data-flow-step]'));
    const backButton = flow.querySelector('[data-flow-back]');
    const titleNode = flow.querySelector('[data-flow-title]');
    const subtitleNode = flow.querySelector('[data-flow-subtitle]');
    const history = ['books'];

    const showStep = (stepId, shouldPush = true) => {
      const step = steps.find((item) => item.dataset.flowStep === stepId);
      if (!step) return;

      steps.forEach((item) => item.classList.toggle('is-active', item === step));
      if (shouldPush && history[history.length - 1] !== stepId) {
        history.push(stepId);
      }

      if (titleNode) titleNode.textContent = step.dataset.flowTitle || 'Ngân hàng câu hỏi';
      if (subtitleNode) subtitleNode.textContent = step.dataset.flowSubtitle || '';
      if (backButton) backButton.hidden = history.length <= 1;
      window.scrollTo({ top: 0, behavior: 'smooth' });
      loadLessonQuestions(step);
      loadLessonTheory(step);
      step.querySelectorAll('.math-content:not(.math-lazy)').forEach((node) => renderMath(node));
      initLazyMath(step);
      refreshIcons();
    };

    flow.querySelectorAll('[data-flow-target]').forEach((button) => {
      button.addEventListener('click', () => showStep(button.dataset.flowTarget));
    });

    backButton?.addEventListener('click', () => {
      if (history.length <= 1) return;
      history.pop();
      showStep(history[history.length - 1], false);
    });
  }

  async function loadLessonQuestions(step) {
    const shell = step.querySelector('[data-lesson-questions]');
    if (!shell || shell.dataset.loading === 'true') return;

    const page = Number(shell.dataset.currentPage || 1);
    if (shell.dataset.loadedPage === String(page)) return;
    await fetchLessonQuestions(shell, page);
  }

  async function fetchLessonQuestions(shell, page = 1) {
    if (!shell || shell.dataset.loading === 'true') return;
    shell.dataset.loading = 'true';
    shell.innerHTML = '<div class="empty-state compact">Đang tải danh sách câu hỏi...</div>';

    try {
      const url = `/admin/questions/lesson/${encodeURIComponent(shell.dataset.lessonId)}?page=${encodeURIComponent(page)}&limit=8`;
      const response = await fetch(url, {
        headers: { 'X-Requested-With': 'fetch' }
      });
      if (!response.ok) throw new Error('Không tải được dữ liệu câu hỏi.');

      shell.innerHTML = await response.text();
      shell.dataset.loaded = 'true';
      shell.dataset.currentPage = String(page);
      shell.dataset.loadedPage = String(page);
      initAdminPreview(shell);
      initQuestionDetailsControls(shell);
      initQuestionEditLoaders(shell);
      initLazyMath(shell);
      bindQuestionPagination(shell);
      refreshIcons();
    } catch (error) {
      shell.innerHTML = '<div class="empty-state compact danger">Không tải được danh sách câu hỏi. Vui lòng tải lại trang hoặc thử lại.</div>';
    } finally {
      delete shell.dataset.loading;
    }
  }

  function bindQuestionPagination(shell) {
    shell.querySelectorAll('[data-question-page]').forEach((button) => {
      button.addEventListener('click', () => {
        const page = Number(button.dataset.questionPage || 1);
        fetchLessonQuestions(shell, page);
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
      initAdminPreview(shell);
      initQuestionDetailsControls(shell);
      initLazyMath(shell);
      refreshIcons();
    } catch (error) {
      shell.innerHTML = '<div class="empty-state compact danger">Không tải được form sửa câu hỏi. Vui lòng thử lại.</div>';
    } finally {
      delete shell.dataset.loading;
    }
  }

  async function loadLessonTheory(step) {
    const shell = step.querySelector('[data-lesson-theory]');
    if (!shell || shell.dataset.loaded === 'true' || shell.dataset.loading === 'true') return;

    shell.dataset.loading = 'true';
    shell.innerHTML = '<div class="empty-state compact">Đang tải thẻ lý thuyết...</div>';

    try {
      const response = await fetch(`/admin/theory/lesson/${encodeURIComponent(shell.dataset.lessonId)}`, {
        headers: { 'X-Requested-With': 'fetch' }
      });
      if (!response.ok) throw new Error('Không tải được dữ liệu lý thuyết.');

      shell.innerHTML = await response.text();
      shell.dataset.loaded = 'true';
      initAdminPreview(shell);
      initTheoryEditors(shell);
      initLazyMath(shell);
      refreshIcons();
    } catch (error) {
      shell.innerHTML = '<div class="empty-state compact danger">Không tải được thẻ lý thuyết. Vui lòng tải lại trang hoặc thử lại.</div>';
    } finally {
      delete shell.dataset.loading;
    }
  }

  function closeDialog(dialog) {
    if (typeof dialog.close === 'function') {
      dialog.close();
    } else {
      dialog.removeAttribute('open');
    }
  }

  function initModelSelectors() {
    document.querySelectorAll('[data-model-select]').forEach((select) => {
      const form = select.closest('form') || document;
      const input = form.querySelector(`[data-model-input="${select.dataset.modelSelect}"]`);
      if (!input) return;

      select.addEventListener('change', () => {
        if (select.value !== '__custom__') {
          input.value = select.value;
        }
      });

      input.addEventListener('input', () => {
        const option = Array.from(select.options).find((item) => item.value === input.value);
        select.value = option ? option.value : '__custom__';
      });
    });
  }

  function initApiChecks() {
    document.querySelectorAll('[data-check-provider]').forEach((button) => {
      button.addEventListener('click', async () => {
        const form = button.closest('form');
        const status = form?.querySelector('[data-check-status]');
        if (!form || !status) return;

        const originalHtml = button.innerHTML;
        const payload = Object.fromEntries(new FormData(form).entries());
        payload.provider = button.dataset.checkProvider;

        button.disabled = true;
        button.textContent = 'Đang check...';
        status.hidden = false;
        status.className = 'api-check-status';
        status.textContent = 'Đang kiểm tra kết nối...';

        try {
          const response = await fetch('/admin/settings/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const result = await response.json();
          status.classList.add(result.ok ? 'success' : 'danger');
          status.textContent = result.message || (response.ok ? 'Kết nối thành công.' : 'Kiểm tra thất bại.');
        } catch (error) {
          status.classList.add('danger');
          status.textContent = 'Không gọi được endpoint kiểm tra API.';
        } finally {
          button.disabled = false;
          button.innerHTML = originalHtml;
          refreshIcons();
        }
      });
    });
  }

  function getPreviewImages(imageInput, imageWidthInput, imageAltInput) {
    const files = Array.from(imageInput?.files || []);
    const width = Number(imageWidthInput?.value || 70);
    const altText = imageAltInput?.value || 'Hình minh họa';

    return files.map((file, index) => ({
      id: `image-${index + 1}`,
      url: URL.createObjectURL(file),
      width_percent: Number.isFinite(width) ? width : 70,
      alt_text: files.length === 1 ? altText : `${altText} ${index + 1}`
    }));
  }

  function ensurePreviewPlaceholders(text, images) {
    return text || '';
  }

  function renderQuestionContent(content) {
    const previewImages = Array.isArray(content?.images) ? content.images : [];
    let textValue = String(content?.text || '');

    previewImages.forEach((image) => {
      textValue = textValue.replaceAll(`[${image.id}]`, '');
    });

    const textHtml = escapeHtml(textValue).replace(/\r?\n/g, '<br>');
    const imagesHtml = previewImages.map((image) => {
      const width = Number(image.width_percent || 100);
      return `
        <span class="question-image" style="max-width:${Math.min(Math.max(width, 20), 100)}%">
          <img src="${escapeAttribute(image.url || '')}" alt="${escapeAttribute(image.alt_text || 'Hình minh họa')}" loading="lazy" decoding="async">
        </span>
      `;
    }).join('');

    return `
      <div class="question-text-row">${textHtml}</div>
      ${imagesHtml ? `<div class="question-image-row">${imagesHtml}</div>` : ''}
    `;

    let rawText = escapeHtml(content?.text || '');
    const images = Array.isArray(content?.images) ? content.images : [];

    images.forEach((image) => {
      const width = Number(image.width_percent || 100);
      const imageHtml = `
        <span class="question-image" style="max-width:${Math.min(Math.max(width, 20), 100)}%">
          <img src="${escapeAttribute(image.url || '')}" alt="${escapeAttribute(image.alt_text || 'Hình minh họa')}" loading="lazy" decoding="async">
        </span>
      `;
      rawText = rawText.replace(`[${escapeHtml(image.id)}]`, imageHtml);
    });

    return rawText;
  }

  function renderExplanationContent(explanation) {
    const images = Array.isArray(explanation?.images) ? explanation.images : [];
    const imagesHtml = images.map((image) => {
      const width = Number(image.width_percent || 100);
      return `
        <span class="question-image" style="max-width:${Math.min(Math.max(width, 20), 100)}%">
          <img src="${escapeAttribute(image.url || '')}" alt="${escapeAttribute(image.alt_text || image.alt || 'Hình minh họa lời giải')}" loading="lazy" decoding="async">
        </span>
      `;
    }).join('');
    const text = String(explanation?.text || '').trim();
    const textHtml = text ? `<div class="explanation-text math-content">${escapeHtml(text).replace(/\r?\n/g, '<br>')}</div>` : '';

    return `
      ${imagesHtml ? `<div class="explanation-image-row">${imagesHtml}</div>` : ''}
      ${textHtml}
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
})();
