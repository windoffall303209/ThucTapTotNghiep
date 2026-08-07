const crypto = require('node:crypto');

const DIFFICULTY_PATTERN_17 = Object.freeze([
  ...Array(9).fill('EASY'),
  ...Array(6).fill('MEDIUM'),
  ...Array(2).fill('HARD')
]);

function hashNumber(value) {
  return Number.parseInt(crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 8), 16);
}

function stripChoicePrefix(value) {
  return String(value || '').replace(/^\s*[A-D][.)]\s*/i, '').trim();
}

function choiceText(question, key) {
  return stripChoicePrefix((question.choices || []).find((choice) => choice.key === key)?.text || '');
}

function rotateOptions(correct, wrongs, seed) {
  const uniqueWrongs = [...new Set(wrongs.map(String))].filter((value) => value !== String(correct));
  while (uniqueWrongs.length < 3) uniqueWrongs.push(`Phương án ${uniqueWrongs.length + 1}`);
  const options = [String(correct), ...uniqueWrongs.slice(0, 3)];
  const shift = hashNumber(seed) % 4;
  const rotated = options.slice(shift).concat(options.slice(0, shift));
  const keys = ['A', 'B', 'C', 'D'];
  return {
    choices: rotated.map((text, index) => ({ key: keys[index], text, images: [] })),
    correctAnswer: keys[rotated.indexOf(String(correct))]
  };
}

function misconceptionsFor(choices, correctAnswer, topic = 'Sai cách xử lý dữ kiện') {
  return choices
    .filter((choice) => choice.key !== correctAnswer)
    .map((choice) => ({
      distractor_key: choice.key,
      misconception_name: topic,
      explanation: `Phương án ${choice.key} chưa thỏa mãn đầy đủ dữ kiện hoặc quy tắc tính của bài.`
    }));
}

function imageDescriptor(sourceKey, imageUrl, altText) {
  return [{
    id: `${sourceKey}-IMG-01`,
    url: imageUrl,
    alt_text: altText,
    width_percent: 78
  }];
}

function compositeQuestion({ grade, lesson, first, second, sourceKey, imageUrl }) {
  const firstCorrect = choiceText(first, first.correct_answer);
  const secondCorrect = choiceText(second, second.correct_answer);
  const firstWrong = choiceText(first, (first.choices || []).find((choice) => choice.key !== first.correct_answer)?.key);
  const secondWrong = choiceText(second, (second.choices || []).find((choice) => choice.key !== second.correct_answer)?.key);
  const correctPair = `Ý 1: ${firstCorrect}; Ý 2: ${secondCorrect}`;
  const options = rotateOptions(correctPair, [
    `Ý 1: ${firstWrong}; Ý 2: ${secondCorrect}`,
    `Ý 1: ${firstCorrect}; Ý 2: ${secondWrong}`,
    `Ý 1: ${firstWrong}; Ý 2: ${secondWrong}`
  ], sourceKey);

  return {
    source_key: sourceKey,
    lesson_id: Number(lesson.lesson_id),
    concept_id: null,
    question_type: 'MULTIPLE_CHOICE',
    difficulty: 'HARD',
    layout_template: 'STACK_VERTICAL',
    content: {
      text: `Thử thách hai ý của ${lesson.lesson_name}: chọn cặp kết quả đúng theo thứ tự trong hình.`,
      instruction: 'Giải lần lượt ý 1 và ý 2 rồi chọn một đáp án.',
      interaction: 'choose',
      layout_variant: 'VISUAL_TOP',
      images: imageDescriptor(sourceKey, imageUrl, `Hai ý toán học thuộc ${lesson.lesson_name}, lớp ${grade}.`)
    },
    choices: options.choices,
    correct_answer: options.correctAnswer,
    explanation: {
      text: `Ý 1: ${first.explanation?.text || `Đáp án đúng là ${firstCorrect}.`} Ý 2: ${second.explanation?.text || `Đáp án đúng là ${secondCorrect}.`} Vì vậy cặp kết quả đúng là “${correctPair}”.`,
      short_text: correctPair,
      steps: [
        `Giải ý 1 để được ${firstCorrect}.`,
        `Giải ý 2 để được ${secondCorrect}.`,
        'Ghép hai kết quả theo đúng thứ tự.'
      ],
      images: []
    },
    misconceptions: misconceptionsFor(options.choices, options.correctAnswer, 'Chỉ giải đúng một ý hoặc ghép sai thứ tự'),
    visual: {
      type: 'two_panel',
      title: 'THỬ THÁCH HAI Ý',
      lines: [`Ý 1. ${first.content?.text || ''}`, `Ý 2. ${second.content?.text || ''}`]
    }
  };
}

