/**
 * Sửa các câu hỏi bị lỗi nội dung trong ngân hàng câu hỏi.
 *
 * Mỗi câu hỏi trong file .tex gồm HAI phần phải khớp nhau:
 *   1. Dòng "% DBJSON <base64>" chứa payload JSON, đây là thứ script import đọc.
 *   2. Khối LaTeX \begin{minipage}...\end{minipage} để người soạn đọc bằng mắt.
 * Sửa tay một bên sẽ làm hai bên lệch nhau: người soạn thấy nội dung mới nhưng
 * import lại nạp nội dung cũ. Script này luôn cập nhật cả hai, và cập nhật thêm
 * bản ghi tương ứng trong MySQL để không phải import lại toàn bộ.
 *
 * Dùng:
 *   node scripts/fix_broken_questions.js            -> chỉ xem trước
 *   node scripts/fix_broken_questions.js --commit   -> ghi vào .tex và MySQL
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const db = require('../config/db');

const COMMIT = process.argv.includes('--commit');
const DATA_DIR = path.join(__dirname, '..', 'data');

/**
 * Danh sách sửa. Mỗi mục nêu rõ lý do để người đọc sau này hiểu vì sao đổi.
 * - choices: chỉ ghi những phương án thay đổi, theo dạng { KEY: 'nội dung mới' }
 * - Các câu CÓ ẢNH chỉ sửa phần chữ, không thay ảnh và không đổi ý câu hỏi.
 */
const FIXES = [
  {
    file: 'grade2_question_bank.tex',
    externalId: 'G2-L031-Q015',
    lyDo: 'Phương án A "Cả A và B đều đúng" tự tham chiếu chính nó. Đồng thời B và '
      + 'C đều đúng về toán (40 : 5 = 8 và 40 : 8 = 5) nên câu có hai đáp án đúng.',
    choices: { A: '40 : 8 = 8', C: '40 : 8 = 6' },
    correctAnswer: 'B',
    explanation: 'Từ 5 × 8 = 40 ta lập được phép chia 40 : 5 = 8. Ba kết quả còn lại đều sai.'
  },
  {
    file: 'grade2_question_bank.tex',
    externalId: 'G2-L031-Q003',
    lyDo: 'Phương án B "Cả A và B đều thích hợp" tự tham chiếu chính nó. Thay bằng '
      + 'một phép chia đúng để chỉ còn duy nhất phương án A là phép chia sai.',
    contentText: 'Từ phép nhân 2 × 7 = 14, phép chia nào cho kết quả SAI?',
    choices: { B: '14 : 14 = 1' },
    correctAnswer: 'A',
    explanation: 'Từ 2 × 7 = 14 ta có 14 : 2 = 7 và 14 : 7 = 2. Phép 14 : 2 = 6 cho kết quả sai.'
  },
  {
    file: 'grade2_question_bank.tex',
    externalId: 'G2-L040-Q041',
    lyDo: 'Phương án B "Cả A, B và C" tự tham chiếu chính nó. Nặng hơn: cả ba số '
      + '303, 123, 222 đều có tổng các chữ số bằng 6 nên học sinh chọn số nào cũng bị chấm sai.',
    choices: { A: '305', B: '410', D: '225' },
    correctAnswer: 'C',
    explanation: '1 + 2 + 3 = 6 nên số 123 có tổng các chữ số bằng 6. '
      + 'Các số còn lại có tổng lần lượt là 8, 5 và 9.'
  },
  {
    file: 'grade3_question_bank.tex',
    externalId: 'G3-L045-Q012',
    lyDo: 'Phương án D bị cắt cụt thành "M trùng với", mất mất đối tượng phía sau '
      + 'nên học sinh không hiểu phương án nói gì.',
    choices: { D: 'M trùng với điểm A' },
    correctAnswer: 'B'
  },
  {
    file: 'grade3_question_bank.tex',
    externalId: 'G3-L045-Q015',
    lyDo: 'Phương án B bị cắt cụt thành "Có, vì C nằm giữa A và", thiếu chữ B ở cuối.',
    choices: { B: 'Có, vì C nằm giữa A và B' },
    correctAnswer: 'A'
  },
  {
    file: 'grade4_question_bank.tex',
    externalId: 'G4-L041-Q012',
    lyDo: 'Phương án B bị cắt cụt thành "Cả A và". Câu này CÓ ẢNH nên chỉ thay chữ '
      + 'của phương án B bằng một đối tượng thật có trong ảnh (ngọn đồi trong bức ảnh '
      + 'phong cảnh) và không đổi ảnh, không đổi đề bài.',
    choices: { B: 'Ngọn đồi xanh trong bức ảnh' },
    correctAnswer: 'A'
  },
  {
    file: 'grade5_question_bank.tex',
    externalId: 'G5-L019-Q012',
    lyDo: 'Phương án C "13" và D "13,0" cùng một giá trị nên cả hai đều đúng, học '
      + 'sinh hiểu đúng bài "Số thập phân bằng nhau" mà chọn D vẫn bị chấm sai. Câu này '
      + 'CÓ ẢNH là bảng làm tròn ba cột, nên thay D bằng kết quả làm tròn đến hàng phần '
      + 'trăm để nhiễu vẫn khớp với ảnh.',
    choices: { D: '12,65' },
    correctAnswer: 'C'
  }
];

