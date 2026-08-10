// Script fix all broken images hỗ trợ nhập, xuất, kiểm tra hoặc bảo trì dữ liệu và cấu hình của dự án.
/**
 * Xử lý gộp toàn bộ câu hỏi có ảnh hỏng, phát hiện qua các đợt quét lớp 1 đến 5.
 *
 * Ba nhóm việc:
 *
 * 1. ĐỔI ĐÁP ÁN (danh sách DOI_DAP_AN bên dưới). Chỉ gồm các câu đã được người
 *    kiểm duyệt TỰ MỞ ẢNH xác minh lại, không lấy nguyên đề xuất của máy. Trong
 *    6 đề xuất ban đầu có 1 đề xuất sai (câu 6366: máy đo toạ độ pixel trên tia
 *    số mà bỏ qua nhãn "83" đã in sẵn trong ảnh), nên đã loại bỏ.
 *
 * 2. GỠ ẢNH, GIỮ NGUYÊN ĐỀ. Áp dụng cho câu mà đề bài đã tự nêu đủ dữ kiện bằng
 *    chữ, ảnh chỉ minh họa và đang vẽ sai. Ví dụ đề "24 quả cam chia đều 4 giỏ"
 *    nhưng tranh vẽ mỗi giỏ 7 quả. Bỏ tranh là câu dùng được ngay.
 *
 * 3. GỠ ẢNH VÀ VIẾT LẠI ĐỀ. Áp dụng cho câu mà đề phụ thuộc hoàn toàn vào ảnh,
 *    dạng "Quan sát tranh. Có bao nhiêu con cá?". Đề mới phải tự đủ dữ kiện và
 *    giữ đúng đáp án hiện có.
 *
 * Ảnh KHÔNG bị xóa khỏi ổ đĩa, chỉ bỏ tham chiếu trong câu hỏi.
 *
 * Dùng:
 *   node scripts/fix_all_broken_images.js            -> xem trước
 *   node scripts/fix_all_broken_images.js --commit   -> ghi vào MySQL và .tex
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const db = require('../config/db');

const COMMIT = process.argv.includes('--commit');
const ROOT = path.join(__dirname, '..');
const NGUON = path.join(ROOT, 'tmp', 'anh_hong_tong_hop.json');
const BAO_CAO = path.join(ROOT, 'tmp', 'bao_cao_sua_gop.json');

const TEX_THEO_KHOI = {
  1: 'grade1_question_bank_reviewed.tex',
  2: 'grade2_question_bank.tex',
  3: 'grade3_question_bank.tex',
  4: 'grade4_question_bank.tex',
  5: 'grade5_question_bank.tex'
};

/**
 * Đáp án đúng sau khi người kiểm duyệt tự mở ảnh xác minh.
 * Ghi kèm lý do để sau này đọc lại còn hiểu vì sao đổi.
 */
const DOI_DAP_AN = new Map([
  [6205, { moi: 'A', vi: '6 - 0 = 6 nên số bạn còn lại BẰNG 6, không phải ít hơn' }],
  [6145, { moi: 'C', vi: '4 - 0 = 4 nên số bạn còn lại BẰNG 4, không phải ít hơn' }],
  [6056, { moi: 'A', vi: 'đếm trên ảnh: đĩa còn đúng 5 quả táo, tay đang lấy quả thứ sáu ra' }],
  [6066, { moi: 'D', vi: 'đếm trên ảnh: cốc còn đúng 3 chiếc bút màu' }],
  [11469, { moi: 'D', vi: 'đếm trên bảng 4x5: có đúng 12 viên bi đỏ, không phải 13' }]
]);

// Câu bị máy báo sai đáp án nhưng người kiểm duyệt bác bỏ.
const BAC_BO = new Map([
  [6366, 'ảnh tia số đã IN SẴN nhãn đỏ "83" ngay dưới chấm nên đáp án B trong dữ liệu là đúng; '
    + 'máy đi đo toạ độ pixel rồi kết luận 82, đó là suy diễn sai']
]);

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

