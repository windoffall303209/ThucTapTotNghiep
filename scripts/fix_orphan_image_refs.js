// Script fix orphan image refs h? tr? nh?p, xu?t, ki?m tra ho?c b?o tr? d? li?u v? c?u h?nh c?a d? ?n.
/**
 * Dọn các câu hỏi còn nhắc tới tranh, hình mà câu không còn ảnh nào.
 *
 * Nguồn: scripts/health_check_question_bank.js báo 39 câu thuộc dạng này. Kiểm
 * tay từng câu thì chia ra bốn nhóm, mỗi nhóm xử lý một kiểu.
 *
 * NHÓM 1 - BỎ TIỀN TỐ. Đề đã nêu đủ số liệu bằng chữ, phần nhắc tới tranh chỉ là
 * câu dẫn thừa. Ví dụ "Trong tranh có hai nhóm quả dâu, một nhóm có 2 và một nhóm
 * có 3" bỏ hai chữ "Trong tranh" là dùng được ngay. Không đụng phương án, không
 * đụng đáp án.
 *
 * NHÓM 2 - VIẾT LẠI ĐỀ. Đề phụ thuộc hoàn toàn vào ảnh đã gỡ. Số liệu trong đề
 * mới lấy từ chính bản kiểm chứng ảnh trước đây nên đáp án cũ vẫn đúng.
 *
 * Riêng hai câu lớp 4 hỏng theo kiểu khác, đáng ghi lại:
 *   - Câu 10890 có đề bài chính là GHI CHÚ của người sửa dữ liệu bị lọt vào:
 *     "Sửa số trong ảnh thành 214 267 742 km cho khớp lời giải, hoặc giữ ảnh và
 *     viết lại: ...". Đã tính lại bằng tay để biết con số nào mới đúng: lấy
 *     a = 214 267 742 thì tổng ra 364 253 868, khớp phương án B đang được chấm;
 *     lấy a = 214 261 742 thì ra 364 247 868, không có trong phương án nào. Vậy
 *     đề đúng phải dùng 214 267 742.
 *   - Câu 10932 có đề in luôn cả bốn phương án lẫn dòng "(Đáp án D)", học sinh
 *     đọc đề là thấy ngay đáp án.
 *
 * NHÓM 3 - THAY MỚI. Đề là câu lệnh thao tác trên giấy như "Tô màu xanh các hình
 * chữ nhật trong ảnh", hoặc hỏi về một đồ vật chỉ có trong ảnh đã gỡ.
 *
 * NHÓM 4 - BÁO NHẦM, GIỮ NGUYÊN. 15 câu hình học dạng "Trong hình chữ nhật ABCD,
 * AB vuông góc với cạnh nào?". Chữ "hình" ở đây là ký hiệu hình học chứ không
 * phải tranh minh họa, đề tự đủ nghĩa. Bộ dò trong health_check bắt theo từ khoá
 * nên báo lên, nhưng không cần sửa gì.
 *
 * Kèm theo: sửa 8 lời giải chỉ chép lại đáp án theo mẫu "Dựa vào dữ kiện của câu
 * hỏi, đáp án đúng là X". Ba trong số đó còn ghi đáp án CŨ từ trước đợt sửa đáp
 * án, tức lời giải đang mâu thuẫn với chính đáp án được chấm.
 *
 * Dùng:
 *   node scripts/fix_orphan_image_refs.js            -> xem trước
 *   node scripts/fix_orphan_image_refs.js --commit   -> ghi vào MySQL
 *
 * Sau khi chạy phải chạy tiếp scripts/resync_tex_from_db.js --commit.
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const db = require('../config/db');

const COMMIT = process.argv.includes('--commit');
const ROOT = path.join(__dirname, '..');
const BAO_CAO = path.join(ROOT, 'tmp', 'bao_cao_go_nhac_anh.json');

const NHAN = ['A', 'B', 'C', 'D'];

// Nhóm 1: chỉ cắt phần câu dẫn nhắc tới tranh ở đầu đề.
const BO_TIEN_TO = [
  5831, 5834, 5839, 5862, 5863, 5867, 5872, 5900, 5901,
  5961, 5994, 5996, 5999, 6396, 9533, 9727, 14657
];

const MAU_TIEN_TO = [
  /^Quan sát tranh rồi\s*/iu,
  /^Quan sát tranh[:.]\s*/iu,
  /^Quan sát hình minh họa[:.]\s*/iu,
  /^Quan sát hình[:.]\s*/iu,
  /^Trong tranh\s+(?=có)/iu,
  /^Dùng các khối biểu diễn số như trong ảnh[:.]\s*/iu
];

// H?m boTienTo d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function boTienTo(de) {
  let ra = String(de || '').trim();
  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const mau of MAU_TIEN_TO) {
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (mau.test(ra)) {
      ra = ra.replace(mau, '').trim();
      break;
    }
  }
  // Viết hoa lại chữ đầu sau khi cắt.
  return ra.charAt(0).toUpperCase() + ra.slice(1);
}

