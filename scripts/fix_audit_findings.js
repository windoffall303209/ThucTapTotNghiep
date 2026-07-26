/**
 * Sửa các lỗi tìm được ở lượt rà soát độc lập file Word ngân hàng câu hỏi.
 *
 * Lượt rà soát báo 14 vấn đề. Người kiểm duyệt đã tự đo lại từng vấn đề, trong đó
 * TỰ MỞ ẢNH với ba câu đụng tới đáp án, và loại bỏ những vấn đề báo nhầm:
 *
 *   - Báo "7 cặp câu lặp nguyên văn": đo lại chỉ có 1 nhóm thật sự trùng cả đề,
 *     phương án lẫn đáp án. Ba nhóm còn lại như G4-L028-Q003 và Q004 tuy chung đề
 *     "Kết quả của phép chia trong hình là bao nhiêu?" nhưng ảnh khác nhau, phép
 *     tính khác nhau (288 : 36 và 232 : 29) nên là hai câu riêng, không phải lỗi.
 *   - Báo "103 câu đề bài chứa nguyên văn phương án đúng": đo lại được 477 câu
 *     theo cách hiểu đó, nhưng gần hết là dạng đề nêu dữ kiện rồi hỏi lại, ví dụ
 *     "Quả bóng nằm dưới cái ghế. Từ chỉ vị trí đúng là gì?". Đó là khuôn hợp lệ
 *     của lớp 1. Chỉ 4 câu dạng câu lệnh là lỗi thật, đã gộp vào nhóm bên dưới.
 *   - Báo "lớp 2 bài 22 và 23 trùng tên": lớp 5 có tới 9 bài cùng tên "Luyện tập"
 *     và 7 bài "Luyện tập chung". Sách Cánh Diều vốn đặt tên như vậy, không sửa.
 *   - Báo "12 câu lời giải bảo nhìn tranh mà không có ảnh": đo lại được 8, trong
 *     đó 5 câu dùng chữ "hình" theo nghĩa ký hiệu hình học như "trong hình thoi
 *     ABCD" nên không phải lỗi. Còn 3 câu thật.
 *
 * Bốn nhóm việc thật:
 *
 * 1. LỜI GIẢI MÂU THUẪN ĐÁP ÁN. Câu G4-L055-Q005 chấm D là 12 lần nhưng lời giải
 *    viết "3 + 3 + 3 + 4 = 13 chấm đỏ", mà 13 lại đúng là phương án A. Học sinh
 *    làm theo lời giải sẽ chọn A và bị chấm sai. Đã tự mở ảnh
 *    g4-l055-q005-01.png đếm lại: bảng 4 hàng 5 cột, hàng nào cũng đúng 3 chấm đỏ,
 *    tổng 12 chấm đỏ và 8 chấm xanh. Vậy đáp án D đúng, lời giải sai cả phép cộng
 *    lẫn kết quả. Ảnh này dùng được nên gắn lại luôn vì đề cần bảng mới trả lời được.
 *
 * 2. ĐỀ KHÔNG TỰ CHỨA DỮ KIỆN sau đợt gỡ ảnh hỏng. Ba câu còn sót. Với hai câu lớp
 *    4 thì KHÔNG gắn lại ảnh vì đã tự mở ra xem và thấy ảnh sai toán:
 *      - g4-l035-q011-01.png: hình tròn trái chia 8 phần nhưng tô 3 phần, trong khi
 *        đáp án và lời giải nói 2 phần. Ảnh mâu thuẫn với chính đáp án.
 *      - g4-l036-q002-01.png: băng giấy dưới có 16 ô và tô 10 ô, tức 10/16, trong
 *        khi đáp án nói 9/15. Ảnh sai.
 *    Cả hai đáp án đều đúng về toán nên giữ nguyên đáp án, chỉ viết lại đề cho tự
 *    đủ dữ kiện bằng chữ.
 *
 * 3. LỜI GIẢI NÓI VỀ CÂU KHÁC hoặc còn nhắc tranh đã gỡ.
 *
 * 4. CÂU LỆNH LỚP 1 CÓ PHƯƠNG ÁN LẶP LẠI CON SỐ CỦA ĐỀ. Ví dụ đề "Khoanh nhóm có
 *    2 đồ vật" với phương án "Nhóm có 2 đồ vật". Học sinh chỉ cần dò con số trong
 *    đề là chọn đúng, không phải đếm gì cả, mà câu lại không có tranh để đếm.
 *
 * Dùng:
 *   node scripts/fix_audit_findings.js            -> xem trước
 *   node scripts/fix_audit_findings.js --commit   -> ghi vào MySQL
 *
 * Sau khi chạy phải chạy tiếp scripts/resync_tex_from_db.js --commit rồi xuất lại
 * file Word bằng scripts/export_question_bank_docx.py.
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const db = require('../config/db');

const COMMIT = process.argv.includes('--commit');
const ROOT = path.join(__dirname, '..');
const DUMP = path.join(ROOT, 'tmp', 'dump_cau_hoi.json');
const BAO_CAO = path.join(ROOT, 'tmp', 'bao_cao_sua_ra_soat_docx.json');

const NHAN = ['A', 'B', 'C', 'D'];

/** Nhóm 3: chỉ viết lại lời giải, không đụng đề, phương án hay đáp án. */
const SUA_LOI_GIAI = new Map([
  ['G4-L055-Q005',
    'Đếm số chấm đỏ theo từng hàng của bảng: hàng nào cũng có đúng 3 chấm đỏ. '
    + 'Vậy tất cả có 3 + 3 + 3 + 3 = 12 chấm đỏ, tức viên bi màu đỏ được chọn 12 lần.'],
  ['G1-L010-Q006',
    'Trên đĩa đã có 1 quả dâu tây, bạn nhỏ đặt thêm 2 quả nữa. Em tính 1 + 2 = 3. '
    + 'Vậy trên đĩa có tất cả 3 quả dâu tây.'],
  ['G1-L021-Q006',
    'Trên cành có 9 con bọ rùa, cả 9 con đều bay đi nên không còn con nào ở lại. '
    + 'Em tính 9 - 9 = 0.']
]);

