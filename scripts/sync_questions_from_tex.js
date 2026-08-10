// Script sync questions from tex h? tr? nh?p, xu?t, ki?m tra ho?c b?o tr? d? li?u v? c?u h?nh c?a d? ?n.
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

// H?m parseJson d?ng ?? ph?n t?ch ??u v?o th?nh c?u tr?c c? th? s? d?ng; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function parseJson(value, fallback) {
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (value === null || value === undefined) return fallback;
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (typeof value !== 'string') return value;
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

// H?m decode d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
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

// H?m giongNhau d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function giongNhau(rowChoices, texChoices, rowCorrect, texCorrect) {
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (rowCorrect !== texCorrect) return false;
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (rowChoices.length !== texChoices.length) return false;
  return rowChoices.every(
    (choice, index) => choice.key === texChoices[index].key
      && String(choice.text) === String(texChoices[index].text)
  );
}

// H?m main d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function main() {
  let tongLech = 0;
  let tongSua = 0;
  let tongKhongKhop = 0;

  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const [grade, fileName] of Object.entries(FILES)) {
    const filePath = path.join(DATA_DIR, fileName);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
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
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (!theoDeBai.has(text)) theoDeBai.set(text, []);
      theoDeBai.get(text).push(row);
    });

    let lech = 0;
    let sua = 0;
    let khongKhop = 0;

    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
    for (const line of lines) {
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (!line.startsWith('% DBJSON ')) continue;

      let payload;
      // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
      try {
        payload = decode(line.slice('% DBJSON '.length).trim());
      } catch (error) {
        continue;
      }
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (payload.question_type !== 'MULTIPLE_CHOICE') continue;

      const ungVien = theoDeBai.get(String(payload.content.text || '')) || [];
      let row = null;

      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (ungVien.length === 1) {
        [row] = ungVien;
      } else if (ungVien.length > 1) {
        const chuKy = chuKyPhuongAn(payload.choices);
        const khop = ungVien.filter(
          (item) => chuKyPhuongAn(parseJson(item.choices, [])) === chuKy
        );
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (khop.length === 1) [row] = khop;
      }

      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (!row) {
        khongKhop += 1;
        continue;
      }

      const rowChoices = parseJson(row.choices, []) || [];
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (giongNhau(rowChoices, payload.choices, row.correct_answer, payload.correct_answer)) continue;

      lech += 1;
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
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
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (COMMIT) console.log(`Đã đồng bộ: ${tongSua}`);
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  else console.log('Đây là bản xem trước. Thêm --commit để ghi vào MySQL.');
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (tongKhongKhop > 0) console.log(`Không khớp được: ${tongKhongKhop} (đề bài trùng và tập phương án cũng trùng)`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Thất bại:', error.message);
    process.exit(1);
  });