// Nhóm 2: viết lại đề, giữ nguyên phương án và đáp án.
const VIET_LAI_DE = new Map([
  [5896, {
    de: 'Trong vườn có 3 con bướm đang đậu trên hoa, 2 con bướm khác bay tới. '
      + 'Hỏi trong vườn có tất cả bao nhiêu con bướm?',
    giai: 'Lúc đầu có 3 con bướm, sau đó thêm 2 con nữa bay tới. Tất cả có 3 + 2 = 5 con bướm.'
  }],
  [6056, {
    de: 'Trên đĩa có 6 quả táo. Bạn nhỏ lấy đi 1 quả. Hỏi trên đĩa còn lại bao nhiêu quả táo?',
    giai: 'Trên đĩa có 6 quả táo, lấy đi 1 quả. Số táo còn lại là 6 - 1 = 5 quả.'
  }],
  [10890, {
    de: 'Cho a = 214 267 742 km, b = 384 400 km, c = 1 726 km, d = 149 600 000 km. '
      + 'Tính a + b + c + d.',
    giai: 'Cộng lần lượt từng số: 214 267 742 + 384 400 = 214 652 142; '
      + '214 652 142 + 1 726 = 214 653 868; 214 653 868 + 149 600 000 = 364 253 868. '
      + 'Vậy a + b + c + d = 364 253 868 km.'
  }],
  [10932, {
    de: 'Có 10 ngôi sao, trong đó 6 ngôi sao được tô màu vàng. '
      + 'Phân số chỉ số ngôi sao màu vàng là:',
    giai: 'Tổng số ngôi sao là 10 nên mẫu số là 10. Số ngôi sao màu vàng là 6 nên tử số là 6. '
      + 'Phân số cần tìm là 6/10.'
  }]
]);

// Nhóm 3: thay mới toàn bộ câu hỏi.
const THAY_MOI = new Map([
  [5573, {
    de: 'Mặt bàn học của em có dạng hình chữ nhật. Vật nào dưới đây cũng có mặt dạng hình chữ nhật?',
    pa: ['Cái đĩa ăn cơm', 'Quyển vở', 'Chiếc khăn quàng đỏ', 'Đồng xu'],
    dap: 'B',
    giai: 'Quyển vở có mặt là hình chữ nhật. Cái đĩa và đồng xu có mặt hình tròn, '
      + 'chiếc khăn quàng đỏ có dạng hình tam giác.',
    vi: 'Đề cũ "Nối mỗi đồ vật với hình phù hợp trong ảnh." là câu lệnh nối trên giấy, '
      + 'không có lời đáp, lại không còn ảnh nào.'
  }],
  [5578, {
    de: 'Cửa sổ lớp em có dạng hình chữ nhật. Hình chữ nhật có mấy cạnh?',
    pa: ['3 cạnh', '4 cạnh', '5 cạnh', '6 cạnh'],
    dap: 'B',
    giai: 'Hình chữ nhật có 4 cạnh: hai cạnh dài bằng nhau và hai cạnh ngắn bằng nhau.',
    vi: 'Đề cũ "Tô màu xanh các hình chữ nhật trong ảnh." là câu lệnh tô màu, '
      + 'không có lời đáp, lại không còn ảnh nào.'
  }],
  [11181, {
    de: 'Trong các hình dưới đây, hình nào luôn là một hình bình hành?',
    pa: ['Hình thang', 'Hình chữ nhật', 'Hình tam giác', 'Hình tròn'],
    dap: 'B',
    giai: 'Hình chữ nhật có hai cặp cạnh đối diện song song và bằng nhau nên luôn là hình '
      + 'bình hành. Hình thang chỉ có một cặp cạnh song song, hình tam giác có ba cạnh, '
      + 'hình tròn không có cạnh nào.',
    vi: 'Đề cũ hỏi "đồ vật nào ở bên phải có dạng hình bình hành rõ nhất" với các phương án '
      + 'là tấm lót bàn, ngọn đồi, đám mây trong ảnh; ảnh đã bị gỡ nên không còn căn cứ nào.'
  }]
]);