function normalizeManualChoices(choices) {
  return (choices || []).map((value, index) => ({
    key: String.fromCharCode(65 + index),
    text: stripChoicePrefix(value),
    images: []
  }));
}

function manualQuestion({ lessonId, manual, difficulty, sourceKey, imageUrl }) {
  let choices = normalizeManualChoices(manual.choices);
  let correctAnswer = '';
  if (choices.length === 4) {
    const answerText = stripChoicePrefix(manual.answer);
    correctAnswer = choices.find((choice) => choice.text === answerText)?.key
      || String(manual.answer || '').trim().slice(0, 1).toUpperCase();
  } else {
    choices = null;
    correctAnswer = String(manual.answer || '').trim();
  }

  const type = choices ? 'MULTIPLE_CHOICE' : 'FILL_IN_THE_BLANK';
  const base = {
    source_key: sourceKey,
    lesson_id: Number(lessonId),
    concept_id: null,
    question_type: type,
    difficulty,
    layout_template: 'STACK_VERTICAL',
    content: {
      text: String(manual.question || '').trim(),
      instruction: choices ? 'Chọn một đáp án đúng.' : String(manual.response || 'Điền đáp án phù hợp.'),
      interaction: choices ? 'choose' : 'fill_blank',
      layout_variant: 'VISUAL_TOP',
      images: imageDescriptor(sourceKey, imageUrl, `Dữ kiện trực quan của câu hỏi: ${manual.question}`)
    },
    choices,
    correct_answer: correctAnswer,
    explanation: {
      text: String(manual.explanation || '').trim(),
      short_text: `Đáp án: ${manual.answer}`,
      steps: [],
      images: []
    },
    misconceptions: choices ? misconceptionsFor(choices, correctAnswer) : [],
    visual: {
      type: inferVisualType(manual.question),
      title: 'DỮ KIỆN BÀI TOÁN',
      lines: [String(manual.question || '').trim()]
    }
  };
  return base;
}

