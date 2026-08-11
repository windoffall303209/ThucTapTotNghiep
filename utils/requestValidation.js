// Chuẩn hóa các kiểu đầu vào HTTP phổ biến. Controller dùng các hàm này trước
// khi gọi model để giá trị NaN, số mũ, số âm hoặc chuỗi quá dài không lọt sâu
// vào luồng nghiệp vụ.
function parseInteger(value, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!['string', 'number'].includes(typeof value)) return null;
  const raw = String(value ?? '').trim();
  if (!/^-?\d+$/.test(raw)) return null;
  const number = Number(raw);
  return Number.isSafeInteger(number) && number >= min && number <= max ? number : null;
}

function parsePositiveInteger(value, max = Number.MAX_SAFE_INTEGER) {
  return parseInteger(value, { min: 1, max });
}

function normalizePage(value, fallback = 1, max = 100_000) {
  return parseInteger(value, { min: 1, max }) || fallback;
}

function normalizeBoundedText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function isAllowedValue(value, allowedValues) {
  if (!['string', 'number'].includes(typeof value)) return false;
  return allowedValues.includes(String(value ?? '').trim());
}

module.exports = {
  isAllowedValue,
  normalizeBoundedText,
  normalizePage,
  parseInteger,
  parsePositiveInteger
};
