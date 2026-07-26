/**
 * Xử lý các câu hỏi lớp 1 mà học sinh không thể trả lời đúng được.
 *
 * Ba nhóm:
 *
 * 1. VIẾT LẠI ĐỀ. Đề dạng "Quan sát tranh. Còn lại bao nhiêu con cá?" mà tranh đã
 *    bị gỡ ở đợt xử lý ảnh hỏng, nên không còn dữ kiện nào để tính. Đề mới nêu đủ
 *    số liệu bằng chữ và giữ nguyên đáp án đang có.
 *
 * 2. ĐỔI ĐÁP ÁN kèm viết lại đề. Chỉ có đúng một câu, id 6061, và đã được người
 *    kiểm duyệt tự mở ảnh xác minh chứ không lấy nguyên kết luận của máy.
 *
 * 3. THAY MỚI HOÀN TOÀN. Đề vốn là câu lệnh thao tác trên giấy như "Tô màu nhóm
 *    có nhiều đồ vật hơn" hay "Vẽ thêm để có 3 hình tròn", không có lời đáp nên
 *    không thể chuyển thành câu trắc nghiệm. Có câu còn hỏng nặng hơn: "Viết một
 *    phép so sánh có dấu >" mà cả ba phương án 6 > 2, 7 > 2, 5 > 2 đều đúng. Câu
 *    thay thế bám đúng bài học cũ để không lệch khung chương trình, và nâng lên
 *    đủ bốn phương án.
 *
 * Dùng:
 *   node scripts/fix_unanswerable_questions.js            -> xem trước
 *   node scripts/fix_unanswerable_questions.js --commit   -> ghi vào MySQL
 *
 * Sau khi chạy phải chạy tiếp scripts/resync_tex_from_db.js --commit.
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const db = require('../config/db');

const COMMIT = process.argv.includes('--commit');
const ROOT = path.join(__dirname, '..');
const BAO_CAO = path.join(ROOT, 'tmp', 'bao_cao_cau_khong_tra_loi_duoc.json');

const NHAN = ['A', 'B', 'C', 'D'];

/**
 * Nhóm 1 và 2. Giữ nguyên bộ phương án đang có, chỉ thay đề bài. Trường dap chỉ
 * điền khi thực sự phải đổi đáp án, và phải kèm lý do đã kiểm chứng.
 */
const VIET_LAI_DE = new Map([
  [6061, {
    de: 'Trong bể có 6 con cá. Có 2 con bơi ra khỏi bể. Hỏi trong bể còn lại bao nhiêu con cá?',
    giai: 'Trong bể có 6 con cá, 2 con đã bơi ra ngoài. Số cá còn lại là 6 - 2 = 4 con.',
    dap: 'B',
    viDoiDapAn: 'Đã tự mở ảnh g1-l017-q006-01.png để xác minh: trong bể vẽ đúng 6 con cá, '
      + 'hai con bên phải đang bơi đi và phía sau chúng có vệt nước cùng bong bóng chỉ hướng '
      + 'chuyển động ra xa. Bài học là Làm quen với phép trừ nên phép tính là 6 - 2 = 4. Dữ '
      + 'liệu đang chấm C tức số 2, nhưng 2 là số cá BƠI ĐI chứ không phải số cá còn lại. '
      + 'Số 6 thậm chí không có trong bốn phương án, càng cho thấy ý đồ ra đề là lấy 6 trừ 2. '
      + 'Đề cũ chỉ ghi "Quan sát tranh" nên không nói rõ có mấy con bơi đi, vì vậy sửa đáp án '
      + 'phải đi kèm viết lại đề cho hết mơ hồ.',
    giuAnh: true
  }],
  [5868, {
    de: 'Trong vườn có 1 chú mèo đang ngồi, 2 chú mèo khác chạy tới. '
      + 'Hỏi trong vườn có tất cả bao nhiêu chú mèo?',
    giai: 'Lúc đầu có 1 chú mèo, sau đó thêm 2 chú nữa. Tất cả có 1 + 2 = 3 chú mèo.'
  }],
  [6066, {
    de: 'Trong cốc có 4 chiếc bút màu. Bạn Lan lấy ra 1 chiếc. '
      + 'Hỏi trong cốc còn lại bao nhiêu chiếc bút màu?',
    giai: 'Trong cốc có 4 chiếc bút, lấy ra 1 chiếc. Số bút còn lại là 4 - 1 = 3 chiếc.'
  }]
]);

