// Script dump questions json hỗ trợ nhập, xuất, kiểm tra hoặc bảo trì dữ liệu và cấu hình của dự án.
/**
 * Đổ toàn bộ ngân hàng câu hỏi từ MySQL ra một tệp JSON phẳng.
 *
 * Dùng để các công cụ Python đối chiếu được với MySQL mà không cần cài thêm thư
 * viện kết nối cơ sở dữ liệu cho Python. Cụ thể là
 * scripts/verify_question_bank_docx.py dùng tệp này để kiểm file Word xuất ra có
 * khớp dữ liệu hệ thống đang chạy hay không.
 *
 * MySQL không lưu external_id nên phải lấy từ file .tex, khớp theo VỊ TRÍ đúng
 * như cách resync_tex_from_db.js làm: khối .tex thứ i ứng với câu thứ i khi sắp
 * theo id tăng dần. Script dừng lại nếu số khối không bằng số câu.
 *
 * Dùng: node scripts/dump_questions_json.js
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const db = require('../config/db');

const ROOT = path.join(__dirname, '..');
const DICH = path.join(ROOT, 'tmp', 'dump_cau_hoi.json');

const TEX_THEO_KHOI = {
  1: 'grade1_question_bank_reviewed.tex',
  2: 'grade2_question_bank.tex',
  3: 'grade3_question_bank.tex',
  4: 'grade4_question_bank.tex',
  5: 'grade5_question_bank.tex'
};

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

// Hàm main dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function main() {
  const ra = [];

  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const grade of [1, 2, 3, 4, 5]) {
    const rows = await db.query(
      `SELECT q.id, q.difficulty, q.content, q.choices, q.correct_answer, q.explanation
       FROM QuestionBank q
       JOIN Lessons l ON l.id = q.lesson_id
       JOIN Chapters ch ON ch.id = l.chapter_id
       WHERE ch.grade = ? ORDER BY q.id`,
      [grade]
    );

    const filePath = path.join(ROOT, 'data', TEX_THEO_KHOI[grade]);
    const payloads = [];
    // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
    for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (!line.startsWith('% DBJSON ')) continue;
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      try {
        payloads.push(decode(line.slice('% DBJSON '.length).trim()));
      } catch (error) {
        // Dòng hỏng thì bỏ, phần kiểm số lượng bên dưới sẽ bắt được.
      }
    }

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (payloads.length !== rows.length) {
      throw new Error(
        `Lớp ${grade}: .tex có ${payloads.length} khối nhưng MySQL có ${rows.length} câu. `
        + 'Chạy scripts/resync_tex_from_db.js --commit trước.'
      );
    }

    rows.forEach((row, i) => {
      const content = parseJson(row.content, {}) || {};
      const choices = parseJson(row.choices, []) || [];
      const explanation = parseJson(row.explanation, {}) || {};
      const anhDe = (content.images || []).filter((im) => im && im.url).length;
      const anhGiai = (explanation.images || []).filter((im) => im && im.url).length;

      ra.push({
        id: row.id,
        grade,
        external_id: payloads[i].external_id,
        lesson_number: payloads[i].lesson_number,
        difficulty: row.difficulty || payloads[i].difficulty,
        source_kind: payloads[i].source_kind,
        de: String(content.text || ''),
        choices: choices.map((c) => ({ key: c.key, text: String(c.text || '') })),
        correct_answer: row.correct_answer,
        dap_an_text: String((choices.find((c) => c.key === row.correct_answer) || {}).text || ''),
        loi_giai: String(explanation.text || ''),
        so_anh: anhDe + anhGiai
      });
    });

    console.log(`Lớp ${grade}: ${rows.length} câu`);
  }

  fs.mkdirSync(path.dirname(DICH), { recursive: true });
  fs.writeFileSync(DICH, JSON.stringify(ra, null, 1), 'utf8');
  console.log(`\nĐã ghi ${ra.length} câu vào ${path.relative(ROOT, DICH)}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Thất bại:', error.message);
    process.exit(1);
  });
