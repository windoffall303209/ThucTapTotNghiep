// Tiện ích safe json cung cấp các hàm dùng chung cho chuẩn hóa dữ liệu, bảo mật và xử lý lỗi.
const HTML_UNSAFE_JSON_CHARACTERS = /[<>&\u2028\u2029]/g;
const JSON_CHARACTER_ESCAPES = {
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029'
};

// Hàm safeJsonForHtml dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function safeJsonForHtml(value) {
  const serialized = JSON.stringify(value);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (serialized === undefined) return 'null';
  return serialized.replace(
    HTML_UNSAFE_JSON_CHARACTERS,
    (character) => JSON_CHARACTER_ESCAPES[character]
  );
}

module.exports = {
  safeJsonForHtml
};
