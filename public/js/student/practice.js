// Mã JavaScript phía trình duyệt practice điều khiển tương tác và cập nhật giao diện người dùng.
(function () {
  const {
    alert: showAppAlert,
    confirm: showAppConfirm,
    escapeHtml,
    renderAnswerArea,
    renderExplanationContent,
    renderMath,
    renderQuestionContent
  } = window.AppUI;

  // Hàm refreshIcons dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function refreshIcons() {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (window.lucide) window.lucide.createIcons();
  }

  const state = {
    questions: [],
    currentIndex: 0,
    selectedAnswer: null,
    answered: false,
    startedAt: Date.now(),
    practiceSessionId: null,
    // Kết quả từng câu đã nộp, khóa là questionId: { selectedAnswer, isCorrect }
    results: {},
    // Id câu đang chờ phản hồi chấm điểm, null khi không có request nào treo
    pendingQuestionId: null,
    deadlineAtMs: null,
    countdownId: null,
    timeExpired: false,
    finishing: false
  };

  // Hàm initPractice dùng để khởi tạo trạng thái và các phụ thuộc cần thiết; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function initPractice() {
    const dataNode = document.getElementById('practice-data');
    const app = document.getElementById('practiceApp');
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!dataNode || !app) return;

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    try {
      state.questions = JSON.parse(dataNode.textContent || '[]');
    } catch (error) {
      state.questions = [];
    }

    const contextNode = document.getElementById('practice-context');
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (contextNode) {
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      try {
        const context = JSON.parse(contextNode.textContent || '{}');
        state.practiceSessionId = context.practiceSessionId || null;
        state.results = context.answeredResults || {};
        state.currentIndex = firstUnansweredIndex();
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (
          context.timing
          && Number.isFinite(Number(context.timing.deadlineAtMs))
          && Number.isFinite(Number(context.timing.serverNowMs))
        ) {
          const remainingAtRender = Number(context.timing.deadlineAtMs)
            - Number(context.timing.serverNowMs);
          state.deadlineAtMs = Date.now() + Math.max(0, remainingAtRender);
        }
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
    document.getElementById('finishPracticeButton')?.addEventListener('click', () => finishPractice());
    document.getElementById('aiHelpForm')?.addEventListener('submit', requestExerciseHelp);

    // Nút hỏi nhanh: điền sẵn câu hỏi rồi gửi luôn. Học sinh lớp 1-2 chưa gõ
    // được câu hỏi tự do nên đây là đường dùng chính của khung gợi ý.
    document.querySelectorAll('[data-chat-quick]').forEach((button) => {
      button.addEventListener('click', () => {
        const form = document.getElementById('aiHelpForm');
        const input = form?.querySelector('[name="message"]');
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (!form || !input) return;
        input.value = button.dataset.chatQuick || '';
        form.requestSubmit();
      });
    });
    initCountdown();
  }

  // Nhắc học sinh xác nhận trước khi rời khỏi bài còn dang dở, tránh bấm nhầm
  // link "Về lý thuyết" hay nút back rồi mất mạch làm bài.
  function initLeaveGuard() {
    // Hàm hasUnfinishedWork dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
    const hasUnfinishedWork = () =>
      state.questions.length > 0
      && state.questions.some((question) => !state.results[question.id]);

    document.querySelectorAll('.practice-topline .back-link').forEach((link) => {
      link.addEventListener('click', async (event) => {
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (!hasUnfinishedWork()) return;
        event.preventDefault();
        const answeredCount = Object.keys(state.results).length;
        const remaining = state.questions.length - answeredCount;
        const confirmed = await showAppConfirm({
          title: 'Rời khỏi bài đang làm?',
          message: `Em còn ${remaining} câu chưa làm. Bài làm đã được lưu lại, em có thể quay lại làm tiếp sau.`,
          tone: 'warning',
          confirmLabel: 'Rời khỏi bài',
          cancelLabel: 'Ở lại làm tiếp'
        });
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (confirmed) window.location.href = link.href;
      });
    });
  }

  // Hàm initCountdown dùng để khởi tạo trạng thái và các phụ thuộc cần thiết; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function initCountdown() {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!state.deadlineAtMs || !document.getElementById('practiceTimer')) return;
    updateCountdown();
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!state.timeExpired) {
      state.countdownId = window.setInterval(updateCountdown, 250);
    }
  }

  // Hàm updateCountdown dùng để cập nhật trạng thái hoặc dữ liệu theo quy tắc nghiệp vụ; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function updateCountdown() {
    const timer = document.getElementById('practiceTimer');
    const value = timer?.querySelector('[data-timer-value]');
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!timer || !value || !state.deadlineAtMs || state.timeExpired) return;

    const remainingSeconds = Math.max(0, Math.ceil((state.deadlineAtMs - Date.now()) / 1000));
    value.textContent = formatCountdown(remainingSeconds);
    timer.classList.toggle('is-warning', remainingSeconds <= 5 * 60 && remainingSeconds > 60);
    timer.classList.toggle('is-urgent', remainingSeconds <= 60);
    timer.setAttribute('aria-label', `Thời gian còn lại ${formatCountdown(remainingSeconds)}`);

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (remainingSeconds <= 0) {
      clearCountdown();
      state.timeExpired = true;
      finishPractice({ timedOut: true });
    }
  }

  // Hàm formatCountdown dùng để chuyển đổi dữ liệu sang định dạng phù hợp; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function formatCountdown(totalSeconds) {
    const safeSeconds = Math.max(0, Number(totalSeconds) || 0);
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const seconds = Math.floor(safeSeconds % 60);
    const minuteText = String(minutes).padStart(2, '0');
    const secondText = String(seconds).padStart(2, '0');
    return hours > 0
      ? `${String(hours).padStart(2, '0')}:${minuteText}:${secondText}`
      : `${minuteText}:${secondText}`;
  }

  // Hàm clearCountdown dùng để xóa hoặc giải phóng tài nguyên theo điều kiện an toàn; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function clearCountdown() {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (state.countdownId) window.clearInterval(state.countdownId);
    state.countdownId = null;
  }

  // Hàm disablePracticeControls dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function disablePracticeControls() {
    document.querySelectorAll(
      '.practice-shell button, .practice-shell input, .practice-shell textarea, .practice-shell select'
    ).forEach((control) => {
      control.disabled = true;
    });
  }

  // Hàm isAnswerPending dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function isAnswerPending() {
    return state.pendingQuestionId !== null;
  }

  // Hàm syncPracticeControlState dùng để đồng bộ dữ liệu giữa các định dạng hoặc nguồn khác nhau; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function syncPracticeControlState() {
    const app = document.getElementById('practiceApp');
    const question = state.questions[state.currentIndex];
    const hasSavedResult = Boolean(question && state.results[question.id]);
    const locked = isAnswerPending() || state.finishing || state.timeExpired;
    const submitButton = document.getElementById('submitAnswerButton');
    const nextButton = document.getElementById('nextQuestionButton');
    const finishButton = document.getElementById('finishPracticeButton');

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (app) {
      app.setAttribute('aria-busy', isAnswerPending() ? 'true' : 'false');
      app.querySelectorAll('.answer-choice, [data-free-answer-input]').forEach((control) => {
        control.disabled = locked || hasSavedResult;
      });
    }
    document.querySelectorAll('[data-progress-dot]').forEach((dot) => {
      dot.disabled = locked;
    });
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (submitButton) submitButton.disabled = locked || hasSavedResult;
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (nextButton) nextButton.disabled = locked;
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (finishButton) finishButton.disabled = locked;
  }

  // Hàm clearAnswerPending dùng để xóa hoặc giải phóng tài nguyên theo điều kiện an toàn; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function clearAnswerPending(submitButton) {
    state.pendingQuestionId = null;
    restoreButton(submitButton);
    syncPracticeControlState();
  }

  // Hàm initQuestionProgressBar dùng để khởi tạo trạng thái và các phụ thuộc cần thiết; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function initQuestionProgressBar() {
    const bar = document.getElementById('questionProgressBar');
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!bar) return;

    bar.querySelectorAll('[data-progress-dot]').forEach((dot) => {
      dot.addEventListener('click', () => {
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (isAnswerPending() || state.finishing || state.timeExpired) return;
        const index = Number(dot.dataset.index);
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (!Number.isInteger(index) || index === state.currentIndex) return;
        state.currentIndex = index;
        renderCurrentQuestion();
      });
    });

    updateQuestionProgressBar();
  }

  // Hàm updateQuestionProgressBar dùng để cập nhật trạng thái hoặc dữ liệu theo quy tắc nghiệp vụ; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function updateQuestionProgressBar() {
    const bar = document.getElementById('questionProgressBar');
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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

  // Hàm renderCurrentQuestion dùng để chuẩn bị và hiển thị kết quả cho người dùng; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function renderCurrentQuestion() {
    const app = document.getElementById('practiceApp');
    const counter = document.getElementById('questionCounter');
    const feedback = document.getElementById('answerFeedback');
    const nextButton = document.getElementById('nextQuestionButton');
    const submitButton = document.getElementById('submitAnswerButton');
    const finishButton = document.getElementById('finishPracticeButton');
    const question = state.questions[state.currentIndex];

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!app || !question) return;

    const savedResult = state.results[question.id] || null;

    state.selectedAnswer = savedResult ? savedResult.selectedAnswer : null;
    state.answered = Boolean(savedResult);
    state.startedAt = Date.now();
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (feedback) feedback.hidden = true;
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (nextButton) nextButton.hidden = state.currentIndex >= state.questions.length - 1;
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (finishButton) finishButton.hidden = !hasAnyAnswer();
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (submitButton) {
      submitButton.disabled = Boolean(savedResult);
      submitButton.hidden = Boolean(savedResult);
    }

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (counter) {
      counter.textContent = `Câu ${state.currentIndex + 1}/${state.questions.length}`;
    }

    app.innerHTML = `
      <article class="question-card" data-question-id="${question.id}">
        <div class="question-content math-content">${renderQuestionContent(question)}</div>
        ${renderAnswerArea(question)}
      </article>
    `;

    window.StudentQuestionImages?.enhance(app);

    app.querySelectorAll('.answer-choice').forEach((button) => {
      button.addEventListener('click', () => {
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (state.answered || isAnswerPending()) return;
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

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (savedResult) {
      renderAnsweredState(app, question, savedResult);
    } else {
      restoreAnswerDraft(app, question);
    }

    updateQuestionProgressBar();
    syncPracticeControlState();
    renderMath(app);
    refreshIcons();
  }

  // Hàm hasAnyAnswer dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function hasAnyAnswer() {
    return Object.keys(state.results).length > 0;
  }

  // Mở lại bài ở câu chưa làm đầu tiên. Không dùng current_index của phiên làm
  // chỉ số câu nữa: từ khi có thanh chấm tiến trình, học sinh làm bài không theo
  // thứ tự nên current_index chỉ còn mang nghĩa số câu đã làm.
  function firstUnansweredIndex() {
    const index = state.questions.findIndex((question) => !state.results[question.id]);
    return index === -1 ? 0 : index;
  }

  // Dựng lại giao diện câu đã nộp: khóa lựa chọn, tô đúng/sai và nhắc lại kết quả.
  // Đáp án đúng và lời giải đọc từ savedResult chứ KHÔNG từ question: dữ liệu câu
  // hỏi nhúng trong trang đã bị cắt hết đáp án để học sinh không View Source ra
  // được; server chỉ gửi kèm đáp án cho những câu các em đã nộp.
  function renderAnsweredState(app, question, savedResult) {
    app.querySelectorAll('.answer-choice').forEach((button) => {
      button.disabled = true;
      const answer = button.dataset.answer;
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (savedResult.correctAnswer && answer === savedResult.correctAnswer) {
        button.classList.add('correct');
      }
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (answer === savedResult.selectedAnswer && !savedResult.isCorrect) {
        button.classList.add('wrong');
      }
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (answer === savedResult.selectedAnswer) button.classList.add('selected');
    });

    const freeInput = app.querySelector('[data-free-answer-input]');
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (freeInput) {
      freeInput.value = savedResult.selectedAnswer || '';
      freeInput.disabled = true;
    }

    showFeedback(
      savedResult.isCorrect ? 'success' : 'danger',
      `
        <h2>${savedResult.isCorrect ? 'Câu này em đã làm đúng' : 'Câu này em đã làm sai'}</h2>
        <p>Em chọn: <strong>${escapeHtml(savedResult.selectedAnswer || '')}</strong></p>
        ${savedResult.correctAnswer && !savedResult.isCorrect
          ? `<p>Đáp án đúng: <strong>${escapeHtml(savedResult.correctAnswer)}</strong></p>`
          : ''}
        ${savedResult.explanation
          ? `<div class="explanation-content"><strong>Lời giải:</strong>${renderExplanationContent(savedResult.explanation)}</div>`
          : ''}
      `,
      true
    );
  }

  // Hàm draftStorageKey dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function draftStorageKey(questionId) {
    return `practice-draft:${state.practiceSessionId || 'no-session'}:${questionId}`;
  }

  // Hàm saveAnswerDraft dùng để cập nhật trạng thái hoặc dữ liệu theo quy tắc nghiệp vụ; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function saveAnswerDraft(questionId, value) {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    try {
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (value === null || value === undefined || value === '') {
        window.sessionStorage.removeItem(draftStorageKey(questionId));
        return;
      }
      window.sessionStorage.setItem(draftStorageKey(questionId), String(value));
    } catch (error) {
      /* Trình duyệt chặn sessionStorage (chế độ riêng tư): bỏ qua, không chặn luồng làm bài. */
    }
  }

  // Hàm readAnswerDraft dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function readAnswerDraft(questionId) {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    try {
      return window.sessionStorage.getItem(draftStorageKey(questionId));
    } catch (error) {
      return null;
    }
  }

  // Hàm clearAnswerDraft dùng để xóa hoặc giải phóng tài nguyên theo điều kiện an toàn; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function clearAnswerDraft(questionId) {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    try {
      window.sessionStorage.removeItem(draftStorageKey(questionId));
    } catch (error) {
      /* Không có gì để dọn khi sessionStorage không dùng được. */
    }
  }

  // Hàm restoreAnswerDraft dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function restoreAnswerDraft(app, question) {
    const draft = readAnswerDraft(question.id);
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!draft) return;

    const freeInput = app.querySelector('[data-free-answer-input]');
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (freeInput) {
      freeInput.value = draft;
      state.selectedAnswer = draft;
      return;
    }

    const choiceButton = Array.from(app.querySelectorAll('.answer-choice'))
      .find((button) => button.dataset.answer === draft);
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!choiceButton) return;
    choiceButton.classList.add('selected');
    state.selectedAnswer = draft;
  }

  // Hàm submitAnswer dùng để xử lý yêu cầu, điều phối các bước nghiệp vụ và phản hồi lỗi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  async function submitAnswer() {
    // Chụp câu, vị trí và đáp án ngay lúc gửi. Trong lúc chờ chấm, điều hướng câu hỏi
    // được khóa để kết quả không thể áp nhầm lên một lựa chọn vừa thay đổi.
    const submittedIndex = state.currentIndex;
    const question = state.questions[submittedIndex];
    const feedback = document.getElementById('answerFeedback');
    const submitButton = document.getElementById('submitAnswerButton');
    const nextButton = document.getElementById('nextQuestionButton');
    const finishButton = document.getElementById('finishPracticeButton');

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!question || !feedback) return;
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (isAnswerPending() || state.finishing || state.timeExpired) return;

    const freeAnswerInput = document.querySelector('[data-free-answer-input]');
    const submittedAnswer = freeAnswerInput ? freeAnswerInput.value.trim() : state.selectedAnswer;

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!submittedAnswer) {
      showFeedback('warning', 'Vui lòng chọn một đáp án trước khi nộp.');
      return;
    }

    state.pendingQuestionId = question.id;
    setButtonBusy(submitButton, 'Đang chấm bài...');
    syncPracticeControlState();

    let result;
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    try {
      const response = await fetch(`/student/questions/${question.id}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          selectedAnswer: submittedAnswer,
          practiceSessionId: state.practiceSessionId,
          questionIndex: submittedIndex,
          timeSpentSeconds: Math.round((Date.now() - state.startedAt) / 1000)
        })
      });
      result = await response.json().catch(() => null);

      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (result && result.code === 'PRACTICE_TIME_EXPIRED') {
        clearAnswerPending(submitButton);
        await showTimeExpiredDialog(result.redirectUrl);
        return;
      }
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (isSessionExpired(response, result)) {
        clearAnswerPending(submitButton);
        showSessionExpiredFeedback(result && result.message);
        return;
      }
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (!result) throw new Error('Phản hồi không phải JSON');
    } catch (error) {
      clearAnswerPending(submitButton);
      showRetryFeedback(
        'Chưa gửi được đáp án. Em kiểm tra lại kết nối mạng rồi bấm "Thử lại" nhé.',
        submitAnswer
      );
      return;
    }

    clearAnswerPending(submitButton);

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!result.ok) {
      showFeedback('danger', result.message || 'Không thể nộp đáp án.');
      syncPracticeControlState();
      return;
    }

    // Kết quả luôn được ghi nhận và thanh tiến trình luôn cập nhật, bất kể học
    // sinh còn ở câu đó hay đã chuyển đi. Lưu luôn đáp án đúng và lời giải mà
    // server vừa trả, vì dữ liệu câu hỏi nhúng trong trang không còn chứa chúng;
    // nhờ đó quay lại xem câu cũ vẫn dựng lại được đầy đủ phản hồi.
    state.results[question.id] = {
      selectedAnswer: submittedAnswer,
      isCorrect: Boolean(result.isCorrect),
      correctAnswer: result.correctAnswer || null,
      explanation: result.explanation || null
    };
    clearAnswerDraft(question.id);
    updateQuestionProgressBar();

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (state.currentIndex !== submittedIndex) {
      // Học sinh đã sang câu khác. Không tô màu, không hiện lời giải, không ẩn
      // nút nộp và không đặt state.answered của câu đang xem.
      maybeShowSummary();
      return;
    }

    state.answered = true;
    markAnswerState(result, submittedAnswer);
    showResultFeedback(result);

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (submitButton) submitButton.hidden = true;
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (nextButton && state.currentIndex < state.questions.length - 1) {
      nextButton.hidden = false;
    }
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (finishButton) {
      finishButton.hidden = false;
    }

    syncPracticeControlState();
    maybeShowSummary();
  }

  // Khi mọi câu trong bài đã có kết quả, hiện bảng tổng kết thay cho việc để
  // học sinh đứng lại ở câu cuối mà không biết làm gì tiếp.
  function maybeShowSummary() {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (state.questions.length === 0) return;
    const allAnswered = state.questions.every((question) => state.results[question.id]);
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!allAnswered) return;
    renderSummary();
  }

  // Ba sao theo tỉ lệ đúng: mốc quen thuộc với trẻ em từ các trò chơi. Ngưỡng
  // rộng rãi có chủ đích — mục tiêu là động viên, không phải xếp hạng.
  function tinhSoSao(correctCount, total) {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (total === 0) return 0;
    const percent = correctCount / total;
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (percent >= 0.9) return 3;
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (percent >= 0.65) return 2;
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (percent >= 0.4) return 1;
    return 0;
  }

  // Hàm loiNhanTongKet dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function loiNhanTongKet(soSao, correctCount, total) {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (correctCount === total && total > 0) return 'Tuyệt vời! Em làm đúng hết cả bài!';
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (soSao === 3) return 'Giỏi quá! Em sắp đúng hết rồi!';
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (soSao === 2) return 'Em làm tốt lắm! Xem lại vài câu là giỏi hẳn luôn!';
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (soSao === 1) return 'Em đã cố gắng nhiều rồi! Xem lại các câu sai để lần sau cao điểm hơn nhé.';
    return 'Không sao đâu! Xem lại lời giải rồi thử lại, em sẽ làm được!';
  }

  // Mưa giấy màu thuần CSS khi đạt 2 sao trở lên. Tôn trọng cài đặt giảm chuyển
  // động của thiết bị: không rơi giấy với người dùng bật reduced-motion.
  function confettiHtml(soSao) {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (soSao < 2) return '';
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return '';
    const mau = ['#2563eb', '#f97316', '#16a34a', '#eab308', '#ec4899'];
    const manh = Array.from({ length: 18 }, (_, i) => {
      const left = (i * 137) % 100;
      const delay = ((i * 53) % 40) / 100;
      const color = mau[i % mau.length];
      return `<i style="left:${left}%;animation-delay:${delay}s;background:${color}"></i>`;
    }).join('');
    return `<div class="confetti" aria-hidden="true">${manh}</div>`;
  }

  // Hàm renderSummary dùng để chuẩn bị và hiển thị kết quả cho người dùng; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function renderSummary() {
    const panel = document.getElementById('practiceSummary');
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!panel) return;

    const total = state.questions.length;
    const wrongQuestions = state.questions
      .map((question, index) => ({ question, index, result: state.results[question.id] }))
      .filter((item) => item.result && !item.result.isCorrect);
    const correctCount = total - wrongQuestions.length;
    const soSao = tinhSoSao(correctCount, total);
    const percent = total > 0 ? Math.round((correctCount / total) * 100) : 0;

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
      : '';

    const saoHtml = `
      <div class="summary-stars" role="img" aria-label="Em đạt ${soSao} trên 3 sao">
        ${[1, 2, 3].map((moc) => `
          <span class="summary-star ${soSao >= moc ? 'earned' : ''}" style="animation-delay:${moc * 0.18}s" aria-hidden="true">★</span>
        `).join('')}
      </div>
    `;

    panel.innerHTML = `
      ${confettiHtml(soSao)}
      <div class="summary-head">
        ${saoHtml}
        <h2>${loiNhanTongKet(soSao, correctCount, total)}</h2>
        <p class="summary-score"><strong>${correctCount}</strong>/${total} câu đúng</p>
      </div>
      <div class="progress-track large" role="progressbar" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100" aria-label="Đúng ${correctCount} trên ${total} câu">
        <span style="width: ${percent}%"></span>
      </div>
      ${wrongListHtml}
    `;
    panel.hidden = false;

    panel.querySelectorAll('[data-summary-jump]').forEach((button) => {
      button.addEventListener('click', () => {
        const index = Number(button.dataset.summaryJump);
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (!Number.isInteger(index)) return;
        state.currentIndex = index;
        renderCurrentQuestion();
        document.getElementById('practiceApp')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Hàm setButtonBusy dùng để cập nhật trạng thái hoặc dữ liệu theo quy tắc nghiệp vụ; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function setButtonBusy(button, busyLabel) {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!button || button.dataset.originalHtml) return;
    button.dataset.originalHtml = button.innerHTML;
    button.innerHTML = `<span class="btn-spinner" aria-hidden="true"></span>${escapeHtml(busyLabel)}`;
    button.setAttribute('aria-busy', 'true');
  }

  // Hàm restoreButton dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function restoreButton(button) {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!button || !button.dataset.originalHtml) return;
    button.innerHTML = button.dataset.originalHtml;
    delete button.dataset.originalHtml;
    button.removeAttribute('aria-busy');
    refreshIcons();
  }

  // Hàm showRetryFeedback dùng để chuẩn bị và hiển thị kết quả cho người dùng; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function showRetryFeedback(message, retryHandler) {
    const feedback = document.getElementById('answerFeedback');
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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

  // Hết phiên đăng nhập không phải lỗi mạng: bấm "Thử lại" bao nhiêu lần cũng
  // vô ích. Phải chỉ đúng đường cho học sinh là đăng nhập lại.
  function showSessionExpiredFeedback(message) {
    const feedback = document.getElementById('answerFeedback');
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!feedback) return;
    feedback.className = 'answer-feedback feedback-warning';
    feedback.hidden = false;
    feedback.innerHTML = `
      <h2>Em cần đăng nhập lại</h2>
      <p>${escapeHtml(message || 'Phiên học đã hết hạn vì để lâu không dùng.')}</p>
      <a class="btn btn-primary" href="/auth/login">Đăng nhập lại</a>
    `;
  }

  // Hàm isSessionExpired dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function isSessionExpired(response, result) {
    return response.status === 401 || (result && result.code === 'SESSION_EXPIRED');
  }

  // Hàm markAnswerState dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function markAnswerState(result, submittedAnswer) {
    document.querySelectorAll('.answer-choice').forEach((button) => {
      const answer = button.dataset.answer;
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (answer === result.correctAnswer) {
        button.classList.add('correct');
      }
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (answer === submittedAnswer && !result.isCorrect) {
        button.classList.add('wrong');
      }
      // Class này chỉ gắn ở lượt vừa nộp để chạy animation một lần. Khi học
      // sinh quay lại xem câu cũ, renderAnsweredState() dựng lại nút mà không
      // gắn class nên màn hình không nhấp nháy lại.
      if (button.classList.contains('correct') || button.classList.contains('wrong')) {
        button.classList.add('just-answered');
      }
    });
  }

  // Lời khen và lời động viên xoay vòng ngẫu nhiên. Với trẻ 6-11 tuổi, một câu
  // "Giỏi quá!" kèm mặt cười có sức giữ chân hơn mọi thông báo nghiệp vụ; câu
  // chữ lúc sai tuyệt đối không chê, chỉ rủ em thử tiếp.
  const LOI_KHEN = [
    '🎉 Giỏi quá! Em làm đúng rồi!',
    '⭐ Chính xác! Em tính chuẩn ghê!',
    '👏 Hay lắm! Cứ đà này nhé!',
    '🌟 Đúng rồi! Em thật cừ!',
    '🥳 Tuyệt vời! Thêm một câu đúng nữa!'
  ];
  const LOI_DONG_VIEN = [
    '💪 Chưa đúng, nhưng không sao! Xem lời giải rồi mình làm tiếp nhé.',
    '🌱 Gần đúng rồi! Đọc lời giải để biết chỗ cần sửa nha.',
    '🤗 Sai một chút thôi! Ai học giỏi cũng từng sai mà.',
    '🔍 Chưa đúng rồi. Xem lời giải bên dưới, em sẽ hiểu ngay!'
  ];

  // Hàm cauNgauNhien dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function cauNgauNhien(danhSach) {
    return danhSach[Math.floor(Math.random() * danhSach.length)];
  }

  // Hàm showResultFeedback dùng để chuẩn bị và hiển thị kết quả cho người dùng; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function showResultFeedback(result) {
    const title = result.isCorrect ? cauNgauNhien(LOI_KHEN) : cauNgauNhien(LOI_DONG_VIEN);
    const tone = result.isCorrect ? 'success' : 'danger';
    const misconception = result.misconception
      ? `<p><strong>Lỗi sai thường gặp:</strong> ${escapeHtml(result.misconception.explanation)}</p>`
      : '';
    // Khi sai, nhắc lại đáp án đúng ngay trong phản hồi. Chỉ tô màu ở nút thì
    // học sinh nhỏ tuổi dễ bỏ sót vì mắt còn đang dừng ở khung phản hồi.
    const correctAnswerLine = !result.isCorrect && result.correctAnswer
      ? `<p class="feedback-correct-answer">Đáp án đúng là <strong>${escapeHtml(result.correctAnswer)}</strong></p>`
      : '';
    const explanation = result.explanation
      ? `<div class="explanation-content"><strong>Lời giải:</strong>${renderExplanationContent(result.explanation)}</div>`
      : '';

    showFeedback(tone, `
      <h2>${escapeHtml(title)}</h2>
      ${correctAnswerLine}
      ${misconception}
      ${explanation}
    `, true);
  }

  // Hàm showFeedback dùng để chuẩn bị và hiển thị kết quả cho người dùng; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function showFeedback(type, message, isHtml = false) {
    const feedback = document.getElementById('answerFeedback');
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!feedback) return;
    feedback.className = `answer-feedback feedback-${type}`;
    feedback.hidden = false;
    feedback.innerHTML = isHtml ? message : escapeHtml(message);
    renderMath(feedback);
  }

  // Hàm nextQuestion dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function nextQuestion() {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (isAnswerPending() || state.finishing || state.timeExpired) return;
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (state.currentIndex < state.questions.length - 1) {
      state.currentIndex += 1;
      renderCurrentQuestion();
    }
  }

  // Hàm finishPractice dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  async function finishPractice(options = {}) {
    const timedOut = Boolean(options.timedOut);
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (state.finishing) return;
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (isAnswerPending() && !timedOut) return;
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!state.practiceSessionId) {
      window.location.href = '/student/history';
      return;
    }

    // Kết thúc là thao tác một chiều: completeSession đặt status COMPLETED và
    // sessionPractice sẽ chuyển mọi phiên COMPLETED sang trang xem lại, không có
    // đường làm tiếp. Vì nút này nằm ngay cạnh "Câu tiếp theo" nên phải hỏi lại
    // khi bài còn dở.
    const remaining = state.questions.filter((question) => !state.results[question.id]).length;
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!timedOut && remaining > 0) {
      const confirmed = await showAppConfirm({
        title: 'Kết thúc bài làm?',
        message: `Em còn ${remaining} câu chưa làm. Kết thúc bây giờ thì bài này sẽ đóng lại và không làm tiếp được nữa.`,
        tone: 'warning',
        confirmLabel: 'Kết thúc bài',
        cancelLabel: 'Tiếp tục làm'
      });
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (!confirmed) return;
    }

    state.finishing = true;
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (timedOut) disablePracticeControls();
    const finishButton = document.getElementById('finishPracticeButton');
    setButtonBusy(finishButton, 'Đang lưu kết quả...');
    syncPracticeControlState();

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    try {
      const response = await fetch(`/student/sessions/${state.practiceSessionId}/finish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' }
      });
      const result = await response.json().catch(() => null);

      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (isSessionExpired(response, result)) {
        state.finishing = false;
        restoreButton(finishButton);
        syncPracticeControlState();
        showSessionExpiredFeedback(result && result.message);
        return;
      }
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (!response.ok || !result || result.ok !== true) {
        throw new Error(result?.message || 'Không thể kết thúc bài làm');
      }

      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (timedOut) {
        await showTimeExpiredDialog(result.redirectUrl);
        return;
      }
      window.location.href = result.redirectUrl || '/student/history';
    } catch (error) {
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (timedOut) {
        await showTimeExpiredDialog(`/student/sessions/${state.practiceSessionId}`);
        return;
      }
      state.finishing = false;
      restoreButton(finishButton);
      syncPracticeControlState();
      showRetryFeedback(
        'Chưa lưu được kết quả bài làm. Em kiểm tra kết nối mạng rồi bấm "Thử lại" nhé.',
        finishPractice
      );
    }
  }

  // Hàm showTimeExpiredDialog dùng để chuẩn bị và hiển thị kết quả cho người dùng; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  async function showTimeExpiredDialog(redirectUrl) {
    clearCountdown();
    state.timeExpired = true;
    disablePracticeControls();
    await showAppAlert({
      title: 'Đã hết thời gian làm bài',
      message: 'Hệ thống đã tự động kết thúc bài và lưu lại những câu em đã nộp.',
      tone: 'warning',
      confirmLabel: 'Xem kết quả'
    });
    window.location.href = redirectUrl || `/student/sessions/${state.practiceSessionId}`;
  }

  // Hàm requestExerciseHelp dùng để xử lý yêu cầu, điều phối các bước nghiệp vụ và phản hồi lỗi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  async function requestExerciseHelp(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.elements.message;
    const button = form.querySelector('button[type="submit"]');
    const question = state.questions[state.currentIndex];
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!question) return;

    const message = input.value.trim();
    appendChat('student', message || 'Em muốn được gợi ý thêm.');
    input.value = '';
    input.disabled = true;
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (button) button.disabled = true;
    const thinkingNode = appendChat('ai', 'Mình đang xem câu này với em...', { loading: true });

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (button) button.disabled = false;
      input.focus();
    }
  }

  // Hàm appendChat dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function appendChat(role, text, options = {}) {
    const box = document.getElementById('chatMessages');
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!box) return null;
    const node = document.createElement('div');
    node.className = `chat-message ${role === 'student' ? 'student' : 'ai'}${options.loading ? ' loading' : ''}`;
    renderChatNode(node, role, text);
    box.appendChild(node);
    box.scrollTop = box.scrollHeight;
    return node;
  }

  // Hàm updateChat dùng để cập nhật trạng thái hoặc dữ liệu theo quy tắc nghiệp vụ; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function updateChat(node, text) {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!node) return;
    node.classList.remove('loading');
    renderChatNode(node, 'ai', text);
    const box = document.getElementById('chatMessages');
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (box) box.scrollTop = box.scrollHeight;
  }

  // Hàm renderChatNode dùng để chuẩn bị và hiển thị kết quả cho người dùng; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function renderChatNode(node, role, text) {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (role === 'ai') {
      node.innerHTML = renderMarkdownText(text);
    } else {
      node.textContent = text;
    }
    renderMath(node);
  }

  // Hàm renderMarkdownText dùng để chuẩn bị và hiển thị kết quả cho người dùng; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
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

  document.addEventListener('DOMContentLoaded', initPractice);
})();
