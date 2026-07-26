/**
 * Rải đều nhãn đáp án đúng ra bốn vị trí A, B, C, D, chạy thẳng trên MySQL.
 *
 * VÌ SAO VIẾT LẠI THAY VÌ DÙNG rebalance_answer_keys.js: bản cũ đọc file .tex rồi
 * dò ngược về MySQL bằng cách so ĐỀ BÀI. Cách dò đó không tin được vì ngân hàng
 * lớp 1 có 20 đề bài dùng chung cho nhiều câu khác nhau, ví dụ "Phép tính nào phù
 * hợp với tranh?" dùng cho 30 câu. Bản cũ có chốt chặn chỉ ghi khi tìm được đúng
 * một câu, nên nó không ghi sai câu, nhưng lại ghi vào .tex mà bỏ qua MySQL, tức
 * là đẩy hai bên lệch nhau. Bản này đi từ MySQL theo id nên không có chỗ nào phải
 * đoán, và file .tex được dựng lại sau bằng resync_tex_from_db.js.
 *
 * VÌ SAO PHẢI RẢI ĐỀU: hệ thống không đảo thứ tự phương án khi hiển thị, nên nhãn
 * lưu trong dữ liệu chính là nhãn học sinh nhìn thấy. Nếu đáp án đúng dồn về một
 * nhãn thì học sinh cứ bấm nhãn đó là được điểm mà không cần biết Toán, và mẹo
 * này ổn định qua mọi lần luyện tập.
 *
 * BỎ QUA hai nhóm:
 *   - Câu chưa đủ bốn phương án. Rải đều chỉ có nghĩa khi đủ bốn vị trí.
 *   - Câu có ảnh cắt từ tờ đề gộp, nhận ra qua c_crop trong đường dẫn ảnh. Ảnh
 *     loại này in sẵn nhãn A, B, C, D bên trong, đổi thứ tự trong dữ liệu là ảnh
 *     và dữ liệu nói hai đằng, học sinh đọc ảnh bấm đúng sẽ bị chấm sai.
 *
 * Cách rải: theo thứ tự id tăng dần, câu thứ nhất đưa đáp án về A, câu thứ hai về
 * B, thứ ba C, thứ tư D rồi lặp lại. Hoàn toàn xác định nên chạy lại nhiều lần
 * vẫn ra cùng kết quả. Các phương án còn lại giữ nguyên thứ tự tương đối để nội
 * dung vẫn đọc tự nhiên, ví dụ dãy số tăng dần không bị xáo lung tung.
 *
 * Dùng:
 *   node scripts/rebalance_keys_by_id.js 1            -> xem trước cho lớp 1
 *   node scripts/rebalance_keys_by_id.js 1 --commit   -> ghi vào MySQL
 *
 * Sau khi chạy phải chạy tiếp scripts/resync_tex_from_db.js --commit.
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const db = require('../config/db');

const COMMIT = process.argv.includes('--commit');
const GRADE = Number(process.argv[2]);
const ROOT = path.join(__dirname, '..');
const KEYS = ['A', 'B', 'C', 'D'];

function parseJson(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

/**
 * Sắp xếp lại mảng phương án sao cho đáp án đúng nằm ở vị trí viTriDich.
 * Các phương án còn lại giữ nguyên thứ tự tương đối.
 */
function hoanVi(choices, khoaDung, viTriDich) {
  const dung = choices.find((c) => c.key === khoaDung);
  const conLai = choices.filter((c) => c.key !== khoaDung);
  const moi = [...conLai];
  moi.splice(viTriDich, 0, dung);
  return moi.map((c, i) => ({ ...c, key: KEYS[i] }));
}

