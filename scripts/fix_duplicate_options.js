// Script fix duplicate options h? tr? nh?p, xu?t, ki?m tra ho?c b?o tr? d? li?u v? c?u h?nh c?a d? ?n.
/**
 * Sửa các câu hỏi lớp 1 có HAI phương án cùng đúng.
 *
 * LỖI: bộ phương án chứa đáp án đúng lặp hai lần, một bản viết đầy đủ kèm đơn vị
 * và một bản viết trần. Ví dụ câu 6640 có A "90 quyển vở." được chấm đúng còn B
 * "90" cũng đúng y hệt về nội dung. Học sinh chọn B là chọn đúng nhưng bị chấm
 * sai. Dạng lặp theo chữ cũng gặp nhiều: C "Chiếc thang màu xanh dương." và D
 * "Màu xanh dương" cùng chỉ một chiếc thang.
 *
 * CÁCH SỬA: giữ nguyên nhãn đang được chấm đúng, thay phương án bị lặp bằng một
 * phương án sai hợp lý, đồng thời chuẩn hoá cả bốn phương án về cùng một cách
 * viết để học sinh không phải đoán ý người ra đề. Không câu nào đổi đáp án nên
 * không ảnh hưởng tới bài đã làm của học sinh.
 *
 * Các phương án sai được chọn theo lỗi học sinh hay mắc chứ không lấy số bất kỳ:
 * quên nhân chục (5 chục + 4 chục ra 9), cộng thay vì trừ, lệch một đơn vị.
 *
 * Dùng:
 *   node scripts/fix_duplicate_options.js            -> xem trước
 *   node scripts/fix_duplicate_options.js --commit   -> ghi vào MySQL
 *
 * Sau khi chạy phải chạy tiếp scripts/resync_tex_from_db.js --commit để file .tex
 * khớp lại với MySQL.
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const db = require('../config/db');

const COMMIT = process.argv.includes('--commit');
const ROOT = path.join(__dirname, '..');
const BAO_CAO = path.join(ROOT, 'tmp', 'bao_cao_trung_phuong_an.json');

/**
 * Mỗi mục: id -> { dap, pa }.
 *   dap: nhãn đáp án đúng, luôn trùng với nhãn đang có trong dữ liệu.
 *   pa : bộ bốn phương án mới theo đúng thứ tự A, B, C, D.
 * Script tự dừng nếu dap khác với đáp án đang lưu, để không lỡ tay đổi đáp án.
 */
