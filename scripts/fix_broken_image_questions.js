// Script fix broken image questions hỗ trợ nhập, xuất, kiểm tra hoặc bảo trì dữ liệu và cấu hình của dự án.
/**
 * Gỡ ảnh hỏng khỏi câu hỏi lớp 1 và thay bằng đề bài tự đủ nghĩa.
 *
 * Bối cảnh: một lượt rà soát bằng cách MỞ TỪNG ẢNH ra xem đã phát hiện 34 câu có
 * ảnh không dùng được, chia hai loại:
 *
 *   to_de_gop     - ảnh thực chất là một TỜ ĐỀ chứa 5 câu hỏi và IN SẴN phương án
 *                   A/B/C/D bên trong. Thứ tự phương án in trong ảnh khác thứ tự
 *                   lưu trong cơ sở dữ liệu, nên học sinh đọc ảnh rồi bấm theo
 *                   nhãn trong ảnh sẽ bị chấm sai dù hiểu đúng bài.
 *   thieu_du_kien - ảnh mâu thuẫn với dữ kiện của đề hoặc với đáp án đúng. Ví dụ
 *                   đề nói "có 6 quả bóng" nhưng tranh vẽ 7 quả, hoặc đề hỏi bút
 *                   xanh ở đâu so với bút đỏ mà tranh vẽ ngược với đáp án.
 *
 * Cách xử lý: gỡ toàn bộ ảnh khỏi câu hỏi rồi viết lại đề bài bằng chữ sao cho tự
 * đủ dữ kiện, KHÔNG cần nhìn tranh vẫn trả lời được. Bộ phương án và đáp án đúng
 * giữ nguyên; đề mới được viết sao cho đáp án cũ vẫn đúng. Chọn cách này vì nội
 * dung sai nằm bên trong tệp ảnh nên chỉ vẽ lại ảnh mới sửa được, mà việc đó nằm
 * ngoài khả năng của công cụ đang dùng.
 *
 * Ảnh KHÔNG bị xóa khỏi đĩa, chỉ bỏ tham chiếu trong câu hỏi, để sau này có thể
 * dùng lại nếu vẽ được bản mới.
 *
 * Dùng:
 *   node scripts/fix_broken_image_questions.js            -> xem trước
 *   node scripts/fix_broken_image_questions.js --commit   -> ghi .tex và MySQL
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const db = require('../config/db');

const COMMIT = process.argv.includes('--commit');
const ROOT = path.join(__dirname, '..');
const NGUON = path.join(ROOT, 'tmp', 'anh_hong.json');
const TEX = path.join(ROOT, 'data', 'grade1_question_bank_reviewed.tex');
const BAO_CAO = path.join(ROOT, 'tmp', 'bao_cao_sua_anh.json');

// Hàm parseJson dùng để phân tích đầu vào thành cấu trúc có thể sử dụng; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function parseJson(value, fallback) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (value === null || value === undefined) return fallback;
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (typeof value !== 'string') return value;
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

// Hàm decode dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function decode(b64) {
  return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
}

// Hàm encode dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function encode(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

// Đề bài có thể chứa mã giữ chỗ [image-1] trỏ tới ảnh sắp bị gỡ, phải dọn theo.
function boMaGiuCho(text) {
  return String(text || '')
    .replace(/\[[a-zA-Z0-9-]*image[a-zA-Z0-9-]*\]/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Hàm main dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function main() {
  const danhSach = JSON.parse(fs.readFileSync(NGUON, 'utf8'));
  const lines = fs.readFileSync(TEX, 'utf8').split('\n');

  const baoCao = [];
  let suaTex = 0;
  let suaDb = 0;
  let khongThayTex = 0;

  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const muc of danhSach) {
    const rows = await db.query(
      'SELECT q.id, q.content, q.choices, q.correct_answer, q.explanation, l.lesson_name '
      + 'FROM QuestionBank q JOIN Lessons l ON l.id = q.lesson_id WHERE q.id = ?',
      [muc.id]
    );
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (rows.length === 0) continue;

    const row = rows[0];
    const contentCu = parseJson(row.content, {}) || {};
    const choices = parseJson(row.choices, []) || [];
    const deCu = String(contentCu.text || '');
    const deMoi = String(muc.de_xuat_de_moi || '').trim();
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!deMoi) continue;

    const anhCu = (contentCu.images || []).map((image) => image.url);

    const contentMoi = {
      ...contentCu,
      text: boMaGiuCho(deMoi),
      images: []
    };

    baoCao.push({
      id: row.id,
      bai_hoc: row.lesson_name,
      loai_loi: muc.loai,
      mo_ta_loi: muc.mo_ta,
      de_cu: deCu,
      de_moi: contentMoi.text,
      anh_da_go: anhCu,
      phuong_an: choices.map((choice) => ({ key: choice.key, text: String(choice.text || '') })),
      dap_an_dung: row.correct_answer,
      loi_giai: String((parseJson(row.explanation, {}) || {}).text || '')
    });

    // Cập nhật file .tex: tìm theo đề bài cũ vì payload không lưu id của MySQL.
    let daSuaTex = false;
    // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
    for (let i = 0; i < lines.length; i += 1) {
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (!lines[i].startsWith('% DBJSON ')) continue;
      let payload;
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      try {
        payload = decode(lines[i].slice('% DBJSON '.length).trim());
      } catch (error) {
        continue;
      }
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (String(payload.content?.text || '') !== deCu) continue;

      payload.content.text = contentMoi.text;
      payload.content.images = [];
      lines[i] = `% DBJSON ${encode(payload)}`;

      // Sửa khối LaTeX đi kèm: đổi dòng đề bài và bỏ dòng ghi tên ảnh nguồn.
      let end = i + 1;
      // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
      while (end < lines.length && !lines[end].includes('\\end{minipage}')) end += 1;
      // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
      for (let j = i + 1; j <= end; j += 1) {
        const cr = lines[j].endsWith('\r') ? '\r' : '';
        const noiDung = lines[j].replace(/\r$/, '');
        const khopDe = noiDung.match(/^(\\noindent\\textbf\{[^}]+\}\s*)(.*)$/);
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (khopDe) {
          lines[j] = `${khopDe[1]}${contentMoi.text}${cr}`;
          continue;
        }
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (noiDung.includes('\\textit{Ảnh nguồn:}')) lines[j] = cr;
      }
      daSuaTex = true;
      suaTex += 1;
      break;
    }
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!daSuaTex) khongThayTex += 1;

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (COMMIT) {
      await db.query(
        'UPDATE QuestionBank SET content = CAST(? AS JSON) WHERE id = ?',
        [JSON.stringify(contentMoi), row.id]
      );
      suaDb += 1;
    }
  }

  console.log(`Số câu xử lý:        ${baoCao.length}`);
  console.log(`  Sửa được trong .tex: ${suaTex}`);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (khongThayTex > 0) console.log(`  KHÔNG thấy trong .tex: ${khongThayTex}`);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (COMMIT) {
    console.log(`  Đã cập nhật MySQL:   ${suaDb}`);
    fs.writeFileSync(TEX, lines.join('\n'), 'utf8');
    console.log(`  Đã ghi ${path.basename(TEX)}`);
  } else {
    console.log('\nĐây là bản xem trước. Thêm --commit để ghi thật.');
  }

  fs.writeFileSync(BAO_CAO, JSON.stringify(baoCao, null, 1), 'utf8');
  console.log(`  Báo cáo chi tiết:    ${path.relative(ROOT, BAO_CAO)}`);

  const theoLoai = baoCao.reduce((acc, item) => {
    acc[item.loai_loi] = (acc[item.loai_loi] || 0) + 1;
    return acc;
  }, {});
  console.log('\nPhân loại lỗi:');
  Object.entries(theoLoai).forEach(([loai, so]) => console.log(`  ${loai.padEnd(16)}${so}`));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Thất bại:', error.message);
    process.exit(1);
  });
