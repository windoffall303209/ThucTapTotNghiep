// Ti?n ?ch text cleanup cung c?p c?c h?m d?ng chung cho chu?n h?a d? li?u, b?o m?t v? x? l? l?i.
function normalizeExplanationText(value) {
  return normalizeSetNotationLineBreaks(value)
    .replace(/dấu\s+“:\s*”/g, 'dấu “;”')
    .replace(/dấu\s+":\s*"/g, 'dấu ";"')
    .replace(/\bCác viết tập hợp\b/g, 'Cách viết tập hợp')
    .replace(/\bLời giải Các\b/g, 'Lời giải: Các')
    .replace(/\r?\n\s*Chọn\s*(?=\r?\nKết luận:)/g, '');
}

// H?m normalizeQuestionText d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function normalizeQuestionText(value) {
  return String(value || '')
    .replace(/\bCác viết tập hợp\b/g, 'Cách viết tập hợp');
}

// H?m normalizeSetNotationLineBreaks d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
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
