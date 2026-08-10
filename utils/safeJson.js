// Ti?n ?ch safe json cung c?p c?c h?m d?ng chung cho chu?n h?a d? li?u, b?o m?t v? x? l? l?i.
const HTML_UNSAFE_JSON_CHARACTERS = /[<>&\u2028\u2029]/g;
const JSON_CHARACTER_ESCAPES = {
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029'
};

// H?m safeJsonForHtml d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function safeJsonForHtml(value) {
  const serialized = JSON.stringify(value);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (serialized === undefined) return 'null';
  return serialized.replace(
    HTML_UNSAFE_JSON_CHARACTERS,
    (character) => JSON_CHARACTER_ESCAPES[character]
  );
}

module.exports = {
  safeJsonForHtml
};
