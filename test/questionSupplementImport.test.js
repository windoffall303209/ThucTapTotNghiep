const assert = require('node:assert/strict');
const test = require('node:test');

const {
  parseArguments,
  publicPathForUrl,
  validateBatch
} = require('../scripts/import_question_supplement');

function validQuestion() {
  return {
    source_key: 'SUP-G1-L001-H01',
    lesson_id: 1,
    question_type: 'MULTIPLE_CHOICE',
    difficulty: 'HARD',
    layout_template: 'STACK_VERTICAL',
    content: {
      text: 'Câu hỏi mẫu?',
      images: [{ url: '/images/question-supplements/sample.png', alt_text: 'Ảnh mẫu' }]
    },
    choices: [
      { key: 'A', text: 'Một' },
      { key: 'B', text: 'Hai' },
      { key: 'C', text: 'Ba' },
      { key: 'D', text: 'Bốn' }
    ],
    correct_answer: 'B',
    explanation: { text: 'Lời giải mẫu.', images: [] },
    misconceptions: [
      { distractor_key: 'A', misconception_name: 'Nhầm dữ kiện', explanation: 'Cần đọc lại dữ kiện.' }
    ]
  };
}

test('parseArguments mặc định chạy preflight và chỉ apply khi có cờ', () => {
  assert.deepEqual(parseArguments(['node', 'script', 'batch.json']), {
    file: 'batch.json',
    apply: false,
    confirmedDatabase: ''
  });
  assert.deepEqual(
    parseArguments(['node', 'script', 'batch.json', '--apply', '--confirm-database=webonluyen']),
    { file: 'batch.json', apply: true, confirmedDatabase: 'webonluyen' }
  );
});

test('publicPathForUrl chỉ nhận URL nằm trong thư mục public', () => {
  const rootDir = process.cwd();
  assert.equal(
    publicPathForUrl('/images/question-supplements/sample.png', rootDir),
    require('node:path').resolve(rootDir, 'public/images/question-supplements/sample.png')
  );
  assert.equal(publicPathForUrl('/../.env', rootDir), null);
  assert.equal(publicPathForUrl('https://example.com/image.png', rootDir), null);
});

test('validateBatch chấp nhận lô hợp lệ khi ảnh tồn tại', () => {
  const errors = validateBatch(
    { batch_id: 'BATCH-01', questions: [validQuestion()] },
    { imageExists: () => true }
  );
  assert.deepEqual(errors, []);
});

test('validateBatch phát hiện source_key trùng, ảnh thiếu và đáp án sai', () => {
  const first = validQuestion();
  const second = validQuestion();
  second.correct_answer = 'E';
  const errors = validateBatch(
    { batch_id: 'BATCH-01', questions: [first, second] },
    { imageExists: () => false }
  );
  assert.ok(errors.some((error) => error.includes('source_key bị trùng')));
  assert.ok(errors.some((error) => error.includes('không tìm thấy tệp')));
  assert.ok(errors.some((error) => error.includes('correct_answer không khớp')));
});

test('validateBatch chặn đáp án vượt giới hạn cột database', () => {
  const question = validQuestion();
  question.question_type = 'FILL_IN_THE_BLANK';
  question.choices = null;
  question.correct_answer = 'x'.repeat(51);
  const errors = validateBatch(
    { batch_id: 'BATCH-01', questions: [question] },
    { imageExists: () => true }
  );
  assert.ok(errors.some((error) => error.includes('vượt quá giới hạn 50 ký tự')));
});