/** Nhóm 3. Thay cả đề, phương án, đáp án và lời giải. */
const THAY_MOI = new Map([
  [5521, {
    de: 'Bạn Nam để chiếc cặp sách ở gầm bàn học. Hỏi chiếc cặp ở đâu so với cái bàn?',
    pa: ['Trên bàn', 'Dưới bàn', 'Bên phải bàn', 'Trước bàn'],
    dap: 'B',
    giai: 'Gầm bàn là khoảng trống nằm phía dưới mặt bàn. Cặp để ở gầm bàn nghĩa là cặp ở dưới bàn.',
    vi: 'Đề cũ "Điền từ thích hợp: Cái cặp ở ___ cái bàn." không kèm tranh và không nêu vị trí '
      + 'cặp, nên cả "Trên" lẫn "dưới" đều là câu tiếng Việt hợp lệ.'
  }],
  [5568, {
    de: 'Vật nào dưới đây có mặt dạng hình tròn?',
    pa: ['Cái đĩa ăn cơm', 'Quyển sách giáo khoa', 'Chiếc ê ke', 'Viên gạch lát nền hình vuông'],
    dap: 'A',
    giai: 'Mặt cái đĩa ăn cơm là hình tròn. Quyển sách có mặt hình chữ nhật, chiếc ê ke có dạng '
      + 'hình tam giác, viên gạch lát nền có mặt hình vuông.',
    vi: 'Đề cũ "Khoanh vào tất cả các hình tròn trong ảnh." là câu lệnh vẽ trên giấy, không có '
      + 'lời đáp; hai phương án "Hình tròn" và "Các hình tròn" lại trùng nghĩa.'
  }],
  [5602, {
    de: 'Trên bàn đã có 1 hình tròn. Bạn Mai vẽ thêm 2 hình tròn nữa. '
      + 'Hỏi trên bàn có tất cả bao nhiêu hình tròn?',
    pa: ['1 hình tròn', '2 hình tròn', '3 hình tròn', '4 hình tròn'],
    dap: 'C',
    giai: 'Lúc đầu có 1 hình tròn, vẽ thêm 2 hình nữa thì đếm được 1, 2, 3. Vậy có tất cả 3 hình tròn.',
    vi: 'Đề cũ "Vẽ thêm để có 3 hình tròn." là câu lệnh thao tác, lại không cho biết ban đầu có '
      + 'sẵn mấy hình nên không có đáp số.'
  }],
  [5768, {
    de: 'Trên bàn có 5 cái cốc và 3 cái thìa. Hỏi nhóm đồ vật nào có nhiều hơn?',
    pa: ['Nhóm cái cốc', 'Nhóm cái thìa', 'Hai nhóm bằng nhau', 'Chưa đủ dữ kiện để so sánh'],
    dap: 'A',
    giai: 'Có 5 cái cốc và 3 cái thìa. Vì 5 nhiều hơn 3 nên nhóm cái cốc có nhiều đồ vật hơn.',
    vi: 'Đề cũ "Tô màu nhóm có nhiều đồ vật hơn." là câu lệnh tô màu, không kèm tranh nên không '
      + 'biết có những nhóm nào; hai phương án "Nhiều hơn" và "Nhóm nhiều hơn" lại trùng nghĩa.'
  }],
  [5769, {
    de: 'Trong giỏ có 4 quả cam và 7 quả quýt. Hỏi loại quả nào có ít hơn?',
    pa: ['Quả cam', 'Quả quýt', 'Hai loại bằng nhau', 'Chưa đủ dữ kiện để so sánh'],
    dap: 'A',
    giai: 'Có 4 quả cam và 7 quả quýt. Vì 4 ít hơn 7 nên quả cam có ít hơn.',
    vi: 'Đề cũ "Khoanh nhóm có ít đồ vật hơn." là câu lệnh khoanh tròn, không kèm tranh; hai '
      + 'phương án "Nhóm ít hơn" và "Ít hơn" lại trùng nghĩa.'
  }],
  [5806, {
    de: 'Điền dấu thích hợp vào chỗ chấm: 6 ... 2',
    pa: ['6 > 2', '6 < 2', '6 = 2', 'Không điền được dấu nào'],
    dap: 'A',
    giai: 'So sánh 6 với 2 thì 6 lớn hơn 2, nên điền dấu lớn hơn: 6 > 2.',
    vi: 'Đề cũ "Viết một phép so sánh có dấu >." hỏi mở, cả ba phương án 6 > 2, 7 > 2 và 5 > 2 '
      + 'đều là phép so sánh đúng nên học sinh chọn phương án nào cũng có lý.'
  }],
  [5807, {
    de: 'Điền dấu thích hợp vào chỗ chấm: 3 ... 7',
    pa: ['3 > 7', '3 < 7', '3 = 7', 'Không điền được dấu nào'],
    dap: 'B',
    giai: 'So sánh 3 với 7 thì 3 bé hơn 7, nên điền dấu bé hơn: 3 < 7.',
    vi: 'Đề cũ "Viết một phép so sánh có dấu <." hỏi mở, cả ba phương án 3 < 7, 2 < 7 và 4 < 7 '
      + 'đều là phép so sánh đúng.'
  }]
]);