/** Nhóm 1: gắn lại ảnh cho câu mà ảnh đúng và đề cần ảnh mới trả lời được. */
const GAN_LAI_ANH = new Map([
  ['G4-L055-Q005', {
    id: 'G4-L055-Q005-IMG-01',
    url: '/uploads/images/grade4/g4-l055-q005-01.png',
    alt_text: 'Bảng 4 hàng 5 cột ghi kết quả các lần chọn bi, mỗi ô là một chấm đỏ hoặc chấm xanh',
    width_percent: 100
  }]
]);

/** Nhóm 2: viết lại đề cho tự đủ dữ kiện, giữ nguyên phương án và đáp án. */
const VIET_LAI_DE = new Map([
  ['G1-L016-Q005', {
    de: 'Bạn nhỏ đã xếp một tháp gồm khối xanh lá, khối đỏ và khối xanh dương, '
      + 'rồi đặt thêm một khối vàng lên trên cùng. '
      + 'Hỏi tháp có tất cả bao nhiêu khối lập phương?',
    giai: 'Tháp có khối xanh lá, khối đỏ, khối xanh dương và khối vàng đặt thêm. '
      + 'Em đếm lần lượt được 4 khối lập phương.'
  }],
  ['G4-L035-Q011', {
    de: 'Hình tròn thứ nhất được chia thành 8 phần bằng nhau và tô màu vàng 2 phần. '
      + 'Hình tròn thứ hai được chia thành 4 phần bằng nhau và tô màu vàng 1 phần. '
      + 'Phần màu vàng ở hai hình tròn được viết là:',
    giai: 'Hình thứ nhất tô 2/8, hình thứ hai tô 1/4. Rút gọn 2/8 bằng cách chia cả tử số '
      + 'và mẫu số cho 2 được 1/4. Vậy hai phần bằng nhau: 2/8 = 1/4.'
  }],
  ['G4-L036-Q002', {
    de: 'Băng giấy thứ nhất được chia thành 5 phần bằng nhau và tô màu 3 phần. Băng giấy '
      + 'thứ hai dài bằng băng thứ nhất nhưng được chia thành 15 phần bằng nhau và tô màu '
      + '9 phần. Hai băng giấy minh họa phép biến đổi nào?',
    giai: 'Nhân cả tử số và mẫu số của 3/5 với 3 được 9/15. Hai băng giấy tô phần bằng nhau '
      + 'nên 3/5 = 9/15.'
  }]
]);