function decodePayload(base64) {
  return JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
}

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

// Thay đúng một dòng \item <KEY>. ... trong khối LaTeX của câu hỏi.
function replaceLatexChoice(block, key, newText) {
  const pattern = new RegExp(`(\\\\item ${key}\\. )(.*)`, 'm');
  if (!pattern.test(block)) return { block, ok: false };
  return { block: block.replace(pattern, `$1${newText}`), ok: true };
}

function replaceLatexField(block, label, newValue) {
  const pattern = new RegExp(`(\\\\textbf\\{${label}:\\} )(.*)`, 'm');
  if (!pattern.test(block)) return { block, ok: false };
  return { block: block.replace(pattern, `$1${newValue}`), ok: true };
}

function applyToTex(source, fix) {
  const lines = source.split('\n');
  const canhBao = [];

  const dbjsonIndex = lines.findIndex((line) => {
    if (!line.startsWith('% DBJSON ')) return false;
    try {
      return decodePayload(line.slice('% DBJSON '.length).trim()).external_id === fix.externalId;
    } catch (error) {
      return false;
    }
  });

  if (dbjsonIndex === -1) throw new Error(`Không tìm thấy ${fix.externalId} trong file`);

  const payload = decodePayload(lines[dbjsonIndex].slice('% DBJSON '.length).trim());

  if (fix.contentText) payload.content.text = fix.contentText;
  Object.entries(fix.choices || {}).forEach(([key, text]) => {
    const choice = payload.choices.find((item) => item.key === key);
    if (!choice) throw new Error(`${fix.externalId} không có phương án ${key}`);
    choice.text = text;
  });
  if (fix.correctAnswer) payload.correct_answer = fix.correctAnswer;
  if (fix.explanation) payload.explanation.text = fix.explanation;

  lines[dbjsonIndex] = `% DBJSON ${encodePayload(payload)}`;

  // Khối LaTeX nằm ngay sau dòng DBJSON, kết thúc ở \end{minipage}
  const endIndex = lines.findIndex((line, index) => index > dbjsonIndex && line.includes('\\end{minipage}'));
  if (endIndex === -1) throw new Error(`${fix.externalId}: không tìm thấy \\end{minipage}`);

  let block = lines.slice(dbjsonIndex + 1, endIndex + 1).join('\n');

  Object.entries(fix.choices || {}).forEach(([key, text]) => {
    const result = replaceLatexChoice(block, key, text);
    if (!result.ok) canhBao.push(`${fix.externalId}: không thấy \\item ${key} trong khối LaTeX`);
    block = result.block;
  });

  if (fix.contentText) {
    const pattern = new RegExp(`(\\\\noindent\\\\textbf\\{${fix.externalId} \\([A-Z]+\\):\\} )(.*)`, 'm');
    if (pattern.test(block)) block = block.replace(pattern, `$1${fix.contentText}`);
    else canhBao.push(`${fix.externalId}: không thấy dòng đề bài trong khối LaTeX`);
  }
  if (fix.correctAnswer) {
    const result = replaceLatexField(block, 'Đáp án đúng', `${fix.correctAnswer}\\\\`);
    if (!result.ok) canhBao.push(`${fix.externalId}: không thấy nhãn Đáp án đúng`);
    block = result.block;
  }
  if (fix.explanation) {
    const result = replaceLatexField(block, 'Lời giải', fix.explanation);
    if (!result.ok) canhBao.push(`${fix.externalId}: không thấy nhãn Lời giải`);
    block = result.block;
  }

  lines.splice(dbjsonIndex + 1, endIndex - dbjsonIndex, ...block.split('\n'));

  return { source: lines.join('\n'), payload, canhBao };
}