// Đề bài có thể còn mã giữ chỗ [image-1] trỏ tới ảnh sắp gỡ.
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
  const texCache = new Map();
  const baoCao = [];

  let goAnh = 0;
  let vietLaiDe = 0;
  let doiDapAn = 0;
  let suaTex = 0;
  let boQua = 0;

  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const muc of danhSach) {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (BAC_BO.has(muc.id)) {
      boQua += 1;
      continue;
    }

    const rows = await db.query(
      `SELECT q.id, ch.grade, l.lesson_name, q.content, q.choices, q.correct_answer, q.explanation
       FROM QuestionBank q
       JOIN Lessons l ON l.id = q.lesson_id
       JOIN Chapters ch ON ch.id = l.chapter_id
       WHERE q.id = ?`,
      [muc.id]
    );
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (rows.length === 0) {
      boQua += 1;
      continue;
    }

    const row = rows[0];
    const contentCu = parseJson(row.content, {}) || {};
    const deCu = String(contentCu.text || '');
    const anhCu = (contentCu.images || []).map((image) => image.url);

    // Đề tự đủ dữ kiện khi bản thân nó đã chứa con số để tính.
    const tuDuDuKien = /\d/.test(deCu);
    const deXuat = String(muc.de_xuat_de_moi || '').trim();
    const deMoi = (!tuDuDuKien && deXuat) ? boMaGiuCho(deXuat) : boMaGiuCho(deCu);

    const dapAnMoi = DOI_DAP_AN.has(row.id) ? DOI_DAP_AN.get(row.id).moi : row.correct_answer;

    const contentMoi = { ...contentCu, text: deMoi, images: [] };

    baoCao.push({
      id: row.id,
      grade: row.grade,
      bai_hoc: row.lesson_name,
      loai_loi: muc.loai,
      mo_ta_loi: String(muc.mo_ta || ''),
      de_cu: deCu,
      de_moi: deMoi,
      da_viet_lai_de: deMoi !== boMaGiuCho(deCu),
      anh_da_go: anhCu,
      phuong_an: (parseJson(row.choices, []) || []).map((c) => ({ key: c.key, text: String(c.text || '') })),
      dap_an_cu: row.correct_answer,
      dap_an_moi: dapAnMoi,
      da_doi_dap_an: dapAnMoi !== row.correct_answer,
      ly_do_doi_dap_an: DOI_DAP_AN.has(row.id) ? DOI_DAP_AN.get(row.id).vi : ''
    });

    goAnh += 1;
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (deMoi !== boMaGiuCho(deCu)) vietLaiDe += 1;
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (dapAnMoi !== row.correct_answer) doiDapAn += 1;

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (COMMIT) {
      await db.query(
        'UPDATE QuestionBank SET content = CAST(? AS JSON), correct_answer = ? WHERE id = ?',
        [JSON.stringify(contentMoi), dapAnMoi, row.id]
      );
    }

    // Đồng bộ file .tex của khối tương ứng.
    const fileName = TEX_THEO_KHOI[row.grade];
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!fileName) continue;
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!texCache.has(fileName)) {
      const filePath = path.join(ROOT, 'data', fileName);
      texCache.set(fileName, fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8').split('\n') : null);
    }
    const lines = texCache.get(fileName);
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!lines) continue;

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

      payload.content.text = deMoi;
      payload.content.images = [];
      payload.correct_answer = dapAnMoi;
      lines[i] = `% DBJSON ${encode(payload)}`;

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
          lines[j] = `${khopDe[1]}${deMoi}${cr}`;
          continue;
        }
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (noiDung.includes('Đáp án đúng:')) {
          lines[j] = noiDung.replace(/(Đáp án đúng:\} )([A-D])/, `$1${dapAnMoi}`) + cr;
          continue;
        }
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (noiDung.includes('\\textit{Ảnh nguồn:}')) lines[j] = cr;
      }
      suaTex += 1;
      break;
    }
  }

  console.log(`Câu xử lý:          ${goAnh}`);
  console.log(`  Gỡ ảnh:           ${goAnh}`);
  console.log(`  Viết lại đề:      ${vietLaiDe}`);
  console.log(`  Đổi đáp án:       ${doiDapAn}`);
  console.log(`  Sửa trong .tex:   ${suaTex}`);
  console.log(`  Bỏ qua:           ${boQua}  (gồm ${BAC_BO.size} câu bị bác bỏ đề xuất đổi đáp án)`);

  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (COMMIT) {
    // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
    for (const [fileName, lines] of texCache) {
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (!lines) continue;
      fs.writeFileSync(path.join(ROOT, 'data', fileName), lines.join('\n'), 'utf8');
      console.log(`  Đã ghi ${fileName}`);
    }
  } else {
    console.log('\nĐây là bản xem trước. Thêm --commit để ghi thật.');
  }

  fs.writeFileSync(BAO_CAO, JSON.stringify(baoCao, null, 1), 'utf8');
  console.log(`  Báo cáo:          ${path.relative(ROOT, BAO_CAO)}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Thất bại:', error.message);
    process.exit(1);
  });
