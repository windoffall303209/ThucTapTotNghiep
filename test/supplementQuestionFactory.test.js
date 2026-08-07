const assert = require('node:assert/strict');
const test = require('node:test');

const {
  DIFFICULTY_PATTERN_17,
  buildGrade5ReviewQuestions,
  compositeQuestion,
  manualQuestion,
  rotateOptions
} = require('../utils/supplementQuestionFactory');
const {
  cardSvg,
  extractDataTokens,
  inferIllustrationType,
  illustrationScene,
  wrapText,
  xmlEscape
} = require('../scripts/build_all_question_supplements');
const { lessonMap, parseGrades } = require('../scripts/regenerate_supplement_illustrations');

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

test('ảnh câu hỏi nhận diện chủ đề và đưa số liệu đề vào nhãn trực quan', () => {
  assert.equal(inferIllustrationType('Bể dài 60 cm, rộng 35 cm, cao 40 cm'), 'geometry');
  assert.equal(inferIllustrationType('Tính 2/5 của 120 kg'), 'fraction');
  assert.deepEqual(extractDataTokens('Bể dài 60 cm, rộng 35 cm, cao 40 cm'), ['60 cm', '35 cm', '40 cm']);
  assert.deepEqual(
    extractDataTokens('Bài bổ sung số 4. Ngăn kéo dài 30 cm, rộng 20 cm, cao 8 cm'),
    ['30 cm', '20 cm', '8 cm']
  );
  assert.deepEqual(extractDataTokens('Ý 1. Số 406 000 được đọc như thế nào?'), ['406 000']);
});

test('mỗi nhóm minh họa sinh hình học hoặc sơ đồ thật thay vì chỉ có chữ', () => {
  for (const [type, prompt] of [
    ['geometry', 'Hình hộp dài 30 cm, rộng 20 cm, cao 8 cm'],
    ['measurement', 'Đo đoạn dây dài 25 cm'],
    ['fraction', 'Tô màu 3/8 hình'],
    ['chart', 'Biểu đồ có các số liệu 20, 35, 50'],
    ['clock', 'Đồng hồ chỉ 8 giờ 15 phút'],
    ['groups', 'Có 4 thùng, mỗi thùng 6 hộp'],
    ['numbers', 'Tính 406 000 + 12 000']
  ]) {
    const scene = illustrationScene(prompt, type, 0, 0, 600, 240);
    assert.match(scene, /<(?:rect|circle|polygon|path|line)\b/);
  }
});

test('thẻ câu hỏi dành phần lớn không gian cho minh họa và không còn bố cục hai ô chữ', () => {
  const svg = cardSvg({
    content: { text: 'Bể dài 60 cm, rộng 35 cm, cao 40 cm.' },
    visual: { type: 'geometry', title: 'DỮ KIỆN BÀI TOÁN', lines: ['Bể dài 60 cm, rộng 35 cm, cao 40 cm.'] }
  }, 5, { chapter_name: 'Hình học', lesson_name: 'Bài 61' });
  assert.match(svg, /Hình minh họa dữ kiện/);
  assert.match(svg, /60 cm/);
  assert.match(svg, /<polygon\b/);
  assert.doesNotMatch(svg, /Đọc đủ dữ kiện trong hình trước khi chọn đáp án/);
});

test('câu dài được bọc dòng trong vùng chú thích của ảnh minh họa', () => {
  const longText = 'Bể kính mở nắp dài 60 cm, rộng 35 cm, cao 40 cm. Diện tích kính cần dùng là bao nhiêu?';
  const svg = cardSvg({
    content: { text: longText },
    visual: { type: 'geometry', title: 'DỮ KIỆN BÀI TOÁN', lines: [longText] }
  }, 5, { chapter_name: 'Hình học', lesson_name: 'Bài 61' });
  assert.doesNotMatch(svg, new RegExp(xmlEscape(longText)));
  assert.match(svg, /Bể kính mở nắp dài 60 cm,/);
  assert.match(svg, /Diện tích kính cần dùng là bao/);
});

test('lệnh sinh lại ảnh mặc định xử lý đủ các lớp có dữ liệu bổ sung', () => {
  assert.deepEqual(parseGrades([]), [1, 3, 4, 5]);
  assert.deepEqual(parseGrades(['--grades=5,1,5']), [5, 1]);
  assert.throws(() => parseGrades(['--grades=2']), /chỉ được gồm/);
  const lessons = lessonMap({ chapters: [{ chapter_name: 'Chương mẫu', lessons: [{ lesson_id: 7 }] }] });
  assert.equal(lessons.get(7).chapter_name, 'Chương mẫu');
});
