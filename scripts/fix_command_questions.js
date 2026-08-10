// Script fix command questions h? tr? nh?p, xu?t, ki?m tra ho?c b?o tr? d? li?u v? c?u h?nh c?a d? ?n.
/**
 * Thay các câu hỏi lớp 1 vốn là CÂU LỆNH thao tác trên giấy chứ không phải câu hỏi.
 *
 * VÌ SAO PHẢI THAY, KHÔNG SỬA ĐƯỢC: đề dạng "Nối số 1, 2, 3 với nhóm đồ vật tương
 * ứng" hay "Vẽ thêm để có 6 hình tròn" là bài tập làm trên vở, không có lời đáp
 * để chọn. Khi bị ép thành trắc nghiệm thì bộ phương án trở thành lời mô tả hành
 * động: "Nối theo đúng số lượng", "Thực hiện nhiều hơn yêu cầu một đơn vị", "Vẽ
 * đủ 6 hình tròn". Học sinh không tính toán gì cả, chỉ cần nhìn phương án nào
 * nghe giống lời yêu cầu của đề là chọn đúng. Câu như vậy không đo được gì.
 *
 * CÂU THAY THẾ: bám đúng bài học cũ để không lệch khung chương trình, giữ nguyên
 * kiến thức cần kiểm tra nhưng đặt lại thành câu hỏi có một đáp số, và nâng lên
 * đủ bốn phương án.
 *
 * Riêng hai câu chỉ hỏng ở một phương án thì giữ nguyên đề, chỉ viết lại phương
 * án đó.
 *
 * Dùng:
 *   node scripts/fix_command_questions.js            -> xem trước
 *   node scripts/fix_command_questions.js --commit   -> ghi vào MySQL
 *
 * Sau khi chạy phải chạy tiếp scripts/resync_tex_from_db.js --commit.
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const db = require('../config/db');

const COMMIT = process.argv.includes('--commit');
const ROOT = path.join(__dirname, '..');
const BAO_CAO = path.join(ROOT, 'tmp', 'bao_cao_cau_menh_lenh.json');

const NHAN = ['A', 'B', 'C', 'D'];

const THAY_MOI = new Map([
  [5529, {
    de: 'Bạn Lan ngồi bên trái bạn Hùng. Vậy bạn Hùng ngồi ở đâu so với bạn Lan?',
    pa: ['Bên phải bạn Lan', 'Bên trái bạn Lan', 'Phía trên bạn Lan', 'Phía dưới bạn Lan'],
    dap: 'A',
    giai: 'Lan ở bên trái Hùng thì nhìn ngược lại, Hùng phải ở bên phải Lan.'
  }],
  [5543, {
    de: 'Cái tủ đứng bên trái cửa ra vào. Vậy cửa ra vào ở đâu so với cái tủ?',
    pa: ['Bên phải cái tủ', 'Bên trái cái tủ', 'Phía sau cái tủ', 'Phía trên cái tủ'],
    dap: 'A',
    giai: 'Cái tủ ở bên trái cửa thì nhìn ngược lại, cửa ra vào ở bên phải cái tủ.'
  }],
  [5610, {
    de: 'Trên bàn có 3 quyển vở. Số quyển vở đó được viết là số mấy?',
    pa: ['1', '2', '3', '4'],
    dap: 'C',
    giai: 'Đếm lần lượt từng quyển vở: một, hai, ba. Có 3 quyển nên viết là số 3.'
  }],
  [5634, {
    de: 'Trên bảng đã có 4 hình tròn. Bạn Nam vẽ thêm 2 hình tròn nữa. '
      + 'Hỏi trên bảng có tất cả bao nhiêu hình tròn?',
    pa: ['4 hình tròn', '5 hình tròn', '6 hình tròn', '7 hình tròn'],
    dap: 'C',
    giai: 'Đã có 4 hình tròn, vẽ thêm 2 hình nữa thì có 4 + 2 = 6 hình tròn.'
  }],
  [5642, {
    de: 'Trong rổ có 5 quả trứng. Số quả trứng đó được viết là số mấy?',
    pa: ['4', '5', '6', '7'],
    dap: 'B',
    giai: 'Đếm lần lượt từng quả trứng: một, hai, ba, bốn, năm. Có 5 quả nên viết là số 5.'
  }],
  [5666, {
    de: 'Trên bảng đã có 7 hình tròn. Bạn Mai vẽ thêm 2 hình tròn nữa. '
      + 'Hỏi trên bảng có tất cả bao nhiêu hình tròn?',
    pa: ['7 hình tròn', '8 hình tròn', '9 hình tròn', '10 hình tròn'],
    dap: 'C',
    giai: 'Đã có 7 hình tròn, vẽ thêm 2 hình nữa thì có 7 + 2 = 9 hình tròn.'
  }],
  [5674, {
    de: 'Bạn Hà đếm được 8 chiếc bút chì. Số bút chì đó được viết là số mấy?',
    pa: ['7', '8', '9', '10'],
    dap: 'B',
    giai: 'Bạn Hà đếm được 8 chiếc bút chì nên số cần viết là số 8.'
  }],
  [5698, {
    de: 'Trong đĩa không còn quả táo nào. Số quả táo trong đĩa được viết là số mấy?',
    pa: ['0', '1', '2', '10'],
    dap: 'A',
    giai: 'Không có quả táo nào thì số quả táo là không, viết bằng chữ số 0.'
  }],
  [5708, {
    de: 'Một chiếc giỏ để trống, không đựng quả nào. Số quả trong giỏ là bao nhiêu?',
    pa: ['0 quả', '1 quả', '2 quả', 'Không viết được số nào'],
    dap: 'A',
    giai: 'Giỏ trống nghĩa là không có quả nào. Số không có gì được viết là 0, '
      + 'nên trong giỏ có 0 quả.'
  }],
  [5731, {
    de: 'Trên bảng đã có 8 hình tròn. Bạn Nam vẽ thêm 2 hình tròn nữa. '
      + 'Hỏi trên bảng có tất cả bao nhiêu hình tròn?',
    pa: ['8 hình tròn', '9 hình tròn', '10 hình tròn', '11 hình tròn'],
    dap: 'C',
    giai: 'Đã có 8 hình tròn, vẽ thêm 2 hình nữa thì có 8 + 2 = 10 hình tròn.'
  }],
  [5739, {
    de: 'Bạn Bình đếm được 10 viên bi. Số viên bi đó được viết là số mấy?',
    pa: ['8', '9', '10', '11'],
    dap: 'C',
    giai: 'Bạn Bình đếm được 10 viên bi nên số cần viết là số 10.'
  }],
  [5763, {
    de: 'Nhóm thứ nhất có 5 bông hoa, nhóm thứ hai có 3 bông hoa. '
      + 'Phải thêm mấy bông hoa vào nhóm thứ hai để hai nhóm bằng nhau?',
    pa: ['1 bông hoa', '2 bông hoa', '3 bông hoa', '5 bông hoa'],
    dap: 'B',
    giai: 'Nhóm thứ hai đang ít hơn nhóm thứ nhất. Lấy 5 - 3 = 2 nên phải thêm 2 bông hoa '
      + 'thì cả hai nhóm cùng có 5 bông.'
  }],
  [5767, {
    de: 'Nhóm A có 4 cái cốc, nhóm B có 4 cái thìa. Số đồ vật của hai nhóm này thế nào?',
    pa: ['Nhóm A nhiều hơn', 'Nhóm B nhiều hơn', 'Hai nhóm bằng nhau', 'Chưa đủ dữ kiện để so sánh'],
    dap: 'C',
    giai: 'Nhóm A có 4 cái, nhóm B cũng có 4 cái. Hai số bằng nhau nên hai nhóm bằng nhau.'
  }],
  [5774, {
    de: 'Bạn Lan xếp 6 viên bi thành hai nhóm bằng nhau. Hỏi mỗi nhóm có mấy viên bi?',
    pa: ['2 viên bi', '3 viên bi', '4 viên bi', '6 viên bi'],
    dap: 'B',
    giai: 'Chia 6 viên bi thành hai nhóm bằng nhau thì mỗi nhóm 3 viên, vì 3 + 3 = 6.'
  }],
  [5805, {
    de: 'Điền dấu thích hợp vào chỗ chấm: 8 ... 8',
    pa: ['8 > 8', '8 < 8', '8 = 8', 'Không điền được dấu nào'],
    dap: 'C',
    giai: 'Hai số đều là 8 nên chúng bằng nhau, điền dấu bằng: 8 = 8.'
  }]
]);

// Hai câu chỉ hỏng ở một phương án, giữ nguyên đề và các phương án còn lại.
const THAY_MOT_PHUONG_AN = new Map([
  [5720, { cu: 'Thực hiện ít hơn yêu cầu một đơn vị', moi: 'Chỉ khi ghi thêm chữ số 0 vào ô' }],
  [6456, { cu: 'Thực hiện ít hơn yêu cầu một đơn vị', moi: 'Chưa đủ dữ kiện để so sánh' }]
]);

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

// H?m layCau d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function layCau(id) {
  const rows = await db.query(
    'SELECT q.id, q.content, q.choices, q.correct_answer, q.explanation, l.lesson_name '
    + 'FROM QuestionBank q JOIN Lessons l ON l.id = q.lesson_id WHERE q.id = ?',
    [id]
  );
  return rows[0] || null;
}

// H?m kiemTraTrung d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function kiemTraTrung(id, choices) {
  const chuan = choices.map((c) => String(c.text || '').trim().toLowerCase().replace(/[.;]+$/, ''));
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (new Set(chuan).size !== chuan.length) {
    throw new Error(`id ${id}: bộ phương án mới còn hai phương án giống nhau.`);
  }
}

// H?m main d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function main() {
  const baoCao = [];

  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const [id, muc] of THAY_MOI) {
    const row = await layCau(id);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!row) {
      console.log(`  BỎ QUA id ${id}: không còn trong cơ sở dữ liệu`);
      continue;
    }
    const content = parseJson(row.content, {}) || {};
    const choicesCu = parseJson(row.choices, []) || [];
    const explanation = parseJson(row.explanation, {}) || {};

    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (muc.pa.length !== 4) throw new Error(`id ${id}: cần đúng 4 phương án.`);
    const choicesMoi = muc.pa.map((text, i) => ({ key: NHAN[i], text, images: [] }));
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!choicesMoi.some((c) => c.key === muc.dap)) {
      throw new Error(`id ${id}: đáp án ${muc.dap} không có trong bộ phương án mới.`);
    }
    kiemTraTrung(id, choicesMoi);

    baoCao.push({
      id, loai: 'thay_moi', bai_hoc: row.lesson_name,
      de_cu: String(content.text || ''), de_moi: muc.de,
      phuong_an_cu: choicesCu.map((c) => `${c.key}. ${c.text}`),
      phuong_an_moi: choicesMoi.map((c) => `${c.key}. ${c.text}`),
      so_phuong_an_cu: choicesCu.length, so_phuong_an_moi: 4,
      dap_an_cu: row.correct_answer, dap_an_moi: muc.dap, loi_giai_moi: muc.giai
    });

    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (COMMIT) {
      await db.query(
        'UPDATE QuestionBank SET content = CAST(? AS JSON), choices = CAST(? AS JSON), '
        + 'correct_answer = ?, explanation = CAST(? AS JSON) WHERE id = ?',
        [
          JSON.stringify({ ...content, text: muc.de, images: [] }),
          JSON.stringify(choicesMoi), muc.dap,
          JSON.stringify({ ...explanation, text: muc.giai }), id
        ]
      );
    }
  }

  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const [id, muc] of THAY_MOT_PHUONG_AN) {
    const row = await layCau(id);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!row) continue;
    const content = parseJson(row.content, {}) || {};
    const choices = parseJson(row.choices, []) || [];
    const viTri = choices.findIndex((c) => String(c.text || '').trim() === muc.cu);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (viTri === -1) {
      console.log(`  BỎ QUA id ${id}: không tìm thấy phương án "${muc.cu}"`);
      continue;
    }
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (choices[viTri].key === row.correct_answer) {
      throw new Error(`id ${id}: phương án cần thay lại đang là đáp án đúng.`);
    }
    const choicesMoi = choices.map((c, i) => (i === viTri ? { ...c, text: muc.moi } : c));
    kiemTraTrung(id, choicesMoi);

    baoCao.push({
      id, loai: 'thay_mot_phuong_an', bai_hoc: row.lesson_name,
      de_cu: String(content.text || ''), de_moi: String(content.text || ''),
      phuong_an_cu: choices.map((c) => `${c.key}. ${c.text}`),
      phuong_an_moi: choicesMoi.map((c) => `${c.key}. ${c.text}`),
      dap_an_cu: row.correct_answer, dap_an_moi: row.correct_answer
    });

    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (COMMIT) {
      await db.query('UPDATE QuestionBank SET choices = CAST(? AS JSON) WHERE id = ?',
        [JSON.stringify(choicesMoi), id]);
    }
  }

  const thayMoi = baoCao.filter((b) => b.loai === 'thay_moi');
  console.log(`Thay mới hoàn toàn:      ${thayMoi.length}`);
  console.log(`  nâng từ 3 lên 4 phương án: ${thayMoi.filter((b) => b.so_phuong_an_cu === 3).length}`);
  console.log(`Chỉ thay một phương án:  ${baoCao.length - thayMoi.length}`);

  baoCao.forEach((b) => {
    console.log(`\n  id ${b.id} [${b.bai_hoc}]`);
    console.log(`    đề cũ : ${b.de_cu}`);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (b.loai === 'thay_moi') console.log(`    đề mới: ${b.de_moi}`);
    console.log(`    pa cũ : ${b.phuong_an_cu.join(' | ')}  -> ${b.dap_an_cu}`);
    console.log(`    pa mới: ${b.phuong_an_moi.join(' | ')}  -> ${b.dap_an_moi}`);
  });

  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (COMMIT) {
    console.log(`\nĐã cập nhật MySQL: ${baoCao.length} câu.`);
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
