(function () {
  const state = {
    questions: [],
    currentIndex: 0,
    selectedAnswer: null,
    answered: false,
    startedAt: Date.now(),
    practiceSessionId: null,
    // Kết quả từng câu đã nộp, khóa là questionId: { selectedAnswer, isCorrect }
    results: {}
  };

  document.addEventListener('DOMContentLoaded', () => {
    refreshIcons();
    renderInitialMath();
    initPractice();
    initTheoryHelp();
    initProgressiveAuthoringForms();
    initAdminPreview();
    initSettingsCards();
    initAdminQuestionBank();
    initTheoryEditors();
    initGridEditors();
    initAuthoringModeControls();
    initRenderedGrids();
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
        state.results = context.answeredResults || {};
      } catch (error) {
        state.practiceSessionId = null;
      }
    }

    renderCurrentQuestion();
    initQuestionProgressBar();
    maybeShowSummary();
    initLeaveGuard();

    document.getElementById('submitAnswerButton')?.addEventListener('click', submitAnswer);
    document.getElementById('nextQuestionButton')?.addEventListener('click', nextQuestion);
    document.getElementById('finishPracticeButton')?.addEventListener('click', finishPractice);
    document.getElementById('aiHelpForm')?.addEventListener('submit', requestExerciseHelp);
  }

  // Nhắc học sinh xác nhận trước khi rời khỏi bài còn dang dở, tránh bấm nhầm
  // link "Về lý thuyết" hay nút back rồi mất mạch làm bài.
  function initLeaveGuard() {
    const hasUnfinishedWork = () =>
      state.questions.length > 0
      && state.questions.some((question) => !state.results[question.id]);

    document.querySelectorAll('.practice-topline .back-link').forEach((link) => {
      link.addEventListener('click', (event) => {
        if (!hasUnfinishedWork()) return;
        const answeredCount = Object.keys(state.results).length;
        const remaining = state.questions.length - answeredCount;
        const confirmed = window.confirm(
          `Em còn ${remaining} câu chưa làm. Bài làm đã được lưu lại, em có thể quay lại làm tiếp sau. Rời khỏi bài bây giờ?`
        );
        if (!confirmed) event.preventDefault();
      });
    });
  }

  function initQuestionProgressBar() {
    const bar = document.getElementById('questionProgressBar');
    if (!bar) return;

    bar.querySelectorAll('[data-progress-dot]').forEach((dot) => {
      dot.addEventListener('click', () => {
        const index = Number(dot.dataset.index);
        if (!Number.isInteger(index) || index === state.currentIndex) return;
        state.currentIndex = index;
        renderCurrentQuestion();
      });
    });

    updateQuestionProgressBar();
  }

  function updateQuestionProgressBar() {
    const bar = document.getElementById('questionProgressBar');
    if (!bar) return;

    bar.querySelectorAll('[data-progress-dot]').forEach((dot) => {
      const index = Number(dot.dataset.index);
      const question = state.questions[index];
      const result = question ? state.results[question.id] : null;

      dot.classList.toggle('current', index === state.currentIndex);
      dot.classList.toggle('correct', Boolean(result && result.isCorrect));
      dot.classList.toggle('wrong', Boolean(result && !result.isCorrect));
      dot.setAttribute('aria-current', index === state.currentIndex ? 'true' : 'false');

      const stateLabel = result
        ? (result.isCorrect ? 'đã làm đúng' : 'đã làm sai')
        : 'chưa làm';
      dot.setAttribute('aria-label', `Câu ${index + 1}, ${stateLabel}`);
    });
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

    const savedResult = state.results[question.id] || null;

    state.selectedAnswer = savedResult ? savedResult.selectedAnswer : null;
    state.answered = Boolean(savedResult);
    state.startedAt = Date.now();
    if (feedback) feedback.hidden = true;
    if (nextButton) nextButton.hidden = state.currentIndex >= state.questions.length - 1;
    if (finishButton) finishButton.hidden = !hasAnyAnswer();
    if (submitButton) {
      submitButton.disabled = Boolean(savedResult);
      submitButton.hidden = Boolean(savedResult);
    }

    if (counter) {
      counter.textContent = `Câu ${state.currentIndex + 1}/${state.questions.length}`;
    }

    app.innerHTML = `
      <article class="question-card" data-question-id="${question.id}">
        <div class="question-content math-content">${renderQuestionContent(question)}</div>
        ${renderAnswerArea(question)}
      </article>
    `;

    app.querySelectorAll('.answer-choice').forEach((button) => {
      button.addEventListener('click', () => {
        if (state.answered) return;
        state.selectedAnswer = button.dataset.answer;
        app.querySelectorAll('.answer-choice').forEach((item) => item.classList.remove('selected'));
        button.classList.add('selected');
        saveAnswerDraft(question.id, state.selectedAnswer);
      });
    });

    app.querySelector('[data-free-answer-input]')?.addEventListener('input', (event) => {
      state.selectedAnswer = event.target.value;
      saveAnswerDraft(question.id, state.selectedAnswer);
    });

    if (savedResult) {
      renderAnsweredState(app, question, savedResult);
    } else {
      restoreAnswerDraft(app, question);
    }

    updateQuestionProgressBar();
    renderMath(app);
    refreshIcons();
  }

  function hasAnyAnswer() {
    return Object.keys(state.results).length > 0;
  }

  // Dựng lại giao diện câu đã nộp: khóa lựa chọn, tô đúng/sai và nhắc lại kết quả.
  function renderAnsweredState(app, question, savedResult) {
    app.querySelectorAll('.answer-choice').forEach((button) => {
      button.disabled = true;
      const answer = button.dataset.answer;
      if (answer === question.correct_answer) button.classList.add('correct');
      if (answer === savedResult.selectedAnswer && !savedResult.isCorrect) {
        button.classList.add('wrong');
      }
      if (answer === savedResult.selectedAnswer) button.classList.add('selected');
    });

    const freeInput = app.querySelector('[data-free-answer-input]');
    if (freeInput) {
      freeInput.value = savedResult.selectedAnswer || '';
      freeInput.disabled = true;
    }

    showFeedback(
      savedResult.isCorrect ? 'success' : 'danger',
      `
        <h2>${savedResult.isCorrect ? 'Câu này em đã làm đúng' : 'Câu này em đã làm sai'}</h2>
        <p>Em chọn: <strong>${escapeHtml(savedResult.selectedAnswer || '')}</strong></p>
        ${question.correct_answer && !savedResult.isCorrect
          ? `<p>Đáp án đúng: <strong>${escapeHtml(question.correct_answer)}</strong></p>`
          : ''}
        ${question.explanation
          ? `<div class="explanation-content"><strong>Lời giải:</strong>${renderExplanationContent(question.explanation)}</div>`
          : ''}
      `,
      true
    );
  }

  function draftStorageKey(questionId) {
    return `practice-draft:${state.practiceSessionId || 'no-session'}:${questionId}`;
  }

  function saveAnswerDraft(questionId, value) {
    try {
      if (value === null || value === undefined || value === '') {
        window.sessionStorage.removeItem(draftStorageKey(questionId));
        return;
      }
      window.sessionStorage.setItem(draftStorageKey(questionId), String(value));
    } catch (error) {
      /* Trình duyệt chặn sessionStorage (chế độ riêng tư): bỏ qua, không chặn luồng làm bài. */
    }
  }

  function readAnswerDraft(questionId) {
    try {
      return window.sessionStorage.getItem(draftStorageKey(questionId));
    } catch (error) {
      return null;
    }
  }

  function clearAnswerDraft(questionId) {
    try {
      window.sessionStorage.removeItem(draftStorageKey(questionId));
    } catch (error) {
      /* Không có gì để dọn khi sessionStorage không dùng được. */
    }
  }

  function restoreAnswerDraft(app, question) {
    const draft = readAnswerDraft(question.id);
    if (!draft) return;

    const freeInput = app.querySelector('[data-free-answer-input]');
    if (freeInput) {
      freeInput.value = draft;
      state.selectedAnswer = draft;
      return;
    }

    const choiceButton = Array.from(app.querySelectorAll('.answer-choice'))
      .find((button) => button.dataset.answer === draft);
    if (!choiceButton) return;
    choiceButton.classList.add('selected');
    state.selectedAnswer = draft;
  }

  async function submitAnswer() {
    const question = state.questions[state.currentIndex];
    const feedback = document.getElementById('answerFeedback');
    const submitButton = document.getElementById('submitAnswerButton');
    const nextButton = document.getElementById('nextQuestionButton');
    const finishButton = document.getElementById('finishPracticeButton');

    if (!question || !feedback) return;

    const freeAnswerInput = document.querySelector('[data-free-answer-input]');
    const selectedAnswer = freeAnswerInput ? freeAnswerInput.value.trim() : state.selectedAnswer;

    if (!selectedAnswer) {
      showFeedback('warning', 'Vui lòng chọn một đáp án trước khi nộp.');
      return;
    }

    submitButton.disabled = true;
    setButtonBusy(submitButton, 'Đang chấm bài...');

    let result;
    try {
      const response = await fetch(`/student/questions/${question.id}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedAnswer,
          practiceSessionId: state.practiceSessionId,
          questionIndex: state.currentIndex,
          timeSpentSeconds: Math.round((Date.now() - state.startedAt) / 1000)
        })
      });
      result = await response.json();
    } catch (error) {
      showRetryFeedback(
        'Chưa gửi được đáp án. Em kiểm tra lại kết nối mạng rồi bấm "Thử lại" nhé.',
        submitAnswer
      );
      restoreButton(submitButton);
      submitButton.disabled = false;
      return;
    }

    restoreButton(submitButton);

    if (!result.ok) {
      showFeedback('danger', result.message || 'Không thể nộp đáp án.');
      submitButton.disabled = false;
      return;
    }

    state.answered = true;
    state.results[question.id] = {
      selectedAnswer,
      isCorrect: Boolean(result.isCorrect)
    };
    clearAnswerDraft(question.id);
    markAnswerState(result);
    showResultFeedback(result);
    updateQuestionProgressBar();

    if (submitButton) submitButton.hidden = true;
    if (nextButton && state.currentIndex < state.questions.length - 1) {
      nextButton.hidden = false;
    }
    if (finishButton) {
      finishButton.hidden = false;
    }

    maybeShowSummary();
  }

  // Khi mọi câu trong bài đã có kết quả, hiện bảng tổng kết thay cho việc để
  // học sinh đứng lại ở câu cuối mà không biết làm gì tiếp.
  function maybeShowSummary() {
    if (state.questions.length === 0) return;
    const allAnswered = state.questions.every((question) => state.results[question.id]);
    if (!allAnswered) return;
    renderSummary();
  }

  function renderSummary() {
    const panel = document.getElementById('practiceSummary');
    if (!panel) return;

    const total = state.questions.length;
    const wrongQuestions = state.questions
      .map((question, index) => ({ question, index, result: state.results[question.id] }))
      .filter((item) => item.result && !item.result.isCorrect);
    const correctCount = total - wrongQuestions.length;

    const wrongListHtml = wrongQuestions.length > 0
      ? `
        <div class="summary-wrong">
          <strong>Các câu cần xem lại:</strong>
          <div class="summary-wrong-list">
            ${wrongQuestions.map((item) => `
              <button class="progress-dot wrong" type="button" data-summary-jump="${item.index}">
                ${item.index + 1}
              </button>
            `).join('')}
          </div>
          <p class="muted">Bấm vào số câu để xem lại đề bài và lời giải.</p>
        </div>
      `
      : '<p class="summary-perfect">Em làm đúng toàn bộ bài này. Rất tốt!</p>';

    panel.innerHTML = `
      <div class="summary-head">
        <h2>Em đã làm xong bài</h2>
        <p class="summary-score"><strong>${correctCount}</strong>/${total} câu đúng</p>
      </div>
      <div class="progress-track large">
        <span style="width: ${total > 0 ? Math.round((correctCount / total) * 100) : 0}%"></span>
      </div>
      ${wrongListHtml}
    `;
    panel.hidden = false;

    panel.querySelectorAll('[data-summary-jump]').forEach((button) => {
      button.addEventListener('click', () => {
        const index = Number(button.dataset.summaryJump);
        if (!Number.isInteger(index)) return;
        state.currentIndex = index;
        renderCurrentQuestion();
        document.getElementById('practiceApp')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function setButtonBusy(button, busyLabel) {
    if (!button || button.dataset.originalHtml) return;
    button.dataset.originalHtml = button.innerHTML;
    button.innerHTML = `<span class="btn-spinner" aria-hidden="true"></span>${escapeHtml(busyLabel)}`;
  }

  function restoreButton(button) {
    if (!button || !button.dataset.originalHtml) return;
    button.innerHTML = button.dataset.originalHtml;
    delete button.dataset.originalHtml;
    refreshIcons();
  }

  function showRetryFeedback(message, retryHandler) {
    const feedback = document.getElementById('answerFeedback');
    if (!feedback) return;
    feedback.className = 'answer-feedback feedback-danger';
    feedback.hidden = false;
    feedback.innerHTML = `
      <p>${escapeHtml(message)}</p>
      <button class="btn btn-secondary" type="button" data-retry-action>Thử lại</button>
    `;
    feedback.querySelector('[data-retry-action]')?.addEventListener('click', () => {
      feedback.hidden = true;
      retryHandler();
    });
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

    const finishButton = document.getElementById('finishPracticeButton');
    setButtonBusy(finishButton, 'Đang lưu kết quả...');
    if (finishButton) finishButton.disabled = true;

    try {
      const response = await fetch(`/student/sessions/${state.practiceSessionId}/finish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const result = await response.json();
      window.location.href = result.redirectUrl || '/student/history';
    } catch (error) {
      restoreButton(finishButton);
      if (finishButton) finishButton.disabled = false;
      showRetryFeedback(
        'Chưa lưu được kết quả bài làm. Em kiểm tra kết nối mạng rồi bấm "Thử lại" nhé.',
        finishPractice
      );
    }
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
      updateChat(thinkingNode, 'Mình chưa kết nối được phần gợi ý lúc này. Em thử gửi lại sau nhé.');
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
        setButtonBusy(button, 'Đang tạo giải thích...');

        try {
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
          replyBox.innerHTML = renderMarkdownText(
            result.reply || result.message || 'Chưa có phản hồi.'
          );
          renderMath(replyBox);
        } catch (error) {
          replyBox.hidden = false;
          replyBox.textContent = 'Chưa kết nối được phần gợi ý. Em thử lại sau ít phút nhé.';
        } finally {
          restoreButton(button);
          button.disabled = false;
        }
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

      preview.innerHTML = `
        <div class="question-content">${renderQuestionContent(question)}</div>
        ${renderAnswerArea(question, { preview: true })}
      `;
      renderMath(preview);
    };

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
      input.addEventListener('input', updatePreview);
      input.addEventListener('change', updatePreview);
    });
    form.addEventListener?.('reset', () => window.setTimeout(updatePreview, 0));
    updatePreview();
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
      input.addEventListener('input', updatePreview);
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

      const setGridEnabled = (enabled) => {
        const grid = parseGridLayoutValue(gridInput?.value);
        grid.enabled = enabled;
        if (gridInput) {
          gridInput.value = JSON.stringify(grid);
          gridInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (gridEnabledInput) {
          gridEnabledInput.checked = enabled;
          gridEnabledInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
      };

      const applyMode = (mode) => {
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
        setGridEnabled(normalizedMode === 'canvas');
      };

      radios.forEach((radio) => {
        radio.addEventListener('change', () => {
          if (radio.checked) applyMode(radio.value);
        });
      });

      applyMode(hiddenInput?.value || radios.find((radio) => radio.checked)?.value || 'fields');
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

      const syncInputs = () => {
        enabledInput.checked = Boolean(state.grid.enabled);
        rowsInput.value = state.grid.rows;
        columnsInput.value = state.grid.columns;
        input.value = JSON.stringify(state.grid);
        input.dispatchEvent(new Event('input', { bubbles: true }));
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

      const render = () => {
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
        syncInputs();
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

      document.addEventListener('mouseup', () => {
        state.isDragging = false;
        state.dragStart = null;
      });

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
        render();
      };

      [typeInput, textInput, imageInput, answerInput, alignInput, backgroundInput].forEach((control) => {
        control?.addEventListener('input', applyPanelToSelection);
        control?.addEventListener('change', applyPanelToSelection);
      });

      enabledInput.addEventListener('change', () => {
        state.grid.enabled = enabledInput.checked;
        render();
      });

      [rowsInput, columnsInput].forEach((control) => {
        control.addEventListener('change', () => {
          const nextRows = clampGridSize(rowsInput.value);
          const nextColumns = clampGridSize(columnsInput.value);
          state.grid.rows = nextRows;
          state.grid.columns = nextColumns;
          state.grid.cells = createBaseGridCells(nextRows, nextColumns);
          state.selectedIds.clear();
          render();
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
        render();
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
        render();
      });

      editor.querySelector('[data-grid-clear]')?.addEventListener('click', () => {
        selectedCells().forEach((cell) => {
          cell.type = 'empty';
          cell.text = '';
          cell.image_url = '';
          cell.answer_key = '';
          cell.background = '';
        });
        render();
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
    const lessonId = shell.dataset.lessonId;
    const requestId = `${lessonId}:${page}:${Date.now()}`;
    shell.dataset.requestId = requestId;
    shell.dataset.loading = 'true';
    shell.innerHTML = '<div class="empty-state compact">Đang tải danh sách câu hỏi...</div>';

    try {
      const url = `/admin/questions/lesson/${encodeURIComponent(lessonId)}?page=${encodeURIComponent(page)}&limit=8`;
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

    await fetchLessonTheory(shell);
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
})();
