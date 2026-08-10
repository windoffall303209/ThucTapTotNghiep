// C?u h?nh grades t?p trung c?c h?ng s? v? quy t?c kh?i ch?y d?ng chung c?a ?ng d?ng.
const MIN_GRADE = 1;
const MAX_GRADE = 5;
const PRIMARY_GRADES = Array.from(
  { length: MAX_GRADE - MIN_GRADE + 1 },
  (_, index) => MIN_GRADE + index
);
const GRADE_RANGE_LABEL = `lớp ${MIN_GRADE} đến lớp ${MAX_GRADE}`;
const SHORT_GRADE_RANGE_LABEL = `${MIN_GRADE}-${MAX_GRADE}`;

// H?m normalizeGrade d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function normalizeGrade(value) {
  const grade = Number(value);
  return Number.isInteger(grade) ? grade : null;
}

// H?m isSupportedGrade d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function isSupportedGrade(value) {
  const grade = normalizeGrade(value);
  return grade !== null && grade >= MIN_GRADE && grade <= MAX_GRADE;
}

// H?m gradeOptions d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function gradeOptions() {
  return PRIMARY_GRADES.map((grade) => ({
    value: grade,
    label: `Lớp ${grade}`
  }));
}

module.exports = {
  MIN_GRADE,
  MAX_GRADE,
  PRIMARY_GRADES,
  GRADE_RANGE_LABEL,
  SHORT_GRADE_RANGE_LABEL,
  normalizeGrade,
  isSupportedGrade,
  gradeOptions
};
