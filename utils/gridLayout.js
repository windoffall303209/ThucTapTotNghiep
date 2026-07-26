/**
 * Chuẩn hóa bố cục lưới (canvas) dùng chung cho câu hỏi và thẻ lý thuyết.
 *
 * Trước đây bộ hàm này bị chép thành ba bản ở AdminController, models/Question
 * và models/Curriculum; danh sách loại ô của bản Curriculum thiếu
 * 'free_answer_input' nên thẻ lý thuyết soạn bằng canvas có ô điền đáp án bị
 * âm thầm hạ cấp thành ô chữ khi lưu. Gom về một chỗ để ba đường đi không thể
 * lệch nhau nữa.
 */

const GRID_CELL_TYPES = [
  'empty',
  'text',
  'image',
  'formula',
  'question_text',
  'answer',
  'free_answer_input',
  'solution',
  'remember',
  'instruction'
];

// Nhận cả chuỗi JSON (giá trị hidden input từ form) lẫn object đã parse.
function parseGridLayout(value) {
  let grid = value;
  if (typeof value === 'string') {
    try {
      grid = value ? JSON.parse(value) : {};
    } catch (error) {
      grid = {};
    }
  }
  return normalizeGridLayout(grid);
}

function normalizeGridLayout(value) {
  const grid = value && typeof value === 'object' ? value : {};
  const rows = clampGridSize(grid.rows || 5);
  const columns = clampGridSize(grid.columns || 5);
  const cells = Array.isArray(grid.cells) ? grid.cells : [];
  return {
    enabled: Boolean(grid.enabled),
    rows,
    columns,
    cells: cells
      .map((cell, index) => normalizeGridCell(cell, index, rows, columns))
      .filter(Boolean)
  };
}

function normalizeGridCell(cell, index, rows, columns) {
  if (!cell || typeof cell !== 'object') return null;
  const row = clampGridSpan(cell.row || 1, rows);
  const col = clampGridSpan(cell.col || 1, columns);
  const rowSpan = clampGridSpan(cell.rowSpan || 1, rows - row + 1);
  const colSpan = clampGridSpan(cell.colSpan || 1, columns - col + 1);
  return {
    id: String(cell.id || `grid-cell-${index + 1}`),
    row,
    col,
    rowSpan,
    colSpan,
    type: GRID_CELL_TYPES.includes(cell.type) ? cell.type : 'text',
    text: String(cell.text || '').trim(),
    image_url: String(cell.image_url || '').trim(),
    answer_key: String(cell.answer_key || '').trim().toUpperCase(),
    align: ['left', 'center', 'right'].includes(cell.align) ? cell.align : 'center',
    background: String(cell.background || '').trim()
  };
}

function clampGridSize(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 5;
  return Math.min(Math.max(Math.round(number), 1), 10);
}

function clampGridSpan(value, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.min(Math.max(Math.round(number), 1), Math.max(max, 1));
}

module.exports = {
  GRID_CELL_TYPES,
  parseGridLayout,
  normalizeGridLayout
};
