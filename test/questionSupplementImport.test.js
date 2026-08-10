// B? ki?m th? question supplement import.test x?c minh h?nh vi v? c?c ?i?u ki?n bi?n quan tr?ng c?a h? th?ng.
const assert = require('node:assert/strict');
const test = require('node:test');

const {
  curriculumScopePath,
  parseArguments,
  publicPathForUrl,
  validateBatch,
  validateBatchAgainstCurriculumScope
} = require('../scripts/import_question_supplement');

// H?m validQuestion d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function validQuestion() {
  return {
    source_key: 'SUP-G1-L001-H01',
    lesson_id: 1,
    knowledge_tags: ['spatial_between'],
    curriculum_review: {
      status: 'VERIFIED_AGAINST_SCOPE',
      evidence_pdf_pages: [7]
    },
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

// H?m validScope d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function validScope() {
  return {
    scope_id: 'grade-1-lessons-001-005',
    status: 'VERIFIED_FROM_TEXTBOOK',
    lessons: [
      {
        lesson_id: 1,
        pdf_pages: [7, 8],
        allowed_knowledge_tags: ['spatial_between'],
        forbidden_text_patterns: ['\\b(lớn hơn|bé hơn)\\b']
      }
    ]
  };
}

test('parseArguments mặc định chạy preflight và chỉ apply khi có cờ', () => {
  assert.deepEqual(parseArguments(['node', 'script', 'batch.json']), {
    file: 'batch.json',
    apply: false,
    confirmedDatabase: '',
    confirmedApproval: ''
  });
  assert.deepEqual(
    parseArguments([
      'node',
      'script',
      'batch.json',
      '--apply',
      '--confirm-database=webonluyen',
      '--confirm-approval=BATCH-01'
    ]),
    {
      file: 'batch.json',
      apply: true,
      confirmedDatabase: 'webonluyen',
      confirmedApproval: 'BATCH-01'
    }
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

test('curriculumScopePath chỉ nhận mã hồ sơ an toàn trong thư mục quy định', () => {
  const rootDir = process.cwd();
  assert.equal(
    curriculumScopePath('grade-1-lessons-001-005', rootDir),
    require('node:path').resolve(
      rootDir,
      'data/curriculum_scopes/grade-1-lessons-001-005.json'
    )
  );
  assert.equal(curriculumScopePath('../outside', rootDir), null);
  assert.equal(curriculumScopePath('Grade 1', rootDir), null);
});

test('validateBatch chấp nhận lô hợp lệ khi ảnh tồn tại', () => {
  const errors = validateBatch(
    { batch_id: 'BATCH-01', questions: [validQuestion()] },
    { imageExists: () => true }
  );
  assert.deepEqual(errors, []);
});

test('đối chiếu câu hỏi với thẻ kiến thức và đúng trang sách giáo khoa', () => {
  const batch = {
    batch_id: 'BATCH-01',
    curriculum_scope_id: 'grade-1-lessons-001-005',
    questions: [validQuestion()]
  };
  assert.deepEqual(validateBatchAgainstCurriculumScope(batch, validScope()), []);

  batch.questions[0].knowledge_tags = ['shape_properties'];
  batch.questions[0].curriculum_review.evidence_pdf_pages = [9];
  const errors = validateBatchAgainstCurriculumScope(batch, validScope());
  assert.ok(errors.some((error) => error.includes('kiến thức ngoài phạm vi')));
  assert.ok(errors.some((error) => error.includes('không thuộc trang SGK của bài')));
});

test('từ chối câu chưa được rà theo hồ sơ SGK hoặc thiếu bằng chứng trang', () => {
  const question = validQuestion();
  delete question.curriculum_review;
  const errors = validateBatchAgainstCurriculumScope(
    {
      batch_id: 'BATCH-01',
      curriculum_scope_id: 'grade-1-lessons-001-005',
      questions: [question]
    },
    validScope()
  );
  assert.ok(errors.some((error) => error.includes('VERIFIED_AGAINST_SCOPE')));
  assert.ok(errors.some((error) => error.includes('evidence_pdf_pages')));
});

test('chặn từ khóa kiến thức chưa được học dù câu khai báo thẻ hợp lệ', () => {
  const question = validQuestion();
  question.content.text = 'Vật nào lớn hơn vật còn lại?';
  const errors = validateBatchAgainstCurriculumScope(
    {
      batch_id: 'BATCH-01',
      curriculum_scope_id: 'grade-1-lessons-001-005',
      questions: [question]
    },
    validScope()
  );
  assert.ok(errors.some((error) => error.includes('nội dung chưa được học')));
});

test('validateBatch chỉ cho phép ghi khi lô có đủ bằng chứng phê duyệt', () => {
  const pending = { batch_id: 'BATCH-01', questions: [validQuestion()] };
  const pendingErrors = validateBatch(pending, {
    imageExists: () => true,
    requireApproval: true
  });
  assert.ok(pendingErrors.some((error) => error.includes('approval.status')));
  assert.ok(pendingErrors.some((error) => error.includes('approval.approved_by')));
  assert.ok(pendingErrors.some((error) => error.includes('approval.approved_at')));

  const approved = {
    ...pending,
    approval: {
      status: 'APPROVED',
      approved_by: 'Người dùng',
      approved_at: '2026-08-07T10:00:00+07:00'
    }
  };
  assert.deepEqual(
    validateBatch(approved, { imageExists: () => true, requireApproval: true }),
    []
  );
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