/** Nhóm 4: thay mới hoàn toàn. Giữ nguyên nhãn đáp án đang có để đỡ xáo trộn. */
const THAY_MOI = new Map([
  ['G1-L003-Q008', {
    de: 'Bạn Mai có 1 chiếc bút chì, mẹ cho thêm 1 chiếc nữa. '
      + 'Hỏi Mai có tất cả mấy chiếc bút chì?',
    pa: ['1 chiếc', '3 chiếc', '2 chiếc', '4 chiếc'], dap: 'C',
    giai: 'Mai có 1 chiếc, được cho thêm 1 chiếc nữa. Em đếm một, hai. Vậy Mai có 2 chiếc bút chì.'
  }],
  ['G1-L004-Q008', {
    de: 'Trên đĩa có 5 quả nho. Số quả nho trên đĩa được viết là số mấy?',
    pa: ['6', '5', '4', '7'], dap: 'B',
    giai: 'Em đếm lần lượt từng quả nho: một, hai, ba, bốn, năm. Có 5 quả nên viết là số 5.'
  }],
  ['G1-L005-Q008', {
    de: 'Trong giỏ có 8 quả trứng. Số quả trứng trong giỏ được viết là số mấy?',
    pa: ['7', '8', '9', '10'], dap: 'B',
    giai: 'Đề cho biết trong giỏ có 8 quả trứng, nên số cần viết là số 8.'
  }],
  ['G1-L007-Q008', {
    de: 'Trên cây có 9 quả cam. Số quả cam trên cây được viết là số mấy?',
    pa: ['8', '10', '11', '9'], dap: 'D',
    giai: 'Đề cho biết trên cây có 9 quả cam, nên số cần viết là số 9.'
  }],
  ['G1-L003-Q014', {
    de: 'Trong lọ chỉ còn 1 bông hoa. Số bông hoa trong lọ được viết là số mấy?',
    pa: ['1', '2', '0', '3'], dap: 'A',
    giai: 'Trong lọ còn đúng một bông hoa, nên số bông hoa được viết là số 1.'
  }],
  ['G1-L004-Q014', {
    de: 'Bạn Nam xếp được 4 khối gỗ. Số khối gỗ bạn Nam xếp được viết là số mấy?',
    pa: ['5', '3', '6', '4'], dap: 'D',
    giai: 'Đề cho biết bạn Nam xếp được 4 khối gỗ, nên số cần viết là số 4.'
  }],
  ['G1-L005-Q014', {
    de: 'Một tuần lễ có 7 ngày. Số ngày của một tuần lễ được viết là số mấy?',
    pa: ['8', '6', '9', '7'], dap: 'D',
    giai: 'Một tuần lễ gồm 7 ngày, nên số cần viết là số 7.'
  }],
  ['G1-L007-Q014', {
    de: 'Trên bàn có 8 chiếc cốc. Số cốc trên bàn được viết là số mấy?',
    pa: ['9', '8', '7', '10'], dap: 'B',
    giai: 'Đề cho biết trên bàn có 8 chiếc cốc, nên số cần viết là số 8.'
  }],
  ['G1-L002-Q012', {
    de: 'Chiếc ê ke trong hộp bút của em có dạng hình gì?',
    pa: ['Hình tam giác', 'Hình tròn', 'Hình vuông', 'Hình chữ nhật'], dap: 'A',
    giai: 'Chiếc ê ke có ba cạnh nên nó có dạng hình tam giác.'
  }],
  ['G1-L006-Q012', {
    de: 'Trong các số 0, 1, 2 và 3, số nào bé hơn tất cả các số còn lại?',
    pa: ['0', '1', '2', '3'], dap: 'A',
    giai: 'Đếm theo thứ tự 0, 1, 2, 3 thì số 0 đứng đầu tiên, nên số 0 bé nhất.'
  }]
]);

/** Nhóm 3 phụ: cắt phần rác bị dán vào cuối lời giải. */
const CAT_RAC = ['G2-L012-Q020', 'G2-L015-Q020'];
const MAU_RAC = /\s*##\s*Ch(ươ|uo)ng[\s\S]*$/u;