function gcd(left, right) {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

function fraction(numerator, denominator) {
  const divisor = gcd(numerator, denominator);
  return `${numerator / divisor}/${denominator / divisor}`;
}

function viNumber(value, digits = 0) {
  return Number(value).toLocaleString('vi-VN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function inferVisualType(text) {
  const value = String(text || '').toLowerCase();
  if (/hình|diện tích|chu vi|thể tích|đường kính|bán kính/.test(value)) return 'geometry';
  if (/biểu đồ|số liệu|thống kê|xác suất/.test(value)) return 'chart';
  if (/giờ|phút|giây|thời gian/.test(value)) return 'clock';
  if (/phân số|\d+\/\d+/.test(value)) return 'fraction';
  if (/kg|tấn|mét|cm|mm|lít/.test(value)) return 'measurement';
  return 'numbers';
}

function generatedQuestion({ lessonId, index, difficulty, prompt, correct, wrongs, explanation, visualType }) {
  const sourceKey = `SUP-20260807-G5-L${String(lessonId).padStart(3, '0')}-Q${String(index + 1).padStart(2, '0')}`;
  const options = rotateOptions(correct, wrongs, sourceKey);
  const imageUrl = `/images/question-supplements/generated/grade-5/lesson-${String(lessonId).padStart(3, '0')}/q-${String(index + 1).padStart(2, '0')}.png`;
  return {
    source_key: sourceKey,
    lesson_id: Number(lessonId),
    concept_id: null,
    question_type: 'MULTIPLE_CHOICE',
    difficulty,
    layout_template: 'STACK_VERTICAL',
    content: {
      text: prompt,
      instruction: 'Các số liệu quan trọng đã được đặt trực tiếp trong hình.',
      interaction: 'choose',
      layout_variant: 'VISUAL_TOP',
      images: imageDescriptor(sourceKey, imageUrl, `Hình chứa đầy đủ số liệu: ${prompt}`)
    },
    choices: options.choices,
    correct_answer: options.correctAnswer,
    explanation: {
      text: explanation,
      short_text: `Đáp án đúng: ${correct}`,
      steps: [],
      images: []
    },
    misconceptions: misconceptionsFor(options.choices, options.correctAnswer),
    visual: { type: visualType || inferVisualType(prompt), title: 'BÀI TOÁN ÔN TẬP', lines: [prompt] }
  };
}

function naturalQuestion(lessonId, index, difficulty, offset = 0) {
  const i = index + offset * 19;
  if (difficulty === 'EASY') {
    const a = 1200 + i * 137;
    const b = 320 + i * 23;
    const prompt = i % 3 === 0
      ? `Tính ${a.toLocaleString('vi-VN')} + ${b.toLocaleString('vi-VN')}.`
      : i % 3 === 1
        ? `Tính ${(a + b).toLocaleString('vi-VN')} - ${b.toLocaleString('vi-VN')}.`
        : `Tính ${24 + (i % 9)} × ${3 + (i % 6)}.`;
    const correct = i % 3 === 0 ? a + b : i % 3 === 1 ? a : (24 + (i % 9)) * (3 + (i % 6));
    return generatedQuestion({ lessonId, index, difficulty, prompt, correct: viNumber(correct), wrongs: [viNumber(correct + 10), viNumber(Math.max(0, correct - 10)), viNumber(correct + 100)], explanation: `Thực hiện phép tính theo đúng thứ tự, ta được ${viNumber(correct)}.`, visualType: 'numbers' });
  }
  if (difficulty === 'MEDIUM') {
    const first = 450 + i * 12;
    const added = 125 + i * 7;
    const used = 180 + i * 5;
    const correct = first + added - used;
    const prompt = `Kho có ${viNumber(first)} hộp, nhập thêm ${viNumber(added)} hộp rồi chuyển đi ${viNumber(used)} hộp. Kho còn bao nhiêu hộp?`;
    return generatedQuestion({ lessonId, index, difficulty, prompt, correct: viNumber(correct), wrongs: [viNumber(first + added + used), viNumber(first - added + used), viNumber(correct + used)], explanation: `Số hộp còn lại là ${viNumber(first)} + ${viNumber(added)} - ${viNumber(used)} = ${viNumber(correct)} hộp.`, visualType: 'numbers' });
  }
  const packs = 18 + (i % 7);
  const each = 24 + (i % 5);
  const give = 135 + i;
  const correct = packs * each - give;
  const prompt = `Có ${packs} thùng, mỗi thùng ${each} quyển vở. Sau khi tặng ${give} quyển, còn lại bao nhiêu quyển?`;
  return generatedQuestion({ lessonId, index, difficulty, prompt, correct: viNumber(correct), wrongs: [viNumber(packs + each - give), viNumber(packs * each + give), viNumber(correct + each)], explanation: `Ban đầu có ${packs} × ${each} = ${packs * each} quyển. Còn lại ${packs * each} - ${give} = ${correct} quyển.`, visualType: 'numbers' });
}

function fractionQuestion(lessonId, index, difficulty, offset = 0) {
  const i = index + offset * 17;
  const d = 8 + (i % 5) * 2;
  const a = 1 + (i % 3);
  const b = 2 + (i % 4);
  if (difficulty === 'EASY') {
    const correct = fraction(a + b, d);
    const prompt = `Tính ${a}/${d} + ${b}/${d} rồi rút gọn nếu có thể.`;
    return generatedQuestion({ lessonId, index, difficulty, prompt, correct, wrongs: [fraction(a + b, d * 2), fraction(Math.abs(a - b) || 1, d), `${a + b}/${d + d}`], explanation: `Hai phân số cùng mẫu nên cộng tử số: (${a} + ${b})/${d} = ${correct}.`, visualType: 'fraction' });
  }
  if (difficulty === 'MEDIUM') {
    const d1 = 3 + (i % 4);
    const d2 = d1 + 1;
    const numerator = d1 + d2;
    const denominator = d1 * d2;
    const correct = fraction(numerator, denominator);
    const prompt = `Tính 1/${d1} + 1/${d2}.`;
    return generatedQuestion({ lessonId, index, difficulty, prompt, correct, wrongs: [`2/${d1 + d2}`, fraction(1, denominator), fraction(2, denominator)], explanation: `Quy đồng mẫu số: 1/${d1} = ${d2}/${denominator}, 1/${d2} = ${d1}/${denominator}. Tổng là ${correct}.`, visualType: 'fraction' });
  }
  const total = 120 + (i % 5) * 30;
  const firstPart = 2;
  const denominator = 5;
  const used = total * firstPart / denominator;
  const remaining = total - used;
  const second = remaining / 3;
  const correct = remaining - second;
  const prompt = `Kho có ${total} kg gạo. Buổi sáng bán 2/5 số gạo, buổi chiều bán 1/3 số còn lại. Kho còn bao nhiêu ki-lô-gam gạo?`;
  return generatedQuestion({ lessonId, index, difficulty, prompt, correct: `${correct} kg`, wrongs: [`${remaining} kg`, `${total - used - total / 3} kg`, `${used + second} kg`], explanation: `Buổi sáng bán ${used} kg, còn ${remaining} kg. Buổi chiều bán ${second} kg nên còn ${correct} kg.`, visualType: 'fraction' });
}

function decimalQuestion(lessonId, index, difficulty, offset = 0) {
  const i = index + offset * 13;
  if (difficulty === 'EASY') {
    const a10 = 125 + i * 3;
    const b10 = 24 + i;
    const sum10 = a10 + b10;
    const prompt = `Tính ${viNumber(a10 / 10, 1)} + ${viNumber(b10 / 10, 1)}.`;
    return generatedQuestion({ lessonId, index, difficulty, prompt, correct: viNumber(sum10 / 10, 1), wrongs: [viNumber((sum10 + 10) / 10, 1), viNumber(Math.abs(a10 - b10) / 10, 1), viNumber(sum10, 0)], explanation: `Đặt thẳng hàng dấu phẩy và cộng, ta được ${viNumber(sum10 / 10, 1)}.`, visualType: 'numbers' });
  }
  if (difficulty === 'MEDIUM') {
    const price = 12.5 + (i % 7);
    const count = 3 + (i % 4);
    const correct = price * count;
    const prompt = `${count} kg trái cây, mỗi ki-lô-gam giá ${viNumber(price, 1)} nghìn đồng. Cần trả bao nhiêu nghìn đồng?`;
    return generatedQuestion({ lessonId, index, difficulty, prompt, correct: viNumber(correct, 1), wrongs: [viNumber(price + count, 1), viNumber(correct + price, 1), viNumber(correct / 10, 2)], explanation: `Số tiền là ${viNumber(price, 1)} × ${count} = ${viNumber(correct, 1)} nghìn đồng.`, visualType: 'numbers' });
  }
  const length = 18.5 + (i % 5);
  const first = 6.75;
  const second = 4.5;
  const correct = length - first - second;
  const prompt = `Cuộn dây dài ${viNumber(length, 2)} m. Cắt lần lượt ${viNumber(first, 2)} m và ${viNumber(second, 1)} m. Còn lại bao nhiêu mét?`;
  return generatedQuestion({ lessonId, index, difficulty, prompt, correct: `${viNumber(correct, 2)} m`, wrongs: [`${viNumber(length - first + second, 2)} m`, `${viNumber(length + first - second, 2)} m`, `${viNumber(first + second, 2)} m`], explanation: `Độ dài còn lại là ${viNumber(length, 2)} - ${viNumber(first, 2)} - ${viNumber(second, 1)} = ${viNumber(correct, 2)} m.`, visualType: 'measurement' });
}

function percentQuestion(lessonId, index, difficulty, offset = 0) {
  const i = index + offset * 11;
  const percent = [10, 20, 25, 30, 40][i % 5];
  const total = 200 + (i % 6) * 40;
  if (difficulty === 'EASY') {
    const correct = total * percent / 100;
    const prompt = `Tính ${percent}% của ${total}.`;
    return generatedQuestion({ lessonId, index, difficulty, prompt, correct: viNumber(correct), wrongs: [viNumber(total - correct), viNumber(total + correct), viNumber(total / percent)], explanation: `${percent}% của ${total} là ${total} × ${percent} : 100 = ${correct}.`, visualType: 'chart' });
  }
  if (difficulty === 'MEDIUM') {
    const original = 300 + (i % 5) * 100;
    const discount = [10, 15, 20][i % 3];
    const correct = original * (100 - discount) / 100;
    const prompt = `Một món hàng giá ${viNumber(original)} nghìn đồng, giảm ${discount}%. Giá sau giảm là bao nhiêu nghìn đồng?`;
    return generatedQuestion({ lessonId, index, difficulty, prompt, correct: viNumber(correct), wrongs: [viNumber(original * discount / 100), viNumber(original + original * discount / 100), viNumber(original - discount)], explanation: `Tiền giảm là ${original} × ${discount}% = ${original * discount / 100}. Giá sau giảm là ${correct} nghìn đồng.`, visualType: 'chart' });
  }
  const original = 500 + (i % 4) * 100;
  const increase = 20;
  const decrease = 10;
  const afterIncrease = original * 1.2;
  const correct = afterIncrease * 0.9;
  const prompt = `Giá một sản phẩm là ${original} nghìn đồng. Giá tăng ${increase}% rồi giảm ${decrease}% trên giá mới. Giá cuối cùng là bao nhiêu nghìn đồng?`;
  return generatedQuestion({ lessonId, index, difficulty, prompt, correct: viNumber(correct), wrongs: [viNumber(original * 1.1), viNumber(original * 0.9), viNumber(original)], explanation: `Sau khi tăng: ${original} × 120% = ${afterIncrease}. Sau khi giảm: ${afterIncrease} × 90% = ${correct} nghìn đồng.`, visualType: 'chart' });
}

function geometryQuestion(lessonId, index, difficulty, offset = 0) {
  const i = index + offset * 7;
  const length = 10 + (i % 8);
  const width = 5 + (i % 5);
  if (difficulty === 'EASY') {
    const correct = length * width;
    const prompt = `Hình chữ nhật dài ${length} cm, rộng ${width} cm. Diện tích hình chữ nhật là bao nhiêu?`;
    return generatedQuestion({ lessonId, index, difficulty, prompt, correct: `${correct} cm²`, wrongs: [`${2 * (length + width)} cm²`, `${length + width} cm²`, `${length * 2 + width} cm²`], explanation: `Diện tích là ${length} × ${width} = ${correct} cm².`, visualType: 'geometry' });
  }
  if (difficulty === 'MEDIUM') {
    const border = 1;
    const outer = length * width;
    const inner = (length - 2 * border) * (width - 2 * border);
    const correct = outer - inner;
    const prompt = `Tấm bìa hình chữ nhật ${length} cm × ${width} cm có viền rộng ${border} cm ở phía trong. Diện tích phần viền là bao nhiêu?`;
    return generatedQuestion({ lessonId, index, difficulty, prompt, correct: `${correct} cm²`, wrongs: [`${inner} cm²`, `${outer} cm²`, `${2 * (length + width)} cm²`], explanation: `Diện tích ngoài ${outer} cm², phần trong ${(length - 2)} × ${(width - 2)} = ${inner} cm². Phần viền là ${correct} cm².`, visualType: 'geometry' });
  }
  const side = 12 + (i % 4);
  const height = 8 + (i % 3);
  const volume = side * side * height;
  const correct = volume - side * side * 2;
  const prompt = `Bể hộp chữ nhật đáy vuông cạnh ${side} dm, cao ${height} dm đang có nước cao ${height - 2} dm. Thể tích nước là bao nhiêu đề-xi-mét khối?`;
  return generatedQuestion({ lessonId, index, difficulty, prompt, correct: `${correct} dm³`, wrongs: [`${volume} dm³`, `${side * (height - 2)} dm³`, `${2 * side * (height - 2)} dm³`], explanation: `Chiều cao nước là ${height - 2} dm. Thể tích nước: ${side} × ${side} × ${height - 2} = ${correct} dm³.`, visualType: 'geometry' });
}

function measurementQuestion(lessonId, index, difficulty, offset = 0) {
  const i = index + offset * 9;
  if (difficulty === 'EASY') {
    const metres = 3 + (i % 8);
    const centimetres = 15 + i;
    const correct = metres * 100 + centimetres;
    const prompt = `Đổi ${metres} m ${centimetres} cm ra xăng-ti-mét.`;
    return generatedQuestion({ lessonId, index, difficulty, prompt, correct: `${correct} cm`, wrongs: [`${metres * 10 + centimetres} cm`, `${metres * 1000 + centimetres} cm`, `${metres + centimetres} cm`], explanation: `${metres} m = ${metres * 100} cm; cộng ${centimetres} cm được ${correct} cm.`, visualType: 'measurement' });
  }
  if (difficulty === 'MEDIUM') {
    const startHour = 7 + (i % 4);
    const startMinute = [10, 20, 35, 45][i % 4];
    const duration = 85 + (i % 3) * 15;
    const total = startHour * 60 + startMinute + duration;
    const hour = Math.floor(total / 60);
    const minute = total % 60;
    const correct = `${hour} giờ ${String(minute).padStart(2, '0')} phút`;
    const prompt = `Một hoạt động bắt đầu lúc ${startHour} giờ ${startMinute} phút và kéo dài ${duration} phút. Hoạt động kết thúc lúc nào?`;
    return generatedQuestion({ lessonId, index, difficulty, prompt, correct, wrongs: [`${startHour + 1} giờ ${startMinute} phút`, `${hour} giờ ${String((minute + 10) % 60).padStart(2, '0')} phút`, `${startHour} giờ ${duration} phút`], explanation: `Đổi và cộng thời gian: ${startHour * 60 + startMinute} + ${duration} = ${total} phút, tức ${correct}.`, visualType: 'clock' });
  }
  const massKg = 2350 + i * 10;
  const bags = 8;
  const each = 125;
  const remain = massKg - bags * each;
  const prompt = `Kho có ${massKg} kg hàng. Chuyển đi ${bags} bao, mỗi bao ${each} kg. Khối lượng còn lại bằng bao nhiêu tấn?`;
  return generatedQuestion({ lessonId, index, difficulty, prompt, correct: `${viNumber(remain / 1000, 2)} tấn`, wrongs: [`${viNumber(massKg / 1000, 2)} tấn`, `${viNumber((massKg - bags - each) / 1000, 3)} tấn`, `${viNumber(remain / 100, 1)} tấn`], explanation: `Đã chuyển ${bags} × ${each} = ${bags * each} kg. Còn ${remain} kg = ${viNumber(remain / 1000, 2)} tấn.`, visualType: 'measurement' });
}

function statisticsQuestion(lessonId, index, difficulty, offset = 0) {
  const i = index + offset * 5;
  const values = [6 + (i % 4), 8 + (i % 3), 10 + (i % 5), 12 + (i % 2)];
  if (difficulty === 'EASY') {
    const correct = Math.max(...values);
    const prompt = `Bốn đội ghi được lần lượt ${values.join(', ')} điểm. Số điểm cao nhất là bao nhiêu?`;
    return generatedQuestion({ lessonId, index, difficulty, prompt, correct: viNumber(correct), wrongs: [viNumber(Math.min(...values)), viNumber(values.reduce((a, b) => a + b, 0)), viNumber(correct - 1)], explanation: `So sánh bốn số liệu, giá trị lớn nhất là ${correct}.`, visualType: 'chart' });
  }
  if (difficulty === 'MEDIUM') {
    const dataset = [8 + i % 3, 10 + i % 3, 12 + i % 3, 14 + i % 3];
    const correct = dataset.reduce((a, b) => a + b, 0) / dataset.length;
    const prompt = `Số sản phẩm trong bốn ngày là ${dataset.join(', ')}. Trung bình mỗi ngày có bao nhiêu sản phẩm?`;
    return generatedQuestion({ lessonId, index, difficulty, prompt, correct: viNumber(correct), wrongs: [viNumber(dataset.reduce((a, b) => a + b, 0)), viNumber(Math.max(...dataset)), viNumber(Math.min(...dataset))], explanation: `Tổng là ${dataset.reduce((a, b) => a + b, 0)}; chia 4 được ${correct}.`, visualType: 'chart' });
  }
  const red = 3 + (i % 3);
  const blue = 4 + (i % 4);
  const yellow = 5;
  const total = red + blue + yellow;
  const correct = fraction(red + blue, total);
  const prompt = `Hộp có ${red} bi đỏ, ${blue} bi xanh và ${yellow} bi vàng. Xác suất lấy được bi không màu vàng là bao nhiêu?`;
  return generatedQuestion({ lessonId, index, difficulty, prompt, correct, wrongs: [fraction(yellow, total), fraction(red, total), fraction(blue, total)], explanation: `Có ${red + blue} viên không màu vàng trên tổng ${total} viên, nên xác suất là ${correct}.`, visualType: 'chart' });
}

const TOPIC_BY_LESSON = Object.freeze({
  381: 'natural',
  382: 'fraction',
  383: 'decimal',
  384: 'percent',
  385: 'geometry',
  386: 'measurement',
  387: 'statistics'
});

const TOPIC_FACTORIES = Object.freeze({
  natural: naturalQuestion,
  fraction: fractionQuestion,
  decimal: decimalQuestion,
  percent: percentQuestion,
  geometry: geometryQuestion,
  measurement: measurementQuestion,
  statistics: statisticsQuestion
});

function buildGrade5ReviewQuestions(lessonId, count = 17) {
  const topics = Object.keys(TOPIC_FACTORIES);
  return Array.from({ length: count }, (_, index) => {
    const difficulty = DIFFICULTY_PATTERN_17[index] || 'HARD';
    const fixedTopic = TOPIC_BY_LESSON[lessonId];
    const topic = fixedTopic || topics[(index + lessonId) % topics.length];
    return TOPIC_FACTORIES[topic](lessonId, index, difficulty, lessonId - 380);
  });
}

module.exports = {
  DIFFICULTY_PATTERN_17,
  buildGrade5ReviewQuestions,
  compositeQuestion,
  inferVisualType,
  manualQuestion,
  rotateOptions,
  stripChoicePrefix
};
