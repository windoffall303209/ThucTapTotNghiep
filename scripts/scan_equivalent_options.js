// Script scan equivalent options h? tr? nh?p, xu?t, ki?m tra ho?c b?o tr? d? li?u v? c?u h?nh c?a d? ?n.
/**
 * Tìm câu hỏi có hai phương án cùng đúng, quét trên toàn bộ ngân hàng câu hỏi.
 *
 * Dạng lỗi cần tìm được phát hiện khi rà soát lớp 1: bộ phương án chứa đáp án
 * đúng hai lần, một bản trần và một bản kèm đơn vị hoặc kèm cụm danh từ. Ví dụ
 * A "90 quyển vở." được chấm đúng còn B "90" cũng đúng y hệt; hoặc C "Chiếc thang
 * màu xanh dương." và D "Màu xanh dương".
 *
 * Bộ dò phải rất chặt. Lần thử đầu chỉ so số đứng đầu chuỗi đã bắt nhầm 2505 cặp,
 * trong đó có "1 - 3 = 4" với "1 + 3 = 3" (chung số 1 nhưng khác hẳn nhau) và
 * "37,5 dm³" với "375 dm³". Lần thử theo kiểu chuỗi này chứa chuỗi kia thì bắt
 * nhầm "Bằng nhau" với "Không bằng nhau" là hai phương án ngược nghĩa.
 *
 * Hai luật dùng thật:
 *
 *   SO_TRUNG   Cả hai phương án đều có dạng số rồi tới phần chữ. Phần số phải
 *              bằng nhau đúng từng chữ số, và phần chữ của một bên phải rỗng còn
 *              bên kia là cụm danh từ thuần chữ. Nhờ vậy "90" khớp "90 quyển vở"
 *              nhưng "12 cm" không khớp "12 dm", và "5/7" không khớp "5/14".
 *
 *   CAU_BAO    Phương án dài kết thúc bằng đúng phương án ngắn, cắt theo ranh giới
 *              từ. Phần dôi ra ở đầu phải là cụm danh từ, không được chứa từ phủ
 *              định hay từ so sánh, vì "Không bằng nhau" cũng kết thúc bằng "bằng
 *              nhau" mà nghĩa thì ngược lại.
 *
 * Dùng: node scripts/scan_equivalent_options.js
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const db = require('../config/db');

const ROOT = path.join(__dirname, '..');
const KET_QUA = path.join(ROOT, 'tmp', 'quet_phuong_an_tuong_duong.json');

// Từ làm đổi nghĩa. Nếu phần dôi ra chứa một trong các từ này thì hai phương án
// không còn là một, dù chuỗi có bao nhau.
const TU_DOI_NGHIA = /\b(không|chưa|chẳng|hơn|kém|bằng|ít|nhiều|lớn|bé|nhỏ|cao|thấp|dài|ngắn|nặng|nhẹ|sai|đúng|gấp|thêm|bớt|còn|tất|cả)\b/u;

// H?m chuanHoa d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function chuanHoa(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[.;,!?]+$/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tách "90 quyển vở" thành phần số "90" và phần chữ "quyển vở". */
function tachSoVaChu(s) {
  const m = s.match(/^([0-9][0-9 .,]*?)\s*([^0-9]*)$/u);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!m) return null;
  const so = m[1].replace(/[ .,]/g, '');
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!/^[0-9]+$/.test(so)) return null;
  const chu = m[2].trim();
  // Phần chữ phải là chữ thuần, không chứa dấu phép tính hay ký hiệu.
  if (chu && !/^[a-zà-ỹ\s]+$/u.test(chu)) return null;
  return { so, chu };
}

// H?m soTrung d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function soTrung(a, b) {
  const ta = tachSoVaChu(a);
  const tb = tachSoVaChu(b);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!ta || !tb) return false;
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (ta.so !== tb.so) return false;
  // Một bên có đơn vị, bên kia không. Hai bên cùng có đơn vị mà khác nhau thì là
  // hai đại lượng khác nhau, ví dụ "12 cm" và "12 dm".
  return (ta.chu === '' && tb.chu !== '') || (tb.chu === '' && ta.chu !== '');
}

