// Bộ kiểm thử content renderer.test xác minh hành vi và các điều kiện biên quan trọng của hệ thống.
const test = require('node:test');
const assert = require('node:assert/strict');
const renderer = require('../public/js/content-renderer');

// Hàm question dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function question(overrides = {}) {
  return {
    id: 1,
    question_type: 'MULTIPLE_CHOICE',
    layout_template: 'STACK_VERTICAL',
    correct_answer: 'B',
    content: { text: 'Tính $2 + 3$', images: [], grid_layout: { enabled: false } },
    choices: [
      { key: 'A', text: '4', images: [] },
      { key: 'B', text: '5', images: [] }
    ],
    explanation: { text: 'Vì $2 + 3 = 5$.', images: [] },
    ...overrides
  };
}

test('renderer escape nội dung và thuộc tính không tin cậy', () => {
  assert.equal(renderer.escapeHtml('<script>"x"</script>'), '&lt;script&gt;&quot;x&quot;&lt;/script&gt;');
  assert.equal(renderer.escapeAttribute('` onerror="x"'), '&#096; onerror=&quot;x&quot;');
});

test('renderer đặt hình theo placeholder và giữ hình chưa được chèn', () => {
  const html = renderer.renderQuestionContent(question({
    content: {
      text: 'Xem [image-1] rồi chọn đáp án',
      images: [
        { id: 'image-1', url: '/a.png', alt_text: 'Hình A', width_percent: 60 },
        { id: 'image-2', url: '/b.png', alt_text: 'Hình B' }
      ]
    }
  }));

  assert.match(html, /max-width:60%/);
  assert.match(html, /src="\/a\.png"/);
  assert.match(html, /src="\/b\.png"/);
  assert.doesNotMatch(html, /\[image-1\]/);
});

test('renderer hỗ trợ đầy đủ bố cục ảnh trên, ảnh dưới và chia cột', () => {
  const layouts = [
    ['VISUAL_TOP', /question-visual-stack visual-top/],
    ['VISUAL_BOTTOM', /question-visual-stack visual-bottom/],
    ['SPLIT_HORIZONTAL_LEFT_IMAGE', /question-split-layout image-left/],
    ['SPLIT_HORIZONTAL_RIGHT_IMAGE', /question-split-layout image-right/]
  ];

  layouts.forEach(([layout, pattern]) => {
    const html = renderer.renderQuestionContent(question({
      layout_template: layout,
      content: { text: 'Đề bài', images: [{ id: 'i', url: '/i.png' }] }
    }));
    assert.match(html, pattern);
  });
});

test('renderer hiển thị grid và trạng thái đáp án trong chế độ review', () => {
  const html = renderer.renderQuestionContent(question({
    content: {
      text: 'Chọn trong bảng',
      images: [],
      grid_layout: {
        enabled: true,
        rows: 1,
        columns: 2,
        cells: [
          { id: 'a', row: 1, col: 1, type: 'answer', answer_key: 'A', text: 'Sai' },
          { id: 'b', row: 1, col: 2, type: 'answer', answer_key: 'B', text: 'Đúng' }
        ]
      }
    }
  }), { preview: true, selectedAnswer: 'A', correctAnswer: 'B' });

  assert.match(html, /content-grid-layout/);
  assert.match(html, /grid-cell-answer wrong/);
  assert.match(html, /grid-cell-answer correct/);
});

test('renderer hiển thị trắc nghiệm và điền đáp án trong chế độ review', () => {
  const choices = renderer.renderAnswerArea(question(), {
    preview: true,
    selectedAnswer: 'A',
    correctAnswer: 'B'
  });
  assert.match(choices, /answer-choice preview-choice wrong/);
  assert.match(choices, /answer-choice preview-choice correct/);

  const fill = renderer.renderAnswerArea(question({ question_type: 'FILL_IN_THE_BLANK' }), {
    preview: true,
    selectedAnswer: '12'
  });
  assert.match(fill, />12<\/div>/);
});

test('renderer tạo ô nhập toán học có tên truy cập và bàn phím hỗ trợ phân số', () => {
  const fill = renderer.renderAnswerArea(question({ question_type: 'FILL_IN_THE_BLANK' }));

  assert.match(fill, /aria-label="Nhập đáp án của em"/);
  assert.match(fill, /inputmode="text"/);
  assert.match(fill, /enterkeyhint="done"/);
  assert.doesNotMatch(fill, /inputmode="decimal"/);
});

test('renderer bọc bảng rộng trong vùng cuộn và giữ ô đáp án tương tác được', () => {
  const html = renderer.renderGridLayout({
    enabled: true,
    rows: 1,
    columns: 10,
    cells: [
      { id: 'answer', row: 1, col: 1, type: 'answer', answer_key: 'A', text: 'Chọn em' },
      { id: 'fill', row: 1, col: 10, type: 'free_answer_input' }
    ]
  });

  assert.match(html, /class="content-grid-render" role="region"/);
  assert.match(html, /tabindex="0"/);
  assert.match(html, /class="content-grid-cell grid-cell-answer answer-choice"/);
  assert.match(html, /aria-label="Nhập đáp án ở hàng 1, cột 10"/);
});

test('renderer hiển thị lời giải nhiều dòng, hình và các bước', () => {
  const html = renderer.renderExplanationContent({
    text: 'Bước đầu\n[explain-1]',
    images: [{ id: 'explain-1', url: '/explain.png' }],
    steps: ['Tính tổng', 'Kiểm tra lại']
  });

  assert.match(html, /Bước đầu<br>/);
  assert.match(html, /src="\/explain\.png"/);
  assert.match(html, /<ol>/);
  assert.match(html, /Kiểm tra lại/);
});

test('renderer lý thuyết giữ đồng thời hình và nội dung body', () => {
  const html = renderer.renderTheoryCardPreview({
    type: 'concept',
    layout: 'visual_top',
    title: 'Phép cộng',
    body: 'Nội dung cần nhớ',
    images: [{ id: 'theory-1', url: '/theory.png' }]
  });

  assert.match(html, /src="\/theory\.png"/);
  assert.match(html, /Nội dung cần nhớ/);
});
