function normalizeExplanationText(value) {
  return normalizeSetNotationLineBreaks(value)
    .replace(/dấu\s+“:\s*”/g, 'dấu “;”')
    .replace(/dấu\s+":\s*"/g, 'dấu ";"')
    .replace(/\bCác viết tập hợp\b/g, 'Cách viết tập hợp')
    .replace(/\bLời giải Các\b/g, 'Lời giải: Các')
    .replace(/\r?\n\s*Chọn\s*(?=\r?\nKết luận:)/g, '');
}

function normalizeQuestionText(value) {
  return String(value || '')
    .replace(/\bCác viết tập hợp\b/g, 'Cách viết tập hợp');
}

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