function parseJson(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

async function layCau(id) {
  const rows = await db.query(
    'SELECT q.id, q.content, q.choices, q.correct_answer, q.explanation, l.lesson_name '
    + 'FROM QuestionBank q JOIN Lessons l ON l.id = q.lesson_id WHERE q.id = ?',
    [id]
  );
  return rows[0] || null;
}

async function main() {
  const baoCao = [];
  let daSua = 0;

  for (const [id, muc] of VIET_LAI_DE) {
    const row = await layCau(id);
    if (!row) {
      console.log(`  BỎ QUA id ${id}: không còn trong cơ sở dữ liệu`);
      continue;
    }
    const content = parseJson(row.content, {}) || {};
    const choices = parseJson(row.choices, []) || [];
    const explanation = parseJson(row.explanation, {}) || {};

    const dapAnMoi = muc.dap || row.correct_answer;
    if (muc.dap && !choices.some((c) => c.key === muc.dap)) {
      throw new Error(`id ${id}: đáp án mới ${muc.dap} không có trong bộ phương án.`);
    }

    const contentMoi = { ...content, text: muc.de };
    if (!muc.giuAnh) contentMoi.images = [];

    baoCao.push({
      id, loai: muc.dap ? 'viet_lai_de_va_doi_dap_an' : 'viet_lai_de',
      bai_hoc: row.lesson_name,
      de_cu: String(content.text || ''), de_moi: muc.de,
      phuong_an: choices.map((c) => `${c.key}. ${c.text}`),
      dap_an_cu: row.correct_answer, dap_an_moi: dapAnMoi,
      doi_dap_an: dapAnMoi !== row.correct_answer,
      ly_do_doi_dap_an: muc.viDoiDapAn || '',
      loi_giai_moi: muc.giai
    });

    if (COMMIT) {
      await db.query(
        'UPDATE QuestionBank SET content = CAST(? AS JSON), correct_answer = ?, explanation = CAST(? AS JSON) WHERE id = ?',
        [
          JSON.stringify(contentMoi),
          dapAnMoi,
          JSON.stringify({ ...explanation, text: muc.giai }),
          id
        ]
      );
      daSua += 1;
    }
  }

  for (const [id, muc] of THAY_MOI) {
    const row = await layCau(id);
    if (!row) {
      console.log(`  BỎ QUA id ${id}: không còn trong cơ sở dữ liệu`);
      continue;
    }
    const content = parseJson(row.content, {}) || {};
    const choicesCu = parseJson(row.choices, []) || [];
    const explanation = parseJson(row.explanation, {}) || {};

    if (muc.pa.length !== 4) throw new Error(`id ${id}: cần đúng 4 phương án.`);
    const choicesMoi = muc.pa.map((text, i) => ({ key: NHAN[i], text, images: [] }));
    if (!choicesMoi.some((c) => c.key === muc.dap)) {
      throw new Error(`id ${id}: đáp án ${muc.dap} không có trong bộ phương án mới.`);
    }
    const chuan = choicesMoi.map((c) => c.text.trim().toLowerCase());
    if (new Set(chuan).size !== chuan.length) {
      throw new Error(`id ${id}: bộ phương án mới còn hai phương án giống nhau.`);
    }

    baoCao.push({
      id, loai: 'thay_moi', bai_hoc: row.lesson_name,
      ly_do_thay: muc.vi,
      de_cu: String(content.text || ''), de_moi: muc.de,
      phuong_an_cu: choicesCu.map((c) => `${c.key}. ${c.text}`),
      phuong_an_moi: choicesMoi.map((c) => `${c.key}. ${c.text}`),
      dap_an_cu: row.correct_answer, dap_an_moi: muc.dap,
      loi_giai_moi: muc.giai
    });

    if (COMMIT) {
      await db.query(
        'UPDATE QuestionBank SET content = CAST(? AS JSON), choices = CAST(? AS JSON), '
        + 'correct_answer = ?, explanation = CAST(? AS JSON) WHERE id = ?',
        [
          JSON.stringify({ ...content, text: muc.de, images: [] }),
          JSON.stringify(choicesMoi),
          muc.dap,
          JSON.stringify({ ...explanation, text: muc.giai }),
          id
        ]
      );
      daSua += 1;
    }
  }

  const vietLai = baoCao.filter((b) => b.loai.startsWith('viet_lai'));
  const thayMoi = baoCao.filter((b) => b.loai === 'thay_moi');

  console.log(`Viết lại đề:        ${vietLai.length}`);
  console.log(`  trong đó đổi đáp án: ${vietLai.filter((b) => b.doi_dap_an).length}`);
  console.log(`Thay mới hoàn toàn: ${thayMoi.length}`);

  vietLai.forEach((b) => {
    console.log(`\n  id ${b.id} [${b.bai_hoc}]`);
    console.log(`    cũ : ${b.de_cu}`);
    console.log(`    mới: ${b.de_moi}`);
    console.log(`    ${b.phuong_an.join(' | ')}  -> ${b.dap_an_moi}${b.doi_dap_an ? ` (đổi từ ${b.dap_an_cu})` : ''}`);
  });
  thayMoi.forEach((b) => {
    console.log(`\n  id ${b.id} [${b.bai_hoc}]`);
    console.log(`    cũ : ${b.de_cu}   ||   ${b.phuong_an_cu.join(' | ')}  -> ${b.dap_an_cu}`);
    console.log(`    mới: ${b.de_moi}   ||   ${b.phuong_an_moi.join(' | ')}  -> ${b.dap_an_moi}`);
  });

  if (COMMIT) {
    console.log(`\nĐã cập nhật MySQL: ${daSua} câu.`);
    console.log('Nhớ chạy tiếp: node scripts/resync_tex_from_db.js --commit');
  } else {
    console.log('\nĐây là bản xem trước. Thêm --commit để ghi thật.');
  }

  fs.writeFileSync(BAO_CAO, JSON.stringify(baoCao, null, 1), 'utf8');
  console.log(`Báo cáo: ${path.relative(ROOT, BAO_CAO)}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Thất bại:', error.message);
    process.exit(1);
  });
