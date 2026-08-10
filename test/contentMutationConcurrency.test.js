// B? ki?m th? content mutation concurrency.test x?c minh h?nh vi v? c?c ?i?u ki?n bi?n quan tr?ng c?a h? th?ng.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const Question = require('../models/Question');

// H?m questionRow d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function questionRow(overrides = {}) {
  return {
    id: 7,
    lesson_id: 3,
    question_type: 'MULTIPLE_CHOICE',
    difficulty: 'EASY',
    layout_template: 'STACK_VERTICAL',
    content: {
      text: 'Đề bài',
      images: [{
        id: 'image-1',
        url: '/uploads/images/original.png',
        storage_provider: 'local'
      }]
    },
    choices: [
      { key: 'A', text: '1', images: [] },
      { key: 'B', text: '2', images: [] }
    ],
    correct_answer: 'A',
    explanation: { text: 'Lời giải', images: [] },
    is_active: 1,
    ...overrides
  };
}

test('cập nhật câu hỏi khóa hàng và từ chối revision đã cũ', async () => {
  const expected = questionRow();
  const current = questionRow({
    content: { text: 'Đã được request khác sửa', images: [] }
  });
  const calls = [];
  const updated = await Question.updateQuestion(
    expected.id,
    {
      lesson_id: 3,
      question_type: 'MULTIPLE_CHOICE',
      difficulty: 'EASY',
      layout_template: 'STACK_VERTICAL',
      content: { text: 'Thay đổi của tôi', images: [] },
      choices: expected.choices,
      correct_answer: 'A',
      explanation: expected.explanation,
      misconceptions: []
    },
    {
      expectedQuestion: expected,
      transaction: async (callback) => callback({
        // H?m execute d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
        async execute(sql) {
          calls.push(sql);
          return [[current]];
        }
      })
    }
  );

  assert.equal(updated, null);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /FROM QuestionBank[\s\S]+FOR UPDATE/);
});

test('nhân bản khóa câu nguồn và sao chép trong cùng transaction', async () => {
  const source = questionRow();
  const calls = [];
  const duplicate = await Question.duplicateQuestion(source.id, {
    transaction: async (callback) => callback({
      // H?m execute d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
      async execute(sql) {
        calls.push(sql);
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (/SELECT \*/.test(sql)) return [[source]];
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (/SELECT distractor_key/.test(sql)) {
          return [[{
            distractor_key: 'B',
            misconception_name: 'Nhầm phép tính',
            explanation: 'Cần kiểm tra lại.'
          }]];
        }
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (/INSERT INTO QuestionBank/.test(sql)) return [{ insertId: 99 }];
        return [{ affectedRows: 1 }];
      }
    })
  });

  assert.equal(duplicate.id, 99);
  assert.equal(duplicate.content.images[0].url, '/uploads/images/original.png');
  assert.match(duplicate.content.text, /bản sao/);
  assert.match(calls[0], /FOR SHARE/);
  assert.match(calls[2], /INSERT INTO QuestionBank/);
  assert.match(calls[3], /INSERT INTO CommonMisconceptions/);
});

test('controller dùng API nhân bản nguyên tử và gửi revision khi cập nhật', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'controllers', 'AdminController.js'),
    'utf8'
  );
  const updateBlock = source.slice(
    source.indexOf('async function updateQuestion'),
    source.indexOf('async function deleteQuestion')
  );
  const duplicateBlock = source.slice(
    source.indexOf('async function duplicateQuestion'),
    source.indexOf('function validateQuestionBody')
  );

  assert.match(updateBlock, /expectedQuestion:\s*question/);
  assert.match(duplicateBlock, /Question\.duplicateQuestion/);
  assert.doesNotMatch(duplicateBlock, /Question\.createQuestion/);
});
