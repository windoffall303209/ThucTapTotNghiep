// Script sync questions from tex hỗ trợ nhập, xuất, kiểm tra hoặc bảo trì dữ liệu và cấu hình của dự án.
/**
 * Đồng bộ phương án và đáp án đúng của MySQL theo đúng file .tex.
 *
 * File .tex là nguồn gốc của ngân hàng câu hỏi. Khi sửa nội dung bằng script,
 * bước cập nhật MySQL có thể bỏ sót nếu tra theo đề bài mà đề bài đó trùng ở
 * nhiều câu (ví dụ các câu "Quan sát hình vẽ..." lặp lại trong cùng khối lớp).
 * Script này quét lại toàn bộ và sửa những chỗ còn lệch.
 *
 * Cách khớp: trước hết theo đề bài; nếu đề bài trùng thì thu hẹp tiếp bằng TẬP
 * nội dung các phương án. Hoán vị chỉ đổi thứ tự chứ không đổi tập nội dung, nên
 * tập này vẫn nhận diện đúng câu cần cập nhật.
 *
 * Dùng:
 *   node scripts/sync_questions_from_tex.js            -> xem trước
 *   node scripts/sync_questions_from_tex.js --commit   -> ghi vào MySQL
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const db = require('../config/db');

const COMMIT = process.argv.includes('--commit');
const DATA_DIR = path.join(__dirname, '..', 'data');

const FILES = {
  1: 'grade1_question_bank_reviewed.tex',
  2: 'grade2_question_bank.tex',
  3: 'grade3_question_bank.tex',
  4: 'grade4_question_bank.tex',
  5: 'grade5_question_bank.tex'
};

// Hàm parseJson dùng để phân tích đầu vào thành cấu trúc có thể sử dụng; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function parseJson(value, fallback) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (value === null || value === undefined) return fallback;
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (typeof value !== 'string') return value;
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

// Hàm decode dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function decode(b64) {
  return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
}

// Chữ ký không phụ thuộc thứ tự, dùng để nhận ra cùng một câu sau khi hoán vị.
function chuKyPhuongAn(choices) {
  return (choices || [])
    .map((choice) => String(choice.text || '').trim())
    .sort()
    .join('||');
}

// Hàm giongNhau dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function giongNhau(rowChoices, texChoices, rowCorrect, texCorrect) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (rowCorrect !== texCorrect) return false;
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (rowChoices.length !== texChoices.length) return false;
  return rowChoices.every(
    (choice, index) => choice.key === texChoices[index].key
      && String(choice.text) === String(texChoices[index].text)
  );
}

// Hàm main dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function main() {
  let tongLech = 0;
  let tongSua = 0;
  let tongKhongKhop = 0;

  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const [grade, fileName] of Object.entries(FILES)) {
    const filePath = path.join(DATA_DIR, fileName);
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!fs.existsSync(filePath)) continue;

    const rows = await db.query(
      `SELECT q.id, q.content, q.choices, q.correct_answer FROM QuestionBank q
       JOIN Lessons l ON l.id = q.lesson_id
       JOIN Chapters ch ON ch.id = l.chapter_id
       WHERE ch.grade = ?`,
      [Number(grade)]
    );

    // Gom theo đề bài vì nhiều câu có thể trùng đề.
    const theoDeBai = new Map();
    rows.forEach((row) => {
      const text = String((parseJson(row.content, {}) || {}).text || '');
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (!theoDeBai.has(text)) theoDeBai.set(text, []);
      theoDeBai.get(text).push(row);
    });

    let lech = 0;
    let sua = 0;
    let khongKhop = 0;

    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
    for (const line of lines) {
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (!line.startsWith('% DBJSON ')) continue;

      let payload;
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      try {
        payload = decode(line.slice('% DBJSON '.length).trim());
      } catch (error) {
        continue;
      }
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (payload.question_type !== 'MULTIPLE_CHOICE') continue;

      const ungVien = theoDeBai.get(String(payload.content.text || '')) || [];
      let row = null;

      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (ungVien.length === 1) {
        [row] = ungVien;
      } else if (ungVien.length > 1) {
        const chuKy = chuKyPhuongAn(payload.choices);
        const khop = ungVien.filter(
          (item) => chuKyPhuongAn(parseJson(item.choices, [])) === chuKy
        );
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (khop.length === 1) [row] = khop;
      }

      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (!row) {
        khongKhop += 1;
        continue;
      }

      const rowChoices = parseJson(row.choices, []) || [];
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (giongNhau(rowChoices, payload.choices, row.correct_answer, payload.correct_answer)) continue;

      lech += 1;
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (COMMIT) {
        await db.query(
          'UPDATE QuestionBank SET choices = CAST(? AS JSON), correct_answer = ? WHERE id = ?',
          [JSON.stringify(payload.choices), payload.correct_answer, row.id]
        );
        sua += 1;
      }
    }

    tongLech += lech;
    tongSua += sua;
    tongKhongKhop += khongKhop;
    console.log(
      `Lớp ${grade}: lệch ${lech}${COMMIT ? `, đã sửa ${sua}` : ''}`
      + (khongKhop > 0 ? `, không khớp được ${khongKhop}` : '')
    );
  }

  console.log(`\nTổng lệch: ${tongLech}`);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (COMMIT) console.log(`Đã đồng bộ: ${tongSua}`);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  else console.log('Đây là bản xem trước. Thêm --commit để ghi vào MySQL.');
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (tongKhongKhop > 0) console.log(`Không khớp được: ${tongKhongKhop} (đề bài trùng và tập phương án cũng trùng)`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Thất bại:', error.message);
    process.exit(1);
  });