const SUA = new Map([
  // ---- Câu còn ảnh minh họa: chỉ chỉnh phương án, không đụng đề và ảnh ----
  [6442, { dap: 'C', pa: ['Màu vàng', 'Màu xanh lá', 'Màu xanh dương', 'Ba chiếc thang cao bằng nhau'] }],
  [6575, { dap: 'D', pa: ['14 chấm', '16 chấm', '19 chấm', '15 chấm'] }],
  [6466, { dap: 'C', pa: ['4 khối vuông', '6 khối vuông', '5 khối vuông', '7 khối vuông'] }],
  [6579, { dap: 'A', pa: ['12 ngọn nến', '10 ngọn nến', '14 ngọn nến', '20 ngọn nến'] }],
  [6470, { dap: 'A', pa: ['8 que nhỏ', '9 que nhỏ', '7 que nhỏ', '10 que nhỏ'] }],
  [6624, { dap: 'B', pa: ['30 que', '40 que', '14 que', '4 que'] }],
  [6518, { dap: 'B', pa: ['17 chong chóng', '18 chong chóng', '19 chong chóng', '12 chong chóng'] }],
  [6628, { dap: 'A', pa: ['50 quyển sách', '15 quyển sách', '5 quyển sách', '60 quyển sách'] }],
  [6434, { dap: 'D', pa: ['Hai cây dài bằng nhau', 'Cây bút chì phía dưới', 'Chưa đủ dữ kiện để so sánh', 'Cây bút chì phía trên'] }],
  [6632, { dap: 'C', pa: ['5 đơn vị', '23 đơn vị', '50 đơn vị', '30 đơn vị'] }],
  [6438, { dap: 'D', pa: ['Ba dải dài bằng nhau', 'Màu vàng', 'Màu xanh', 'Màu đỏ'] }],
  [6526, { dap: 'B', pa: ['11 chấm', '17 chấm', '16 chấm', '18 chấm'] }],
  [6571, { dap: 'B', pa: ['22 người', '14 người', '12 người', '15 người'] }],
  [6462, { dap: 'A', pa: ['6 chiếc kẹp giấy', '5 chiếc kẹp giấy', '7 chiếc kẹp giấy', '4 chiếc kẹp giấy'] }],

  // ---- Đề tự đủ dữ kiện, đáp án là số kèm đơn vị ----
  [6640, { dap: 'A', pa: ['90 quyển vở', '54 quyển vở', '9 quyển vở', '80 quyển vở'] }],
  [6641, { dap: 'A', pa: ['50 hộp sữa', '110 hộp sữa', '5 hộp sữa', '60 hộp sữa'] }],
  [6642, { dap: 'A', pa: ['80 quả cam', '40 quả cam', '100 quả cam', '26 quả cam'] }],
  [6643, { dap: 'A', pa: ['50 quả bóng', '90 quả bóng', '30 quả bóng', '70 quả bóng'] }],
  [6648, { dap: 'A', pa: ['80 cây', '20 cây', '35 cây', '90 cây'] }],
  [6534, { dap: 'C', pa: ['8 chiếc bút màu', '14 chiếc bút màu', '16 chiếc bút màu', '18 chiếc bút màu'] }],
  [6535, { dap: 'C', pa: ['9 quả bóng', '15 quả bóng', '19 quả bóng', '18 quả bóng'] }],
  [6536, { dap: 'D', pa: ['4 khối lập phương', '19 khối lập phương', '17 khối lập phương', '18 khối lập phương'] }],
  [6542, { dap: 'A', pa: ['18 bạn', '8 bạn', '17 bạn', '19 bạn'] }],
  [6587, { dap: 'C', pa: ['13 con cá', '17 con cá', '15 con cá', '19 con cá'] }],
  [6588, { dap: 'C', pa: ['22 quyển truyện', '15 quyển truyện', '14 quyển truyện', '12 quyển truyện'] }],
  [6589, { dap: 'D', pa: ['18 quả bóng', '10 quả bóng', '13 quả bóng', '12 quả bóng'] }],
  [6595, { dap: 'A', pa: ['11 chiếc bánh', '21 chiếc bánh', '10 chiếc bánh', '12 chiếc bánh'] }],
  [6480, { dap: 'A', pa: ['8 khối vuông', '6 khối vuông', '7 khối vuông', '4 khối vuông'] }],
  [6481, { dap: 'B', pa: ['12 que tính', '6 que tính', '3 que tính', '7 que tính'] }],
  [6485, { dap: 'C', pa: ['1 khối', '18 khối', '2 khối', '8 khối'] }],
  [6483, { dap: 'B', pa: ['13 que tính', '7 que tính', 'Cả 6 và 7 đều là số đo chính xác', '6 que tính'] }],

  // ---- Đáp án là một câu chữ, phương án lặp về nghĩa ----
  [6443, { dap: 'B', pa: ['Hai cây cao bằng nhau', 'Cây non A', 'Chưa đủ dữ kiện để so sánh', 'Cây non B'] }],
  [6444, { dap: 'C', pa: ['Bạn An', 'Bạn Bình', 'Bạn Chi', 'Ba bạn cao bằng nhau'] }],
  [6465, { dap: 'B', pa: ['Chồng các khối lên nhau', 'Xếp các khối sát nhau, không chồng lên nhau và bắt đầu từ một đầu vật', 'Bắt đầu xếp từ giữa vật', 'Để nhiều khoảng trống giữa các khối'] }],
  [6511, { dap: 'C', pa: ['Bình đo được số lớn hơn', 'Không so sánh được hai kết quả', 'Hai bạn có cùng kết quả đo', 'An đo được số lớn hơn'] }],
  [6446, { dap: 'A', pa: ['Dải A dài hơn dải B', 'Dải B dài hơn dải A', 'Hai dải dài bằng nhau', 'Chưa đủ dữ kiện để so sánh'] }],
  [6469, { dap: 'B', pa: ['Mỗi chiếc đo bằng một đơn vị khác nhau', 'Đo cả hai chiếc bằng cùng một đơn vị', 'Chỉ nhìn màu bút rồi đoán', 'Chỉ cần đo một chiếc là đủ'] }],
  [6472, { dap: 'D', pa: ['Dùng kẹp giấy', 'Dùng hạt đậu', 'Dùng hạt gạo', 'Dùng bước chân'] }],
  [6474, { dap: 'A', pa: ['Chiếc bàn', 'Chiếc ghế', 'Hai vật dài bằng nhau', 'Chưa đủ dữ kiện để so sánh'] }],
  [6476, { dap: 'B', pa: ['Số đo thường nhỏ hơn', 'Số đo thường lớn hơn', 'Số đo luôn bằng 1', 'Số đo không thay đổi'] }],
  [6482, { dap: 'C', pa: ['Bút B dài hơn bút A', 'Bút A dài hơn bút B', 'Hai bút dài bằng nhau', 'Chưa đủ dữ kiện để so sánh'] }],
  [6484, { dap: 'D', pa: ['Gập đôi sợi dây', 'Cuộn sợi dây lại cho nhỏ', 'Cắt sợi dây thành nhiều đoạn', 'Duỗi thẳng sợi dây'] }],
  [6503, { dap: 'B', pa: ['Đúng, bút dài 6 cm', 'Không đúng, bút dài 5 cm', 'Không đúng, bút dài 4 cm', 'Không đúng, bút dài 7 cm'] }],
  [6506, { dap: 'B', pa: ['Dải dài 6 cm', 'Dải dài 3 cm', 'Ba dải dài bằng nhau', 'Dải dài 8 cm'] }],
  [6645, { dap: 'D', pa: ['Bạn An', 'Bạn Bình', 'Cả ba bạn đều tính đúng', 'Bạn Chi'] }],
  [6539, { dap: 'A', pa: ['Bạn Chi', 'Cả ba bạn đều tính đúng', 'Bạn Bình', 'Bạn An'] }],
  [6592, { dap: 'C', pa: ['Bạn An', 'Bạn Bình', 'Bạn Chi', 'Cả ba bạn đều tính đúng'] }],

  // "Sáu mươi tư" và "Sáu mươi bốn" đều là cách đọc đúng của 64 trong tiếng Việt
  // nên phải bỏ một trong hai, không phải sửa nhãn đáp án.
  [6342, { dap: 'A', pa: ['Sáu mươi tư', 'Bốn mươi sáu', 'Sáu mươi', 'Bốn mươi tư'] }],

  // Số 0 nằm ngay đầu mút nên cũng thuộc khoảng từ 0 đến 100, thành hai đáp án đúng.
  [6235, { dap: 'B', pa: ['110', '60', '102', '105'] }],

  // ---- Lỗi cùng loại ở khối lớp khác, tìm ra bằng scan_equivalent_options.js ----

  // C và D chỉ khác nhau ở chữ "Có" ở đầu câu, nội dung y hệt.
  [11184, { dap: 'D', pa: ['Có hai đường chéo', 'Có một góc nhọn', 'Có bốn cạnh bằng nhau', 'Hai cặp cạnh đối diện song song và bằng nhau'] }],

  // Phương án bỏ đơn vị kg nhưng vẫn là cùng một kết quả. Thay bằng lỗi hay gặp:
  // nhớ nhầm bảng nhân, hoặc cộng thay vì nhân, hoặc nhân thay vì chia.
  [14302, { dap: 'B', pa: ['10 kg', '16 kg', '14 kg', '18 kg'] }],
  [14345, { dap: 'A', pa: ['20 kg', '25 kg', '9 kg', '125 kg'] }],
  [14559, { dap: 'A', pa: ['5 kg', '30 kg', '20 kg', '125 kg'] }]
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

const NHAN = ['A', 'B', 'C', 'D'];

// H?m main d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function main() {
  const baoCao = [];
  let daSua = 0;

  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const [id, muc] of SUA) {
    const rows = await db.query(
      'SELECT q.id, q.content, q.choices, q.correct_answer, l.lesson_name '
      + 'FROM QuestionBank q JOIN Lessons l ON l.id = q.lesson_id WHERE q.id = ?',
      [id]
    );
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (rows.length === 0) {
      console.log(`  BỎ QUA id ${id}: không còn trong cơ sở dữ liệu`);
      continue;
    }

    const row = rows[0];
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (row.correct_answer !== muc.dap) {
      throw new Error(
        `id ${id}: bảng sửa ghi đáp án ${muc.dap} nhưng dữ liệu đang là ${row.correct_answer}. `
        + 'Dừng lại vì script này không được phép đổi đáp án.'
      );
    }
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (muc.pa.length !== 4) {
      throw new Error(`id ${id}: cần đúng 4 phương án, đang có ${muc.pa.length}.`);
    }

    const content = parseJson(row.content, {}) || {};
    const choicesCu = parseJson(row.choices, []) || [];
    const choicesMoi = muc.pa.map((text, i) => ({ key: NHAN[i], text, images: [] }));

    // Chốt chặn: sau khi sửa không được còn hai phương án trùng nội dung.
    const chuan = choicesMoi.map((c) => c.text.trim().toLowerCase().replace(/[.;]+$/, ''));
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (new Set(chuan).size !== chuan.length) {
      throw new Error(`id ${id}: bộ phương án mới vẫn còn hai phương án giống nhau.`);
    }

    baoCao.push({
      id: row.id,
      bai_hoc: row.lesson_name,
      de_bai: String(content.text || ''),
      con_anh: (content.images || []).length > 0,
      phuong_an_cu: choicesCu.map((c) => `${c.key}. ${c.text}`),
      phuong_an_moi: choicesMoi.map((c) => `${c.key}. ${c.text}`),
      dap_an: muc.dap,
      dap_an_cu_noi_dung: (choicesCu.find((c) => c.key === muc.dap) || {}).text || '',
      dap_an_moi_noi_dung: choicesMoi.find((c) => c.key === muc.dap).text
    });

    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (COMMIT) {
      await db.query(
        'UPDATE QuestionBank SET choices = CAST(? AS JSON) WHERE id = ?',
        [JSON.stringify(choicesMoi), row.id]
      );
      daSua += 1;
    }
  }

  console.log(`Câu cần sửa:        ${SUA.size}`);
  console.log(`Câu dựng được:      ${baoCao.length}`);
  console.log(`  Còn ảnh minh họa: ${baoCao.filter((b) => b.con_anh).length}`);

  // Cảnh báo nếu nội dung đáp án đúng bị đổi, vì như vậy là đổi đáp án trá hình.
  const doiNoiDung = baoCao.filter((b) => {
    const cu = b.dap_an_cu_noi_dung.trim().toLowerCase().replace(/[.;]+$/, '');
    const moi = b.dap_an_moi_noi_dung.trim().toLowerCase().replace(/[.;]+$/, '');
    return cu !== moi;
  });
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (doiNoiDung.length) {
    console.log(`\nCẢNH BÁO: ${doiNoiDung.length} câu có nội dung đáp án đúng thay đổi:`);
    doiNoiDung.forEach((b) => console.log(`  id ${b.id}: "${b.dap_an_cu_noi_dung}" -> "${b.dap_an_moi_noi_dung}"`));
  } else {
    console.log('  Nội dung đáp án đúng: giữ nguyên ở cả 100% số câu');
  }

  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (COMMIT) {
    console.log(`\nĐã cập nhật MySQL: ${daSua} câu.`);
    console.log('Nhớ chạy tiếp: node scripts/resync_tex_from_db.js --commit');
  } else {
    console.log('\nĐây là bản xem trước. Thêm --commit để ghi thật.');
    baoCao.slice(0, 3).forEach((b) => {
      console.log(`\n  id ${b.id}  ${b.de_bai.slice(0, 70)}`);
      console.log(`    cũ : ${b.phuong_an_cu.join(' | ')}`);
      console.log(`    mới: ${b.phuong_an_moi.join(' | ')}   -> ${b.dap_an}`);
    });
  }

  fs.writeFileSync(BAO_CAO, JSON.stringify(baoCao, null, 1), 'utf8');
  console.log(`  Báo cáo: ${path.relative(ROOT, BAO_CAO)}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Thất bại:', error.message);
    process.exit(1);
  });