// Lời giải chỉ chép lại đáp án. Ba câu 6056, 6145, 6205 còn ghi đáp án cũ.
const LOI_GIAI = new Map([
  [5995, 'Trong bể có 5 con cá vàng và 4 con cá bảy màu. Số cá trong bể là 5 + 4 = 9 con.'],
  [6000, 'Trong hộp đã có 5 chiếc bút, bỏ thêm 3 chiếc nữa thì có 5 + 3 = 8 chiếc bút màu.'],
  [6093, 'Trong bể có 6 con cá, người ta vớt ra 3 con. Số cá còn lại là 6 - 3 = 3 con.'],
  [6145, 'Có 4 bạn và không bạn nào rời hàng, tức là bớt đi 0 bạn. Phép tính là 4 - 0 = 4. '
    + 'Trừ đi 0 thì số lượng không thay đổi, nên số bạn còn lại đúng bằng 4, '
    + 'không nhiều hơn cũng không ít hơn.'],
  [6187, 'Có 9 chú gà con, 2 chú chạy sang chỗ khác. Muốn tìm số gà còn lại thì lấy 9 trừ đi 2, '
    + 'được phép tính 9 - 2 = 7.'],
  [6195, 'Có 7 chú mèo con, 3 chú chạy đi chỗ khác. Số mèo còn lại là 7 - 3 = 4 chú.'],
  [6205, 'Có 6 bạn và không bạn nào rời hàng, tức là bớt đi 0 bạn. Phép tính là 6 - 0 = 6. '
    + 'Trừ đi 0 thì số lượng không thay đổi, nên số bạn còn lại đúng bằng 6, '
    + 'không nhiều hơn cũng không ít hơn.']
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

// H?m main d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function main() {
  const baoCao = [];

  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const id of BO_TIEN_TO) {
    const row = await layCau(id);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!row) continue;
    const content = parseJson(row.content, {}) || {};
    const deCu = String(content.text || '');
    const deMoi = boTienTo(deCu);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (deMoi === deCu) {
      console.log(`  CHÚ Ý id ${id}: không cắt được tiền tố nào khỏi "${deCu.slice(0, 50)}"`);
      continue;
    }
    baoCao.push({ id, loai: 'bo_tien_to', bai_hoc: row.lesson_name, de_cu: deCu, de_moi: deMoi });
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (COMMIT) {
      await db.query(
        'UPDATE QuestionBank SET content = CAST(? AS JSON) WHERE id = ?',
        [JSON.stringify({ ...content, text: deMoi }), id]
      );
    }
  }

  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const [id, muc] of VIET_LAI_DE) {
    const row = await layCau(id);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!row) continue;
    const content = parseJson(row.content, {}) || {};
    const explanation = parseJson(row.explanation, {}) || {};
    baoCao.push({
      id, loai: 'viet_lai_de', bai_hoc: row.lesson_name,
      de_cu: String(content.text || ''), de_moi: muc.de,
      dap_an: row.correct_answer, loi_giai_moi: muc.giai
    });
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (COMMIT) {
      await db.query(
        'UPDATE QuestionBank SET content = CAST(? AS JSON), explanation = CAST(? AS JSON) WHERE id = ?',
        [
          JSON.stringify({ ...content, text: muc.de, images: [] }),
          JSON.stringify({ ...explanation, text: muc.giai }),
          id
        ]
      );
    }
  }

  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const [id, muc] of THAY_MOI) {
    const row = await layCau(id);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!row) continue;
    const content = parseJson(row.content, {}) || {};
    const choicesCu = parseJson(row.choices, []) || [];
    const explanation = parseJson(row.explanation, {}) || {};
    const choicesMoi = muc.pa.map((text, i) => ({ key: NHAN[i], text, images: [] }));
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!choicesMoi.some((c) => c.key === muc.dap)) {
      throw new Error(`id ${id}: đáp án ${muc.dap} không có trong bộ phương án mới.`);
    }
    baoCao.push({
      id, loai: 'thay_moi', bai_hoc: row.lesson_name, ly_do_thay: muc.vi,
      de_cu: String(content.text || ''), de_moi: muc.de,
      phuong_an_cu: choicesCu.map((c) => `${c.key}. ${c.text}`),
      phuong_an_moi: choicesMoi.map((c) => `${c.key}. ${c.text}`),
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
  for (const [id, giai] of LOI_GIAI) {
    const row = await layCau(id);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!row) continue;
    const explanation = parseJson(row.explanation, {}) || {};
    baoCao.push({
      id, loai: 'sua_loi_giai', bai_hoc: row.lesson_name,
      loi_giai_cu: String(explanation.text || ''), loi_giai_moi: giai
    });
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (COMMIT) {
      await db.query(
        'UPDATE QuestionBank SET explanation = CAST(? AS JSON) WHERE id = ?',
        [JSON.stringify({ ...explanation, text: giai }), id]
      );
    }
  }

  // H?m dem d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  const dem = (loai) => baoCao.filter((b) => b.loai === loai).length;
  console.log(`Bỏ tiền tố nhắc ảnh: ${dem('bo_tien_to')}`);
  console.log(`Viết lại đề:         ${dem('viet_lai_de')}`);
  console.log(`Thay mới:            ${dem('thay_moi')}`);
  console.log(`Sửa lời giải:        ${dem('sua_loi_giai')}`);

  baoCao.filter((b) => b.loai === 'bo_tien_to').slice(0, 4).forEach((b) => {
    console.log(`\n  id ${b.id}`);
    console.log(`    cũ : ${b.de_cu}`);
    console.log(`    mới: ${b.de_moi}`);
  });
  baoCao.filter((b) => b.loai !== 'bo_tien_to' && b.loai !== 'sua_loi_giai').forEach((b) => {
    console.log(`\n  id ${b.id} [${b.loai}] ${b.bai_hoc}`);
    console.log(`    cũ : ${b.de_cu}`);
    console.log(`    mới: ${b.de_moi}`);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (b.phuong_an_moi) console.log(`    ${b.phuong_an_moi.join(' | ')}  -> ${b.dap_an_moi}`);
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
