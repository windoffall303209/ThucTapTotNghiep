// Tiện ích grid layout cung cấp các hàm dùng chung cho chuẩn hóa dữ liệu, bảo mật và xử lý lỗi.
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
const MAX_GRID_TEXT_LENGTH = 10_000;
const MAX_GRID_IMAGE_URL_LENGTH = 2_048;
const MAX_GRID_CELL_ID_LENGTH = 100;

// Nhận cả chuỗi JSON (giá trị hidden input từ form) lẫn object đã parse.
function parseGridLayout(value) {
  let grid = value;
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (typeof value === 'string') {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    try {
      grid = value ? JSON.parse(value) : {};
    } catch (error) {
      grid = {};
    }
  }
  return normalizeGridLayout(grid);
}

// Hàm normalizeGridLayout dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
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
      .slice(0, rows * columns)
      .map((cell, index) => normalizeGridCell(cell, index, rows, columns))
      .filter(Boolean)
  };
}

// Hàm normalizeGridCell dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function normalizeGridCell(cell, index, rows, columns) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!cell || typeof cell !== 'object') return null;
  const row = clampGridSpan(cell.row || 1, rows);
  const col = clampGridSpan(cell.col || 1, columns);
  const rowSpan = clampGridSpan(cell.rowSpan || 1, rows - row + 1);
  const colSpan = clampGridSpan(cell.colSpan || 1, columns - col + 1);
  return {
    id: limitText(cell.id || `grid-cell-${index + 1}`, MAX_GRID_CELL_ID_LENGTH),
    row,
    col,
    rowSpan,
    colSpan,
    type: GRID_CELL_TYPES.includes(cell.type) ? cell.type : 'text',
    text: limitText(cell.text, MAX_GRID_TEXT_LENGTH),
    image_url: normalizeGridImageUrl(cell.image_url),
    answer_key: limitText(cell.answer_key, 10).toUpperCase(),
    align: ['left', 'center', 'right'].includes(cell.align) ? cell.align : 'center',
    background: normalizeGridBackground(cell.background)
  };
}

function limitText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function normalizeGridImageUrl(value) {
  const url = limitText(value, MAX_GRID_IMAGE_URL_LENGTH);
  if (!url) return '';
  if (url.startsWith('/uploads/images/')) return url;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? url : '';
  } catch (error) {
    return '';
  }
}

function normalizeGridBackground(value) {
  const color = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : '';
}

// Hàm clampGridSize dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function clampGridSize(value) {
  const number = Number(value);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!Number.isFinite(number)) return 5;
  return Math.min(Math.max(Math.round(number), 1), 10);
}

// Hàm clampGridSpan dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function clampGridSpan(value, max) {
  const number = Number(value);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!Number.isFinite(number)) return 1;
  return Math.min(Math.max(Math.round(number), 1), Math.max(max, 1));
}

module.exports = {
  GRID_CELL_TYPES,
  MAX_GRID_TEXT_LENGTH,
  parseGridLayout,
  normalizeGridLayout
};
