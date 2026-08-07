const assert = require('node:assert/strict');
const test = require('node:test');

const {
  DIFFICULTY_PATTERN_17,
  buildGrade5ReviewQuestions,
  compositeQuestion,
  manualQuestion,
  rotateOptions
} = require('../utils/supplementQuestionFactory');
const { wrapText, xmlEscape } = require('../scripts/build_all_question_supplements');

function source(text, correct = 'B') {
  return {
    content: { text },
    choices: ['A', 'B', 'C', 'D'].map((key) => ({ key, text: `Kết quả ${key}` })),
    correct_answer: correct,
    explanation: { text: `Giải ${text}` }
  };
}

test('mẫu 17 câu lớp 5 có đúng 9 dễ, 6 trung bình và 2 khó', () => {
  assert.equal(DIFFICULTY_PATTERN_17.filter((value) => value === 'EASY').length, 9);
  assert.equal(DIFFICULTY_PATTERN_17.filter((value) => value === 'MEDIUM').length, 6);
  assert.equal(DIFFICULTY_PATTERN_17.filter((value) => value === 'HARD').length, 2);
});

test('bộ tạo câu ôn tập lớp 5 sinh đủ câu, đáp án hợp lệ và phương án không trùng', () => {
  for (const lessonId of [381, 382, 383, 384, 385, 386, 387, 388, 389, 390]) {
    const questions = buildGrade5ReviewQuestions(lessonId, 17);
    assert.equal(questions.length, 17);
    for (const question of questions) {
      assert.equal(question.lesson_id, lessonId);
      assert.equal(question.choices.length, 4);
      assert.equal(new Set(question.choices.map((choice) => choice.text)).size, 4);
      assert.ok(question.choices.some((choice) => choice.key === question.correct_answer));
      assert.ok(question.content.images[0].url.endsWith('.png'));
    }
  }
});

test('câu tự luận có đáp án dài được đổi thành trắc nghiệm với khóa ngắn', () => {
  const question = manualQuestion({
    lessonId: 371,
    manual: {
      number: 4,
      question: 'Chọn nhận xét đúng.',
      answer: 'Một lời giải thích chính xác nhưng dài hơn năm mươi ký tự để vượt giới hạn lưu trữ hiện tại.',
      explanation: 'Giải thích.'
    },
    difficulty: 'EASY',
    sourceKey: 'SUP-LONG',
    imageUrl: '/images/long.png'
  });
  assert.equal(question.question_type, 'MULTIPLE_CHOICE');
  assert.equal(question.correct_answer.length, 1);
  assert.equal(question.choices.length, 4);
});

test('câu hai ý ghép đúng hai đáp án và mang nhãn HARD', () => {
  const question = compositeQuestion({
    grade: 3,
    lesson: { lesson_id: 99, lesson_name: 'Bài mẫu' },
    first: source('Ý thứ nhất', 'A'),
    second: source('Ý thứ hai', 'C'),
    sourceKey: 'SUP-TEST',
    imageUrl: '/images/test.png'
  });
  assert.equal(question.difficulty, 'HARD');
  const correct = question.choices.find((choice) => choice.key === question.correct_answer);
  assert.equal(correct.text, 'Ý 1: Kết quả A; Ý 2: Kết quả C');
});

test('xoay phương án vẫn giữ đúng đáp án và đủ bốn lựa chọn', () => {
  const result = rotateOptions('10', ['9', '11', '12'], 'seed');
  assert.equal(result.choices.length, 4);
  assert.equal(result.choices.find((choice) => choice.key === result.correctAnswer).text, '10');
});

test('hàm dựng ảnh bọc dòng và escape ký tự XML', () => {
  assert.ok(wrapText('một hai ba bốn năm sáu', 8).length > 1);
  assert.equal(xmlEscape('2 < 3 & 4 > 1'), '2 &lt; 3 &amp; 4 &gt; 1');
});