async function main() {
  if (!Number.isInteger(GRADE) || GRADE < 1 || GRADE > 5) {
    throw new Error('Cần truyền số khối lớp, ví dụ: node scripts/rebalance_keys_by_id.js 1');
  }

  const rows = await db.query(
    `SELECT q.id, q.question_type, q.content, q.choices, q.correct_answer
     FROM QuestionBank q
     JOIN Lessons l ON l.id = q.lesson_id
     JOIN Chapters ch ON ch.id = l.chapter_id
     WHERE ch.grade = ? ORDER BY q.id`,
    [GRADE]
  );

  const truoc = { A: 0, B: 0, C: 0, D: 0 };
  const sau = { A: 0, B: 0, C: 0, D: 0 };
  const boQua = { thieuPhuongAn: 0, anhCat: 0, khongPhaiTracNghiem: 0 };
  const chiTiet = [];

  let stt = 0;
  let doi = 0;

  for (const row of rows) {
    const choices = parseJson(row.choices, []) || [];
    const content = parseJson(row.content, {}) || {};

    if (row.question_type && row.question_type !== 'MULTIPLE_CHOICE') {
      boQua.khongPhaiTracNghiem += 1;
      continue;
    }
    if (choices.length !== 4) {
      boQua.thieuPhuongAn += 1;
      if (truoc[row.correct_answer] !== undefined) truoc[row.correct_answer] += 1;
      if (sau[row.correct_answer] !== undefined) sau[row.correct_answer] += 1;
      continue;
    }
    if ((content.images || []).some((im) => String(im.url || '').includes('c_crop'))) {
      boQua.anhCat += 1;
      if (truoc[row.correct_answer] !== undefined) truoc[row.correct_answer] += 1;
      if (sau[row.correct_answer] !== undefined) sau[row.correct_answer] += 1;
      continue;
    }
    if (!choices.some((c) => c.key === row.correct_answer)) {
      throw new Error(`id ${row.id}: đáp án ${row.correct_answer} không có trong phương án.`);
    }

    truoc[row.correct_answer] += 1;

    const viTriDich = stt % 4;
    stt += 1;
    const khoaDich = KEYS[viTriDich];
    sau[khoaDich] += 1;

    if (row.correct_answer === khoaDich) continue;

    const choicesMoi = hoanVi(choices, row.correct_answer, viTriDich);
    doi += 1;
    chiTiet.push({
      id: row.id, de_bai: String(content.text || ''),
      dap_an_cu: row.correct_answer, dap_an_moi: khoaDich,
      phuong_an_cu: choices.map((c) => `${c.key}. ${c.text}`),
      phuong_an_moi: choicesMoi.map((c) => `${c.key}. ${c.text}`)
    });

    if (COMMIT) {
      await db.query(
        'UPDATE QuestionBank SET choices = CAST(? AS JSON), correct_answer = ? WHERE id = ?',
        [JSON.stringify(choicesMoi), khoaDich, row.id]
      );
    }
  }

  const tong = rows.length || 1;
  const pct = (o) => KEYS.map((k) => `${k}=${((o[k] / tong) * 100).toFixed(1)}%`).join('  ');

  console.log(`Lớp ${GRADE}: ${rows.length} câu`);
  console.log(`  Bỏ qua vì chưa đủ 4 phương án:        ${boQua.thieuPhuongAn}`);
  console.log(`  Bỏ qua vì ảnh in sẵn nhãn A, B, C, D: ${boQua.anhCat}`);
  if (boQua.khongPhaiTracNghiem) {
    console.log(`  Bỏ qua vì không phải trắc nghiệm:     ${boQua.khongPhaiTracNghiem}`);
  }
  console.log(`  Câu đổi vị trí đáp án:                ${doi}`);
  console.log('');
  console.log(`  trước: ${pct(truoc)}`);
  console.log(`  sau:   ${pct(sau)}`);

  const baoCao = path.join(ROOT, 'tmp', `bao_cao_can_bang_lop${GRADE}.json`);
  fs.writeFileSync(baoCao, JSON.stringify(chiTiet, null, 1), 'utf8');

  if (COMMIT) {
    console.log('\nĐã ghi vào MySQL. Nhớ chạy tiếp: node scripts/resync_tex_from_db.js --commit');
  } else {
    console.log('\nĐây là bản xem trước. Thêm --commit để ghi thật.');
    chiTiet.slice(0, 3).forEach((c) => {
      console.log(`\n  id ${c.id}  ${c.de_bai.slice(0, 62)}`);
      console.log(`    cũ : ${c.phuong_an_cu.join(' | ')}  -> ${c.dap_an_cu}`);
      console.log(`    mới: ${c.phuong_an_moi.join(' | ')}  -> ${c.dap_an_moi}`);
    });
  }
  console.log(`Báo cáo: ${path.relative(ROOT, baoCao)}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Thất bại:', error.message);
    process.exit(1);
  });
