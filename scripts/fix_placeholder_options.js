/**
 * Thay phương án giữ chỗ "Kết quả ngược lại với đáp án đúng" bằng phương án thật.
 *
 * VÌ SAO PHẢI SỬA: chuỗi này là ghi chú của công cụ sinh dữ liệu bị lọt vào ngân
 * hàng câu hỏi, xuất hiện ở 69 câu lớp 1 và không bao giờ là đáp án đúng. Học sinh
 * đọc thấy nó là biết ngay đây không phải đáp án, nên câu bốn phương án thực chất
 * chỉ còn ba, câu ba phương án chỉ còn hai. Xác suất đoán mò tăng từ 25 lên 33
 * phần trăm, và với câu ba phương án thì lên 50 phần trăm.
 *
 * CÁCH SỬA: giữ nguyên số lượng phương án và nhãn đáp án đúng, chỉ viết lại nội
 * dung của đúng phương án giữ chỗ. Phương án mới phải là một câu trả lời sai
 * nhưng hợp lý, tức là học sinh hiểu sai bài thì có thể chọn nó. Ví dụ với câu
 * "Nhóm A có 3 vật, nhóm B có 5 vật. Nhóm nào nhiều hơn?" thì phương án mới là
 * "Chưa đủ dữ kiện để so sánh"; với câu hỏi cách đọc số 3 thì phương án mới là
 * một cách đọc số khác.
 *
 * Việc nâng các câu ba phương án lên đủ bốn phương án là việc riêng, không gộp
 * vào đây, để đợt này chỉ đụng đúng một ô dữ liệu mỗi câu.
 *
 * Dùng:
 *   node scripts/fix_placeholder_options.js            -> xem trước
 *   node scripts/fix_placeholder_options.js --commit   -> ghi vào MySQL
 *
 * Sau khi chạy phải chạy tiếp scripts/resync_tex_from_db.js --commit.
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const db = require('../config/db');

const COMMIT = process.argv.includes('--commit');
const ROOT = path.join(__dirname, '..');
const BAO_CAO = path.join(ROOT, 'tmp', 'bao_cao_phuong_an_giu_cho.json');

const GIU_CHO = 'Kết quả ngược lại với đáp án đúng';

// id câu hỏi -> nội dung mới cho đúng phương án giữ chỗ của câu đó.
const THAY = new Map([
  // Bài 1: vị trí trên dưới, phải trái, trước sau, ở giữa
  [5547, 'Cả Lan và Mai'],
  [5550, 'Không có bạn nào ở giữa'],
  // Không dùng "Hai vật cao bằng nhau" vì câu này đã sẵn phương án "Cả hai",
  // hai câu đó cùng diễn đạt ý bằng nhau nên lại thành trùng nghĩa.
  [5552, 'Chưa đủ dữ kiện để so sánh'],
  [5553, 'Chỉ Phúc'],
  [5557, 'Rẽ phải'],
  [5558, 'Linh, Vy, Hà'],
  [5559, 'Không xác định được'],
  [5560, 'Rẽ trái'],
  [5561, 'Không có nhà nào ở giữa'],

  // Bài 2: hình vuông, hình tròn, hình tam giác, hình chữ nhật
  [5569, 'vuông'],
  [5591, 'Thành hình chữ nhật'],

  // Các bài về đọc số
  [5623, 'năm'],
  [5655, 'tám'],
  [5687, 'bảy'],
  [5745, 'mười một'],

  // Bài 9: nhiều hơn, ít hơn, bằng nhau
  [5775, 'Chưa đủ dữ kiện để so sánh'],
  [5776, 'Chưa đủ dữ kiện để so sánh'],
  [5778, 'Chưa đủ dữ kiện để so sánh'],
  [5779, 'Chưa đủ dữ kiện để so sánh'],
  [5782, 'Chưa đủ dữ kiện để so sánh'],
  [5785, 'Chưa đủ dữ kiện để so sánh'],
  [5787, 'Chưa đủ dữ kiện để so sánh'],
  [5788, 'Chưa đủ dữ kiện để so sánh'],

  // Các bài về khối lập phương, khối hộp chữ nhật
  [6041, 'Chỉ khi đặt nghiêng'],
  [6042, 'Chỉ lăn khi đặt đứng'],
  [6046, 'Cả ba vật'],
  [6047, 'Chỉ khi có người giữ'],
  [6049, 'Đều lăn được như quả bóng'],
  [6052, 'Không vật nào'],

  // Các câu nhận định đúng hay sai
  [6259, 'Không xác định được'],
  [6369, 'Không xác định được'],
  [6397, 'Không xác định được'],
  [6427, 'Không xác định được'],
  [6533, 'Không xác định được'],
  [6586, 'Không xác định được'],
  [6639, 'Không xác định được'],

  // Bài 9 và bài 10: dài hơn, ngắn hơn, đo độ dài
  [6435, 'Chưa đủ dữ kiện để so sánh'],
  [6436, 'ngắn hơn'],
  [6437, 'Ba dây dài bằng nhau'],
  [6439, 'Cả ba que'],
  [6440, 'dài hơn'],
  [6441, 'Dây đỏ, dây xanh, dây vàng'],
  [6447, 'So sánh ngay khi một sợi còn cuộn tròn'],
  [6449, 'Chưa đủ dữ kiện để so sánh'],
  [6450, 'cao hơn'],
  [6451, 'Ba bông cao bằng nhau'],
  [6452, 'Ba thanh dài bằng nhau'],
  [6453, 'Chỉ khi hai chiếc khăn cùng màu'],
  [6454, 'Chưa đủ dữ kiện để so sánh'],
  [6457, 'Ba chiếc váy dài bằng nhau'],
  [6458, 'Không dải nào đủ dài'],
  [6463, 'Chiều dài của quyển sách'],
  [6464, 'Chỉ chính xác khi đếm lại một lần nữa'],
  [6468, 'Chỉ khi hai vật cùng màu'],
  [6473, 'Sải tay'],
  [6475, 'Cạnh bàn đã dài ra khi Mai đo'],
  [6478, 'Chỉ đáng tin khi đo bằng que dài hơn'],
  [6479, 'Chỉ đúng khi các que chồng đều nhau'],
  [6486, 'Nhân đôi kết quả vừa đo được'],

  // Bài 11: xăng-ti-mét
  [6491, 'Thời gian'],
  [6492, 'ct'],
  [6496, 'Chưa đủ dữ kiện để so sánh'],
  [6505, 'Ba vật dài bằng nhau'],
  [6510, 'Chiều cao của toà nhà'],
  [6513, 'Chỉ khi làm tròn xuống'],

  // Phép cộng, phép trừ
  [6522, 'Phép so sánh'],

  // Các bài về ngày trong tuần
  [6805, 'thứ Sáu'],
  [6806, 'thứ Năm'],
  [6813, 'thứ Sáu, thứ Năm, thứ Tư']
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

async function main() {
  const baoCao = [];
  let daSua = 0;

  for (const [id, moi] of THAY) {
    const rows = await db.query(
      'SELECT q.id, q.content, q.choices, q.correct_answer, l.lesson_name '
      + 'FROM QuestionBank q JOIN Lessons l ON l.id = q.lesson_id WHERE q.id = ?',
      [id]
    );
    if (rows.length === 0) {
      console.log(`  BỎ QUA id ${id}: không còn trong cơ sở dữ liệu`);
      continue;
    }

    const row = rows[0];
    const content = parseJson(row.content, {}) || {};
    const choices = parseJson(row.choices, []) || [];

    const viTri = choices.findIndex((c) => String(c.text || '').trim() === GIU_CHO);
    if (viTri === -1) {
      console.log(`  BỎ QUA id ${id}: không còn phương án giữ chỗ (có thể đã sửa rồi)`);
      continue;
    }
    if (choices[viTri].key === row.correct_answer) {
      throw new Error(`id ${id}: phương án giữ chỗ lại đang là đáp án đúng, phải xem lại bằng tay.`);
    }

    const choicesMoi = choices.map((c, i) => (i === viTri ? { ...c, text: moi } : c));

    // Chốt chặn: phương án mới không được trùng với phương án nào khác.
    const chuan = choicesMoi.map((c) => String(c.text || '').trim().toLowerCase().replace(/[.;]+$/, ''));
    if (new Set(chuan).size !== chuan.length) {
      throw new Error(`id ${id}: phương án mới "${moi}" trùng với một phương án sẵn có.`);
    }

    baoCao.push({
      id, bai_hoc: row.lesson_name, de_bai: String(content.text || ''),
      nhan_thay: choices[viTri].key, noi_dung_moi: moi,
      phuong_an_cu: choices.map((c) => `${c.key}. ${c.text}`),
      phuong_an_moi: choicesMoi.map((c) => `${c.key}. ${c.text}`),
      dap_an: row.correct_answer
    });

    if (COMMIT) {
      await db.query('UPDATE QuestionBank SET choices = CAST(? AS JSON) WHERE id = ?',
        [JSON.stringify(choicesMoi), id]);
      daSua += 1;
    }
  }

  console.log(`Câu trong bảng sửa: ${THAY.size}`);
  console.log(`Câu xử lý được:     ${baoCao.length}`);
  const baPa = baoCao.filter((b) => b.phuong_an_moi.length === 3).length;
  console.log(`  trong đó câu chỉ có 3 phương án: ${baPa}`);

  if (COMMIT) {
    console.log(`\nĐã cập nhật MySQL: ${daSua} câu.`);
    console.log('Nhớ chạy tiếp: node scripts/resync_tex_from_db.js --commit');
  } else {
    console.log('\nĐây là bản xem trước. Thêm --commit để ghi thật.');
    baoCao.slice(0, 5).forEach((b) => {
      console.log(`\n  id ${b.id}  ${b.de_bai.slice(0, 66)}`);
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
