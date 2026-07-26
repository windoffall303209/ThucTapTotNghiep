/**
 * Kiểm tra sức khoẻ toàn bộ ngân hàng câu hỏi, chạy được nhiều lần.
 *
 * Mục đích: sau mỗi đợt sửa thì có một chỗ duy nhất để biết còn lỗi gì, thay vì
 * phải nhớ từng script rời rạc. Script chỉ ĐỌC, không sửa gì.
 *
 * Các phép kiểm tra, xếp theo mức độ ảnh hưởng tới học sinh:
 *
 *   1. Đáp án đúng không nằm trong bộ phương án. Câu này chấm sai 100% số lần.
 *   2. Đề bài nhắc tới tranh, hình mà câu không còn ảnh nào. Học sinh không có
 *      dữ kiện để trả lời.
 *   3. Câu có ít hơn 4 phương án. Không sai nhưng lệch chuẩn trắc nghiệm và làm
 *      xác suất đoán mò tăng lên.
 *   4. Lời giải rỗng, hoặc chỉ chép lại đáp án theo mẫu "Dựa vào dữ kiện của câu
 *      hỏi, đáp án đúng là X" mà không nêu được lý do.
 *   5. Phân bố nhãn đáp án đúng. Nếu dồn vào một nhãn thì học sinh đoán bừa cũng
 *      được điểm cao.
 *
 * Dùng: node scripts/health_check_question_bank.js
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const db = require('../config/db');

const ROOT = path.join(__dirname, '..');
const KET_QUA = path.join(ROOT, 'tmp', 'suc_khoe_ngan_hang.json');

// Mẫu lời giải vô nghĩa do đợt sinh dữ liệu đầu tiên để lại.
const LOI_GIAI_RONG_TUECH = /^Dựa vào dữ kiện của câu hỏi, đáp án đúng là/i;
const NHAC_TOI_ANH = /(quan sát|nhìn vào|dựa vào|theo)\s+(tranh|hình|ảnh|bảng|biểu đồ)|trong (tranh|hình|ảnh)|ở (tranh|hình) (trên|dưới|bên)/iu;

function parseJson(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function bang(tieuDe, theoLop, tong) {
  const cot = [1, 2, 3, 4, 5].map((g) => String(theoLop[g] || 0).padStart(5));
  console.log(`  ${tieuDe.padEnd(46)}${cot.join('')}${String(tong).padStart(7)}`);
}

async function main() {
  const rows = await db.query(
    `SELECT q.id, ch.grade, l.lesson_name, q.content, q.choices, q.correct_answer, q.explanation
     FROM QuestionBank q
     JOIN Lessons l ON l.id = q.lesson_id
     JOIN Chapters ch ON ch.id = l.chapter_id
     ORDER BY q.id`
  );

  const loi = {
    dapAnKhongCo: [],
    nhacAnhMaKhongCoAnh: [],
    thieuPhuongAn: [],
    loiGiaiRong: [],
    loiGiaiChepDapAn: []
  };
  const tongTheoLop = {};
  const nhanTheoLop = {};

  for (const row of rows) {
    const g = row.grade;
    tongTheoLop[g] = (tongTheoLop[g] || 0) + 1;

    const content = parseJson(row.content, {}) || {};
    const choices = parseJson(row.choices, []) || [];
    const explanation = parseJson(row.explanation, {}) || {};
    const de = String(content.text || '');
    const soAnh = (content.images || []).filter((im) => im && im.url).length;
    const giai = String(explanation.text || '').trim();

    const chung = { id: row.id, grade: g, bai_hoc: row.lesson_name, de_bai: de };

    if (!choices.some((c) => c.key === row.correct_answer)) {
      loi.dapAnKhongCo.push({ ...chung, dap_an: row.correct_answer, phuong_an: choices.map((c) => c.key) });
    }
    if (soAnh === 0 && NHAC_TOI_ANH.test(de)) {
      loi.nhacAnhMaKhongCoAnh.push(chung);
    }
    if (choices.length < 4) {
      loi.thieuPhuongAn.push({ ...chung, so_phuong_an: choices.length });
    }
    if (!giai) {
      loi.loiGiaiRong.push(chung);
    } else if (LOI_GIAI_RONG_TUECH.test(giai)) {
      loi.loiGiaiChepDapAn.push({ ...chung, loi_giai: giai });
    }

    if (!nhanTheoLop[g]) nhanTheoLop[g] = {};
    nhanTheoLop[g][row.correct_answer] = (nhanTheoLop[g][row.correct_answer] || 0) + 1;
  }

  const tong = rows.length;
  console.log(`Đã kiểm tra ${tong} câu hỏi.\n`);
  console.log(`  ${'Lỗi'.padEnd(46)}${['lớp 1', 'lớp 2', 'lớp 3', 'lớp 4', 'lớp 5'].map((s) => s.padStart(5)).join('')}${'tổng'.padStart(7)}`);
  console.log(`  ${'-'.repeat(78)}`);

  const nhan = {
    dapAnKhongCo: '1. Đáp án đúng không có trong phương án',
    nhacAnhMaKhongCoAnh: '2. Đề nhắc tới tranh/hình nhưng không có ảnh',
    thieuPhuongAn: '3. Có ít hơn 4 phương án',
    loiGiaiRong: '4. Lời giải để trống',
    loiGiaiChepDapAn: '5. Lời giải chỉ chép lại đáp án'
  };
  for (const [khoa, ten] of Object.entries(nhan)) {
    const theoLop = {};
    loi[khoa].forEach((x) => { theoLop[x.grade] = (theoLop[x.grade] || 0) + 1; });
    bang(ten, theoLop, loi[khoa].length);
  }

  console.log('\nPhân bố nhãn đáp án đúng (tỉ lệ phần trăm trong khối):');
  for (const g of [1, 2, 3, 4, 5]) {
    const d = nhanTheoLop[g] || {};
    const t = tongTheoLop[g] || 1;
    const phan = ['A', 'B', 'C', 'D']
      .map((k) => `${k} ${((100 * (d[k] || 0)) / t).toFixed(1).padStart(5)}%`)
      .join('   ');
    console.log(`  lớp ${g} (${String(t).padStart(4)} câu):  ${phan}`);
  }

  for (const [khoa, ten] of Object.entries(nhan)) {
    if (!loi[khoa].length) continue;
    console.log(`\n${ten} — ${loi[khoa].length} câu, ví dụ:`);
    loi[khoa].slice(0, 5).forEach((x) => {
      console.log(`  lớp ${x.grade} id ${x.id} [${String(x.bai_hoc).slice(0, 34)}] ${String(x.de_bai).slice(0, 58)}`);
    });
    if (loi[khoa].length > 5) console.log(`  ... còn ${loi[khoa].length - 5} câu, xem trong tệp báo cáo.`);
  }

  fs.writeFileSync(KET_QUA, JSON.stringify(loi, null, 1), 'utf8');
  console.log(`\nBáo cáo: ${path.relative(ROOT, KET_QUA)}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Thất bại:', error.message);
    process.exit(1);
  });