// H?m cauBao d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function cauBao(a, b) {
  const [ngan, dai] = a.length <= b.length ? [a, b] : [b, a];
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (ngan.length < 5) return false;
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!dai.endsWith(ngan)) return false;
  const doiRa = dai.slice(0, dai.length - ngan.length).trim();
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!doiRa) return false;
  // Phải cắt đúng ranh giới từ, tránh "ba" khớp đuôi của "cái ba".
  if (!/\s$/.test(dai.slice(0, dai.length - ngan.length))) return false;
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (TU_DOI_NGHIA.test(doiRa)) return false;
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (/[0-9]/.test(doiRa)) return false;
  return true;
}

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

// H?m main d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function main() {
  const rows = await db.query(
    `SELECT q.id, ch.grade, l.lesson_name, q.content, q.choices, q.correct_answer
     FROM QuestionBank q
     JOIN Lessons l ON l.id = q.lesson_id
     JOIN Chapters ch ON ch.id = l.chapter_id
     ORDER BY q.id`
  );

  const ketQua = [];

  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const row of rows) {
    const choices = parseJson(row.choices, []) || [];
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!Array.isArray(choices) || choices.length < 2) continue;
    const content = parseJson(row.content, {}) || {};

    // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
    for (let i = 0; i < choices.length; i += 1) {
      // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
      for (let j = i + 1; j < choices.length; j += 1) {
        const a = chuanHoa(choices[i].text);
        const b = chuanHoa(choices[j].text);
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (!a || !b || a === b) {
          // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
          if (a && b && a === b) {
            ketQua.push({
              id: row.id, grade: row.grade, luat: 'TRUNG_HET', bai_hoc: row.lesson_name,
              de_bai: String(content.text || ''), cap: [`${choices[i].key}. ${choices[i].text}`, `${choices[j].key}. ${choices[j].text}`],
              dap_an: row.correct_answer,
              dinh_dap_an: choices[i].key === row.correct_answer || choices[j].key === row.correct_answer
            });
          }
          continue;
        }

        let luat = null;
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (soTrung(a, b)) luat = 'SO_TRUNG';
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        else if (cauBao(a, b)) luat = 'CAU_BAO';
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (!luat) continue;

        ketQua.push({
          id: row.id, grade: row.grade, luat, bai_hoc: row.lesson_name,
          de_bai: String(content.text || ''),
          cap: [`${choices[i].key}. ${choices[i].text}`, `${choices[j].key}. ${choices[j].text}`],
          dap_an: row.correct_answer,
          dinh_dap_an: choices[i].key === row.correct_answer || choices[j].key === row.correct_answer
        });
      }
    }
  }

  const theoLuat = {};
  const theoLop = {};
  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const k of ketQua) {
    theoLuat[k.luat] = (theoLuat[k.luat] || 0) + 1;
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (k.dinh_dap_an) theoLop[k.grade] = (theoLop[k.grade] || 0) + 1;
  }

  console.log(`Đã quét ${rows.length} câu hỏi.\n`);
  console.log(`Cặp phương án nghi trùng nghĩa: ${ketQua.length}`);
  Object.entries(theoLuat).forEach(([l, n]) => console.log(`  ${l}: ${n}`));

  const nghiemTrong = ketQua.filter((k) => k.dinh_dap_an);
  console.log(`\nTrong đó có dính đáp án đúng (học sinh chọn đúng vẫn bị chấm sai): ${nghiemTrong.length}`);
  console.log(`  theo lớp: ${JSON.stringify(theoLop)}`);

  nghiemTrong.slice(0, 30).forEach((k) => {
    console.log(`\n  lớp ${k.grade} id ${k.id} [${k.luat}] ${k.de_bai.slice(0, 62)}`);
    console.log(`    ${k.cap[0]}   ||   ${k.cap[1]}     -> chấm ${k.dap_an}`);
  });
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (nghiemTrong.length > 30) console.log(`\n  ... còn ${nghiemTrong.length - 30} cặp nữa, xem trong tệp báo cáo.`);

  fs.writeFileSync(KET_QUA, JSON.stringify(ketQua, null, 1), 'utf8');
  console.log(`\nBáo cáo: ${path.relative(ROOT, KET_QUA)}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Thất bại:', error.message);
    process.exit(1);
  });
