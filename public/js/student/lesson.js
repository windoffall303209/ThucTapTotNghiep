// M? JavaScript ph?a tr?nh duy?t lesson ?i?u khi?n t??ng t?c v? c?p nh?t giao di?n ng??i d?ng.
(function () {
  const { escapeHtml, renderMath } = window.AppUI;

  // H?m initTheoryHelp d?ng ?? kh?i t?o tr?ng th?i v? c?c ph? thu?c c?n thi?t; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  function initTheoryHelp() {
    document.querySelectorAll('.theory-help-button').forEach((button) => {
      button.addEventListener('click', async () => {
        const card = button.closest('.theory-card');
        const replyBox = card?.querySelector('.ai-inline-reply');
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (!replyBox) return;
        button.disabled = true;
        setButtonBusy(button, 'Đang tạo giải thích...');
  
        // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
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
          // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
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

  // H?m setButtonBusy d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  function setButtonBusy(button, busyLabel) {
    button.dataset.originalHtml = button.innerHTML;
    button.textContent = busyLabel;
    button.setAttribute('aria-busy', 'true');
  }

  // H?m restoreButton d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  function restoreButton(button) {
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (button.dataset.originalHtml) button.innerHTML = button.dataset.originalHtml;
    delete button.dataset.originalHtml;
    button.removeAttribute('aria-busy');
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (window.lucide) window.lucide.createIcons();
  }

  // H?m renderMarkdownText d?ng ?? chu?n b? v? hi?n th? k?t qu? cho ng??i d?ng; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  function renderMarkdownText(value) {
    let html = escapeHtml(value || '');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    const lines = html.split(/\r?\n/);
    const output = [];
    let listItems = [];

    // H?m flushList d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
    const flushList = () => {
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (listItems.length > 0) {
        output.push(`<ul>${listItems.join('')}</ul>`);
        listItems = [];
      }
    };

    lines.forEach((line) => {
      const bullet = line.match(/^\s*[-•]\s+(.+)$/);
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (bullet) {
        listItems.push(`<li>${bullet[1]}</li>`);
      } else {
        flushList();
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (line.trim()) output.push(`<p>${line}</p>`);
      }
    });
    flushList();
    return output.join('');
  }

  document.addEventListener('DOMContentLoaded', initTheoryHelp);
})();
