// Mã JavaScript phía trình duyệt lesson điều khiển tương tác và cập nhật giao diện người dùng.
(function () {
  const { escapeHtml, renderMath } = window.AppUI;

  // Hàm initTheoryHelp dùng để khởi tạo trạng thái và các phụ thuộc cần thiết; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function initTheoryHelp() {
    document.querySelectorAll('.theory-help-button').forEach((button) => {
      button.addEventListener('click', async () => {
        const card = button.closest('.theory-card');
        const replyBox = card?.querySelector('.ai-inline-reply');
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (!replyBox) return;
        button.disabled = true;
        setButtonBusy(button, 'Đang tạo giải thích...');
  
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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
          // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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

  // Hàm setButtonBusy dùng để cập nhật trạng thái hoặc dữ liệu theo quy tắc nghiệp vụ; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function setButtonBusy(button, busyLabel) {
    button.dataset.originalHtml = button.innerHTML;
    button.textContent = busyLabel;
    button.setAttribute('aria-busy', 'true');
  }

  // Hàm restoreButton dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function restoreButton(button) {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (button.dataset.originalHtml) button.innerHTML = button.dataset.originalHtml;
    delete button.dataset.originalHtml;
    button.removeAttribute('aria-busy');
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (window.lucide) window.lucide.createIcons();
  }

  // Hàm renderMarkdownText dùng để chuẩn bị và hiển thị kết quả cho người dùng; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function renderMarkdownText(value) {
    let html = escapeHtml(value || '');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    const lines = html.split(/\r?\n/);
    const output = [];
    let listItems = [];

    // Hàm flushList dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
    const flushList = () => {
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (listItems.length > 0) {
        output.push(`<ul>${listItems.join('')}</ul>`);
        listItems = [];
      }
    };

    lines.forEach((line) => {
      const bullet = line.match(/^\s*[-•]\s+(.+)$/);
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (bullet) {
        listItems.push(`<li>${bullet[1]}</li>`);
      } else {
        flushList();
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (line.trim()) output.push(`<p>${line}</p>`);
      }
    });
    flushList();
    return output.join('');
  }

  document.addEventListener('DOMContentLoaded', initTheoryHelp);
})();