async function applyToDatabase(payload) {
  const rows = await db.query(
    `SELECT q.id, q.content, q.choices FROM QuestionBank q
     JOIN Lessons l ON l.id = q.lesson_id
     JOIN Chapters ch ON ch.id = l.chapter_id
     WHERE ch.grade = ? AND JSON_UNQUOTE(JSON_EXTRACT(q.content, '$.text')) = ?`,
    [payload.grade, payload.content.text]
  );

  // Sau khi đã ghi .tex, đề bài mới có thể chưa tồn tại trong DB (trường hợp đổi
  // đề). Khi đó tra theo đề cũ do caller truyền vào.
  return rows;
}

async function main() {
  console.log(COMMIT ? 'Chế độ GHI THẬT\n' : 'Chế độ xem trước (thêm --commit để ghi)\n');

  const theoFile = new Map();
  FIXES.forEach((fix) => {
    if (!theoFile.has(fix.file)) theoFile.set(fix.file, []);
    theoFile.get(fix.file).push(fix);
  });

  let tongCanhBao = 0;

  for (const [file, fixes] of theoFile) {
    const filePath = path.join(DATA_DIR, file);
    let source = fs.readFileSync(filePath, 'utf8');

    for (const fix of fixes) {
      const truoc = decodePayload(
        source.split('\n')
          .find((line) => line.startsWith('% DBJSON ')
            && decodePayload(line.slice(9).trim()).external_id === fix.externalId)
          .slice(9).trim()
      );

      const result = applyToTex(source, fix);
      source = result.source;
      result.canhBao.forEach((item) => {
        console.log(`  CẢNH BÁO ${item}`);
        tongCanhBao += 1;
      });

      console.log(`${fix.externalId} (lớp ${truoc.grade})`);
      console.log(`  Lý do: ${fix.lyDo}`);
      if (fix.contentText) console.log(`  Đề bài: "${truoc.content.text}" -> "${fix.contentText}"`);
      Object.entries(fix.choices || {}).forEach(([key, text]) => {
        const cu = truoc.choices.find((item) => item.key === key);
        console.log(`  Phương án ${key}: "${cu.text}" -> "${text}"`);
      });
      if (fix.correctAnswer && fix.correctAnswer !== truoc.correct_answer) {
        console.log(`  Đáp án đúng: ${truoc.correct_answer} -> ${fix.correctAnswer}`);
      }
      if (fix.explanation) console.log(`  Lời giải: đã viết lại`);

      if (COMMIT) {
        const rows = await applyToDatabase({ ...result.payload, content: truoc.content });
        if (rows.length !== 1) {
          console.log(`  CẢNH BÁO: tìm thấy ${rows.length} bản ghi khớp trong MySQL, bỏ qua cập nhật DB`);
          tongCanhBao += 1;
        } else {
          await db.query(
            `UPDATE QuestionBank
             SET content = CAST(? AS JSON), choices = CAST(? AS JSON),
                 correct_answer = ?, explanation = CAST(? AS JSON)
             WHERE id = ?`,
            [
              JSON.stringify(result.payload.content),
              JSON.stringify(result.payload.choices),
              result.payload.correct_answer,
              JSON.stringify(result.payload.explanation),
              rows[0].id
            ]
          );
          console.log(`  Đã cập nhật MySQL id ${rows[0].id}`);
        }
      }
      console.log('');
    }

    if (COMMIT) {
      fs.writeFileSync(filePath, source, 'utf8');
      console.log(`Đã ghi ${file}\n`);
    }
  }

  console.log(tongCanhBao === 0 ? 'Không có cảnh báo nào.' : `Có ${tongCanhBao} cảnh báo, hãy kiểm tra lại.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Thất bại:', error.message);
    process.exit(1);
  });
