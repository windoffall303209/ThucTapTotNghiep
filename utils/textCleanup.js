// Tiện ích text cleanup cung cấp các hàm dùng chung cho chuẩn hóa dữ liệu, bảo mật và xử lý lỗi.
function normalizeExplanationText(value) {
  return normalizeSetNotationLineBreaks(value)
    .replace(/dấu\s+“:\s*”/g, 'dấu “;”')
    .replace(/dấu\s+":\s*"/g, 'dấu ";"')
    .replace(/\bCác viết tập hợp\b/g, 'Cách viết tập hợp')
    .replace(/\bLời giải Các\b/g, 'Lời giải: Các')
    .replace(/\r?\n\s*Chọn\s*(?=\r?\nKết luận:)/g, '');
}

// Hàm normalizeQuestionText dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function normalizeQuestionText(value) {
  return String(value || '')
    .replace(/\bCác viết tập hợp\b/g, 'Cách viết tập hợp');
}

// Hàm normalizeSetNotationLineBreaks dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function normalizeSetNotationLineBreaks(value) {
  return String(value || '').replace(/\{([^{}]*[\r\n][^{}]*)\}/g, (match, inner) => {
    const compactInner = inner
      .replace(/\s*;\s*(?:\r?\n)+\s*/g, '; ')
      .replace(/\s*,\s*(?:\r?\n)+\s*/g, ', ')
      .replace(/\s+/g, ' ')
      .trim();
    return `{${compactInner}}`;
  });
}

module.exports = {
  normalizeExplanationText,
  normalizeQuestionText,
  normalizeSetNotationLineBreaks
};
