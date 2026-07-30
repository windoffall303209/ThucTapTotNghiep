(function () {
  const { escapeHtml, renderMath } = window.AppUI;

  function initTheoryHelp() {
    document.querySelectorAll('.theory-help-button').forEach((button) => {
      button.addEventListener('click', async () => {
        const card = button.closest('.theory-card');
        const replyBox = card?.querySelector('.ai-inline-reply');
        if (!replyBox) return;
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
          const result = await response.json().catch(() => null);
          if (!response.ok || !result) throw new Error('Không tạo được phần gợi ý.');
  
          replyBox.hidden = false;
          button.setAttribute('aria-expanded', 'true');
          replyBox.innerHTML = renderMarkdownText(
            result.reply || result.message || 'Chưa có phản hồi.'
          );
          renderMath(replyBox);
        } catch (error) {
          replyBox.hidden = false;
          button.setAttribute('aria-expanded', 'true');
          replyBox.textContent = 'Chưa kết nối được phần gợi ý. Em thử lại sau ít phút nhé.';
        } finally {
          restoreButton(button);
          button.disabled = false;
        }
      });
    });
  }

  function setButtonBusy(button, busyLabel) {
    button.dataset.originalHtml = button.innerHTML;
    button.textContent = busyLabel;
    button.setAttribute('aria-busy', 'true');
  }

  function restoreButton(button) {
    if (button.dataset.originalHtml) button.innerHTML = button.dataset.originalHtml;
    delete button.dataset.originalHtml;
    button.removeAttribute('aria-busy');
    if (window.lucide) window.lucide.createIcons();
  }

  function renderMarkdownText(value) {
    let html = escapeHtml(value || '');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    const lines = html.split(/\r?\n/);
    const output = [];
    let listItems = [];

    const flushList = () => {
      if (listItems.length > 0) {
        output.push(`<ul>${listItems.join('')}</ul>`);
        listItems = [];
      }
    };

    lines.forEach((line) => {
      const bullet = line.match(/^\s*[-•]\s+(.+)$/);
      if (bullet) {
        listItems.push(`<li>${bullet[1]}</li>`);
      } else {
        flushList();
        if (line.trim()) output.push(`<p>${line}</p>`);
      }
    });
    flushList();
    return output.join('');
  }

  document.addEventListener('DOMContentLoaded', initTheoryHelp);
})();
