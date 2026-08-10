// Script resync tex from db h? tr? nh?p, xu?t, ki?m tra ho?c b?o tr? d? li?u v? c?u h?nh c?a d? ?n.
/**
 * Dựng lại các khối câu hỏi trong file .tex theo đúng dữ liệu đang có trong MySQL.
 *
 * VÌ SAO CẦN: file .tex là nguồn để nạp lại ngân hàng câu hỏi, nhưng nó không lưu
 * id của MySQL. Các đợt sửa trước đó dò khối .tex bằng cách so ĐỀ BÀI rồi lấy khối
 * khớp đầu tiên. Cách đó sai khi nhiều câu dùng chung một đề bài: riêng lớp 1 có
 * đề "Phép tính nào phù hợp với tranh?" dùng cho 30 câu khác nhau. Hậu quả là đề
 * bài viết lại của câu này bị ghi đè lên khối của câu khác, làm .tex lệch hẳn so
 * với MySQL. Đo được 32 khối lệch đề và 14 khối lệch đáp án ở lớp 1, 2 khối lệch
 * đáp án ở lớp 4.
 *
 * CÁCH KHỚP: theo VỊ TRÍ. Khối .tex thứ i ứng với câu thứ i khi sắp theo id tăng
 * dần, vì cả hai đều sinh ra từ cùng một lượt nhập. Đã kiểm chứng: 1322/1324 khối
 * lớp 1 và 1191/1200 khối lớp 4 trùng khớp cả bộ phương án, các trường hợp còn lại
 * nằm rời rạc chứ không lệch dồn, nên không có chuyện trượt hàng.
 *
 * Script kiểm tra lại điều kiện đó trước khi ghi và dừng nếu số khối không bằng số
 * câu, để không âm thầm ghi sai.
 *
 * Dùng:
 *   node scripts/resync_tex_from_db.js            -> xem trước
 *   node scripts/resync_tex_from_db.js --commit   -> ghi thật
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const db = require('../config/db');

const COMMIT = process.argv.includes('--commit');
const ROOT = path.join(__dirname, '..');
const BAO_CAO = path.join(ROOT, 'tmp', 'bao_cao_dong_bo_tex.json');

const TEX_THEO_KHOI = {
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

// H?m encode d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function encode(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

/**
 * Phần chữ của khối .tex phải đọc được bằng mắt nên viết lại đúng khuôn cũ:
 * dòng đề, danh sách phương án, đáp án, lời giải, rồi tới dòng ảnh nguồn nếu có.
 */
function dungKhoiLatex(payload, cr) {
  const nhan = `${payload.external_id} (${payload.difficulty || 'EASY'})`;
  const dong = [];
  dong.push(`\\noindent\\textbf{${nhan}:} ${String(payload.content?.text || '').trim()}`);
  dong.push('\\begin{itemize}[label={}]');
  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const c of payload.choices || []) {
    dong.push(`\\item ${c.key}. ${String(c.text || '').trim()}`);
  }
  dong.push('\\end{itemize}');
  dong.push(`\\textbf{Đáp án đúng:} ${payload.correct_answer}\\\\`);
  dong.push(`\\textbf{Lời giải:} ${String(payload.explanation?.text || '').trim()}`);

  // Chỉ ghi lại dòng ảnh khi câu thực sự còn ảnh. Câu đã bị gỡ ảnh thì bỏ hẳn dòng
  // này, nếu không người đọc file .tex tưởng vẫn còn tranh minh họa.
  const anh = (payload.content?.images || []).filter((im) => im && (im.url || im.source_path));
  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const im of anh) {
    const ten = String(im.url || im.source_path).split(/[\\/]/).pop();
    dong.push(`\\\\ \\textit{Ảnh nguồn:} \\texttt{${ten}}`);
  }

  return dong.map((d) => d + cr);
}