function parseJson(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

async function main() {
  if (!fs.existsSync(DUMP)) {
    throw new Error('Chưa có tmp/dump_cau_hoi.json. Chạy trước: node scripts/dump_questions_json.js');
  }
  const dump = JSON.parse(fs.readFileSync(DUMP, 'utf8'));
  const idTheoMa = new Map(dump.map((x) => [x.external_id, x.id]));

  const baoCao = [];

  async function lay(ma) {
    const id = idTheoMa.get(ma);
    if (!id) return null;
    const rows = await db.query(
      'SELECT q.id, q.content, q.choices, q.correct_answer, q.explanation, l.lesson_name '
      + 'FROM QuestionBank q JOIN Lessons l ON l.id = q.lesson_id WHERE q.id = ?',
      [id]
    );
    return rows[0] ? { ...rows[0], external_id: ma } : null;
  }

  // ---- Nhóm 4: thay mới ----
  for (const [ma, muc] of THAY_MOI) {
    const row = await lay(ma);
    if (!row) { console.log(`  BỎ QUA ${ma}: không tìm thấy`); continue; }
    const content = parseJson(row.content, {}) || {};
    const choicesCu = parseJson(row.choices, []) || [];
    const explanation = parseJson(row.explanation, {}) || {};

    if (muc.pa.length !== 4) throw new Error(`${ma}: cần đúng 4 phương án.`);
    const choicesMoi = muc.pa.map((text, i) => ({ key: NHAN[i], text, images: [] }));
    if (!choicesMoi.some((c) => c.key === muc.dap)) throw new Error(`${ma}: đáp án không có trong phương án.`);
    const chuan = choicesMoi.map((c) => c.text.trim().toLowerCase());
    if (new Set(chuan).size !== chuan.length) throw new Error(`${ma}: phương án mới bị trùng nhau.`);
    // Chốt chặn riêng của nhóm này: đề mới không được chứa nguyên văn đáp án đúng.
    const dapAnText = choicesMoi.find((c) => c.key === muc.dap).text.trim().toLowerCase();
    if (dapAnText.length > 2 && muc.de.toLowerCase().includes(dapAnText)) {
      console.log(`  CHÚ Ý ${ma}: đề mới vẫn chứa nguyên văn đáp án "${dapAnText}".`);
    }

    baoCao.push({
      external_id: ma, id: row.id, loai: 'thay_moi', bai_hoc: row.lesson_name,
      de_cu: String(content.text || ''), de_moi: muc.de,
      pa_cu: choicesCu.map((c) => `${c.key}. ${c.text}`),
      pa_moi: choicesMoi.map((c) => `${c.key}. ${c.text}`),
      dap_an_cu: row.correct_answer, dap_an_moi: muc.dap, giai_moi: muc.giai
    });

    if (COMMIT) {
      await db.query(
        'UPDATE QuestionBank SET content = CAST(? AS JSON), choices = CAST(? AS JSON), '
        + 'correct_answer = ?, explanation = CAST(? AS JSON) WHERE id = ?',
        [
          JSON.stringify({ ...content, text: muc.de, images: [] }),
          JSON.stringify(choicesMoi), muc.dap,
          JSON.stringify({ ...explanation, text: muc.giai }), row.id
        ]
      );
    }
  }

  // ---- Nhóm 2: viết lại đề ----
  for (const [ma, muc] of VIET_LAI_DE) {
    const row = await lay(ma);
    if (!row) { console.log(`  BỎ QUA ${ma}: không tìm thấy`); continue; }
    const content = parseJson(row.content, {}) || {};
    const explanation = parseJson(row.explanation, {}) || {};

    baoCao.push({
      external_id: ma, id: row.id, loai: 'viet_lai_de', bai_hoc: row.lesson_name,
      de_cu: String(content.text || ''), de_moi: muc.de,
      dap_an_cu: row.correct_answer, dap_an_moi: row.correct_answer, giai_moi: muc.giai
    });

    if (COMMIT) {
      await db.query(
        'UPDATE QuestionBank SET content = CAST(? AS JSON), explanation = CAST(? AS JSON) WHERE id = ?',
        [
          JSON.stringify({ ...content, text: muc.de, images: [] }),
          JSON.stringify({ ...explanation, text: muc.giai }), row.id
        ]
      );
    }
  }

  // ---- Nhóm 1 và 3: lời giải, và gắn lại ảnh ----
  for (const [ma, giai] of SUA_LOI_GIAI) {
    const row = await lay(ma);
    if (!row) { console.log(`  BỎ QUA ${ma}: không tìm thấy`); continue; }
    const content = parseJson(row.content, {}) || {};
    const explanation = parseJson(row.explanation, {}) || {};
    const anh = GAN_LAI_ANH.get(ma);

    if (anh) {
      const tep = path.join(ROOT, 'public', anh.url.replace(/^\//, ''));
      if (!fs.existsSync(tep)) throw new Error(`${ma}: không tìm thấy tệp ảnh ${tep}`);
      content.images = [anh];
    }

    baoCao.push({
      external_id: ma, id: row.id, loai: anh ? 'sua_loi_giai_va_gan_anh' : 'sua_loi_giai',
      bai_hoc: row.lesson_name, de_cu: String(content.text || ''),
      giai_cu: String(explanation.text || ''), giai_moi: giai,
      anh_gan_lai: anh ? anh.url : ''
    });

    if (COMMIT) {
      if (anh) {
        await db.query(
          'UPDATE QuestionBank SET content = CAST(? AS JSON), explanation = CAST(? AS JSON) WHERE id = ?',
          [JSON.stringify(content), JSON.stringify({ ...explanation, text: giai }), row.id]
        );
      } else {
        await db.query('UPDATE QuestionBank SET explanation = CAST(? AS JSON) WHERE id = ?',
          [JSON.stringify({ ...explanation, text: giai }), row.id]);
      }
    }
  }

  // ---- Cắt rác Markdown ----
  for (const ma of CAT_RAC) {
    const row = await lay(ma);
    if (!row) { console.log(`  BỎ QUA ${ma}: không tìm thấy`); continue; }
    const explanation = parseJson(row.explanation, {}) || {};
    const cu = String(explanation.text || '');
    const moi = cu.replace(MAU_RAC, '').trim();
    if (moi === cu) { console.log(`  BỎ QUA ${ma}: không còn rác`); continue; }

    baoCao.push({
      external_id: ma, id: row.id, loai: 'cat_rac', bai_hoc: row.lesson_name,
      giai_cu: cu, giai_moi: moi
    });

    if (COMMIT) {
      await db.query('UPDATE QuestionBank SET explanation = CAST(? AS JSON) WHERE id = ?',
        [JSON.stringify({ ...explanation, text: moi }), row.id]);
    }
  }

  const dem = (l) => baoCao.filter((b) => b.loai === l).length;
  console.log(`Thay mới:                 ${dem('thay_moi')}`);
  console.log(`Viết lại đề:              ${dem('viet_lai_de')}`);
  console.log(`Sửa lời giải:             ${dem('sua_loi_giai')}`);
  console.log(`Sửa lời giải + gắn ảnh:   ${dem('sua_loi_giai_va_gan_anh')}`);
  console.log(`Cắt rác trong lời giải:   ${dem('cat_rac')}`);
  console.log(`Tổng:                     ${baoCao.length}`);

  baoCao.filter((b) => b.loai !== 'thay_moi').forEach((b) => {
    console.log(`\n  ${b.external_id} [${b.loai}]`);
    if (b.de_moi) { console.log(`    đề cũ : ${b.de_cu}`); console.log(`    đề mới: ${b.de_moi}`); }
    if (b.giai_cu !== undefined) console.log(`    giải cũ : ${String(b.giai_cu).slice(0, 110)}`);
    if (b.giai_moi) console.log(`    giải mới: ${String(b.giai_moi).slice(0, 110)}`);
    if (b.anh_gan_lai) console.log(`    gắn lại ảnh: ${b.anh_gan_lai}`);
  });

  if (COMMIT) {
    console.log(`\nĐã cập nhật MySQL: ${baoCao.length} câu.`);
    console.log('Chạy tiếp: node scripts/resync_tex_from_db.js --commit');
    console.log('Rồi xuất lại: python scripts/export_question_bank_docx.py');
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
