const MIN_GRADE = 1;
const MAX_GRADE = 5;
const PRIMARY_GRADES = Array.from(
  { length: MAX_GRADE - MIN_GRADE + 1 },
  (_, index) => MIN_GRADE + index
);
const GRADE_RANGE_LABEL = `lớp ${MIN_GRADE} đến lớp ${MAX_GRADE}`;
const SHORT_GRADE_RANGE_LABEL = `${MIN_GRADE}-${MAX_GRADE}`;

function normalizeGrade(value) {
  const grade = Number(value);
  return Number.isInteger(grade) ? grade : null;
}

function isSupportedGrade(value) {
  const grade = normalizeGrade(value);
  return grade !== null && grade >= MIN_GRADE && grade <= MAX_GRADE;
}

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