// H?m xuLyKhoi d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function xuLyKhoi(grade, thongKe, baoCao) {
  const fileName = TEX_THEO_KHOI[grade];
  const filePath = path.join(ROOT, 'data', fileName);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!fs.existsSync(filePath)) return;

  const rows = await db.query(
    `SELECT q.id, q.question_type, q.difficulty, q.layout_template,
            q.content, q.choices, q.correct_answer, q.explanation
     FROM QuestionBank q
     JOIN Lessons l ON l.id = q.lesson_id
     JOIN Chapters ch ON ch.id = l.chapter_id
     WHERE ch.grade = ? ORDER BY q.id`,
    [grade]
  );

  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  const viTriDbjson = [];
  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (let i = 0; i < lines.length; i += 1) {
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (lines[i].startsWith('% DBJSON ')) viTriDbjson.push(i);
  }

  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (viTriDbjson.length !== rows.length) {
    throw new Error(
      `Lớp ${grade}: .tex có ${viTriDbjson.length} khối nhưng MySQL có ${rows.length} câu. `
      + 'Không khớp theo vị trí được, dừng lại để tránh ghi sai.'
    );
  }

  let doiDe = 0;
  let doiPhuongAn = 0;
  let doiDapAn = 0;
  let doiLoiGiai = 0;
  let doiAnh = 0;

  // Ghi từ dưới lên để việc chèn/xóa dòng không làm lệch các vị trí phía trên.
  for (let k = viTriDbjson.length - 1; k >= 0; k -= 1) {
    const i = viTriDbjson[k];
    const row = rows[k];
    const cu = decode(lines[i].slice('% DBJSON '.length).trim());

    const content = parseJson(row.content, {}) || {};
    const choices = parseJson(row.choices, []) || [];
    const explanation = parseJson(row.explanation, {}) || {};

    const khac = {
      de: String(cu.content?.text || '') !== String(content.text || ''),
      phuongAn: JSON.stringify((cu.choices || []).map((c) => [c.key, c.text]))
        !== JSON.stringify(choices.map((c) => [c.key, c.text])),
      dapAn: String(cu.correct_answer || '') !== String(row.correct_answer || ''),
      loiGiai: String(cu.explanation?.text || '') !== String(explanation.text || ''),
      anh: (cu.content?.images || []).length !== (content.images || []).length
    };

    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (khac.de) doiDe += 1;
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (khac.phuongAn) doiPhuongAn += 1;
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (khac.dapAn) doiDapAn += 1;
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (khac.loiGiai) doiLoiGiai += 1;
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (khac.anh) doiAnh += 1;

    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (khac.de || khac.phuongAn || khac.dapAn || khac.anh) {
      baoCao.push({
        grade,
        db_id: row.id,
        external_id: cu.external_id,
        de_trong_tex: String(cu.content?.text || ''),
        de_trong_db: String(content.text || ''),
        dap_an_trong_tex: cu.correct_answer,
        dap_an_trong_db: row.correct_answer,
        khac
      });
    }

    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!COMMIT) continue;

    // Giữ nguyên phần định danh và siêu dữ liệu của .tex, chỉ đồng bộ phần nội dung
    // mà các đợt sửa có thể đã đụng vào.
    const moi = {
      ...cu,
      question_type: row.question_type || cu.question_type,
      difficulty: row.difficulty || cu.difficulty,
      layout_template: row.layout_template || cu.layout_template,
      content,
      choices,
      correct_answer: row.correct_answer,
      explanation
    };
    lines[i] = `% DBJSON ${encode(moi)}`;

    // Thay toàn bộ phần chữ nằm giữa \begin{minipage} và \end{minipage}.
    let dau = i + 1;
    // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
    while (dau < lines.length && !lines[dau].includes('\\begin{minipage}')) dau += 1;
    let cuoi = dau;
    // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
    while (cuoi < lines.length && !lines[cuoi].includes('\\end{minipage}')) cuoi += 1;
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (dau >= lines.length || cuoi >= lines.length) continue;

    const cr = lines[dau].endsWith('\r') ? '\r' : '';
    lines.splice(dau + 1, cuoi - dau - 1, ...dungKhoiLatex(moi, cr));
  }

  thongKe.push({ grade, tong: rows.length, doiDe, doiPhuongAn, doiDapAn, doiLoiGiai, doiAnh });

  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (COMMIT) {
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  }
}

// H?m main d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function main() {
  const thongKe = [];
  const baoCao = [];

  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const grade of [1, 2, 3, 4, 5]) {
    await xuLyKhoi(grade, thongKe, baoCao);
  }

  console.log('Khối lệch giữa .tex và MySQL (đã lấy MySQL làm chuẩn):\n');
  console.log('lớp   tổng   đề   phương án   đáp án   lời giải   ảnh');
  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const t of thongKe) {
    console.log(
      `  ${t.grade}   ${String(t.tong).padStart(4)}   ${String(t.doiDe).padStart(3)}`
      + `   ${String(t.doiPhuongAn).padStart(9)}   ${String(t.doiDapAn).padStart(6)}`
      + `   ${String(t.doiLoiGiai).padStart(8)}   ${String(t.doiAnh).padStart(3)}`
    );
  }

  fs.writeFileSync(BAO_CAO, JSON.stringify(baoCao, null, 1), 'utf8');
  console.log(`\nBáo cáo chi tiết: ${path.relative(ROOT, BAO_CAO)}  (${baoCao.length} khối)`);

  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (COMMIT) {
    console.log('Đã ghi lại các file .tex.');
  } else {
    console.log('Đây là bản xem trước. Thêm --commit để ghi thật.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Thất bại:', error.message);
    process.exit(1);
  });
