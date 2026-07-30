const HTML_UNSAFE_JSON_CHARACTERS = /[<>&\u2028\u2029]/g;
const JSON_CHARACTER_ESCAPES = {
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029'
};

function safeJsonForHtml(value) {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) return 'null';
  return serialized.replace(
    HTML_UNSAFE_JSON_CHARACTERS,
    (character) => JSON_CHARACTER_ESCAPES[character]
  );
}

module.exports = {
  safeJsonForHtml
};
