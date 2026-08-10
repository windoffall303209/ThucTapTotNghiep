// Script scan equivalent options hỗ trợ nhập, xuất, kiểm tra hoặc bảo trì dữ liệu và cấu hình của dự án.
/**
 * Tìm câu hỏi có hai phương án cùng đúng, quét trên toàn bộ ngân hàng câu hỏi.
 *
 * Dạng lỗi cần tìm được phát hiện khi rà soát lớp 1: bộ phương án chứa đáp án
 * đúng hai lần, một bản trần và một bản kèm đơn vị hoặc kèm cụm danh từ. Ví dụ
 * A "90 quyển vở." được chấm đúng còn B "90" cũng đúng y hệt; hoặc C "Chiếc thang
 * màu xanh dương." và D "Màu xanh dương".
 *
 * Bộ dò phải rất chặt. Lần thử đầu chỉ so số đứng đầu chuỗi đã bắt nhầm 2505 cặp,
 * trong đó có "1 - 3 = 4" với "1 + 3 = 3" (chung số 1 nhưng khác hẳn nhau) và
 * "37,5 dm³" với "375 dm³". Lần thử theo kiểu chuỗi này chứa chuỗi kia thì bắt
 * nhầm "Bằng nhau" với "Không bằng nhau" là hai phương án ngược nghĩa.
 *
 * Hai luật dùng thật:
 *
 *   SO_TRUNG   Cả hai phương án đều có dạng số rồi tới phần chữ. Phần số phải
 *              bằng nhau đúng từng chữ số, và phần chữ của một bên phải rỗng còn
 *              bên kia là cụm danh từ thuần chữ. Nhờ vậy "90" khớp "90 quyển vở"
 *              nhưng "12 cm" không khớp "12 dm", và "5/7" không khớp "5/14".
 *
 *   CAU_BAO    Phương án dài kết thúc bằng đúng phương án ngắn, cắt theo ranh giới
 *              từ. Phần dôi ra ở đầu phải là cụm danh từ, không được chứa từ phủ
 *              định hay từ so sánh, vì "Không bằng nhau" cũng kết thúc bằng "bằng
 *              nhau" mà nghĩa thì ngược lại.
 *
 * Dùng: node scripts/scan_equivalent_options.js
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const db = require('../config/db');

const ROOT = path.join(__dirname, '..');
const KET_QUA = path.join(ROOT, 'tmp', 'quet_phuong_an_tuong_duong.json');

// Từ làm đổi nghĩa. Nếu phần dôi ra chứa một trong các từ này thì hai phương án
// không còn là một, dù chuỗi có bao nhau.
const TU_DOI_NGHIA = /\b(không|chưa|chẳng|hơn|kém|bằng|ít|nhiều|lớn|bé|nhỏ|cao|thấp|dài|ngắn|nặng|nhẹ|sai|đúng|gấp|thêm|bớt|còn|tất|cả)\b/u;

// Hàm chuanHoa dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function chuanHoa(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[.;,!?]+$/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tách "90 quyển vở" thành phần số "90" và phần chữ "quyển vở". */
function tachSoVaChu(s) {
  const m = s.match(/^([0-9][0-9 .,]*?)\s*([^0-9]*)$/u);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!m) return null;
  const so = m[1].replace(/[ .,]/g, '');
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!/^[0-9]+$/.test(so)) return null;
  const chu = m[2].trim();
  // Phần chữ phải là chữ thuần, không chứa dấu phép tính hay ký hiệu.
  if (chu && !/^[a-zà-ỹ\s]+$/u.test(chu)) return null;
  return { so, chu };
}

// Hàm soTrung dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function soTrung(a, b) {
  const ta = tachSoVaChu(a);
  const tb = tachSoVaChu(b);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!ta || !tb) return false;
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (ta.so !== tb.so) return false;
  // Một bên có đơn vị, bên kia không. Hai bên cùng có đơn vị mà khác nhau thì là
  // hai đại lượng khác nhau, ví dụ "12 cm" và "12 dm".
  return (ta.chu === '' && tb.chu !== '') || (tb.chu === '' && ta.chu !== '');
}

// Hàm cauBao dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function cauBao(a, b) {
  const [ngan, dai] = a.length <= b.length ? [a, b] : [b, a];
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (ngan.length < 5) return false;
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!dai.endsWith(ngan)) return false;
  const doiRa = dai.slice(0, dai.length - ngan.length).trim();
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!doiRa) return false;
  // Phải cắt đúng ranh giới từ, tránh "ba" khớp đuôi của "cái ba".
  if (!/\s$/.test(dai.slice(0, dai.length - ngan.length))) return false;
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (TU_DOI_NGHIA.test(doiRa)) return false;
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (/[0-9]/.test(doiRa)) return false;
  return true;
}

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

// Hàm main dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function main() {
  const rows = await db.query(
    `SELECT q.id, ch.grade, l.lesson_name, q.content, q.choices, q.correct_answer
     FROM QuestionBank q
     JOIN Lessons l ON l.id = q.lesson_id
     JOIN Chapters ch ON ch.id = l.chapter_id
     ORDER BY q.id`
  );

  const ketQua = [];

  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const row of rows) {
    const choices = parseJson(row.choices, []) || [];
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!Array.isArray(choices) || choices.length < 2) continue;
    const content = parseJson(row.content, {}) || {};

    // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
    for (let i = 0; i < choices.length; i += 1) {
      // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
      for (let j = i + 1; j < choices.length; j += 1) {
        const a = chuanHoa(choices[i].text);
        const b = chuanHoa(choices[j].text);
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (!a || !b || a === b) {
          // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
          if (a && b && a === b) {
            ketQua.push({
              id: row.id, grade: row.grade, luat: 'TRUNG_HET', bai_hoc: row.lesson_name,
              de_bai: String(content.text || ''), cap: [`${choices[i].key}. ${choices[i].text}`, `${choices[j].key}. ${choices[j].text}`],
              dap_an: row.correct_answer,
              dinh_dap_an: choices[i].key === row.correct_answer || choices[j].key === row.correct_answer
            });
          }
          continue;
        }

        let luat = null;
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (soTrung(a, b)) luat = 'SO_TRUNG';
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        else if (cauBao(a, b)) luat = 'CAU_BAO';
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (!luat) continue;

        ketQua.push({
          id: row.id, grade: row.grade, luat, bai_hoc: row.lesson_name,
          de_bai: String(content.text || ''),
          cap: [`${choices[i].key}. ${choices[i].text}`, `${choices[j].key}. ${choices[j].text}`],
          dap_an: row.correct_answer,
          dinh_dap_an: choices[i].key === row.correct_answer || choices[j].key === row.correct_answer
        });
      }
    }
  }

  const theoLuat = {};
  const theoLop = {};
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const k of ketQua) {
    theoLuat[k.luat] = (theoLuat[k.luat] || 0) + 1;
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (k.dinh_dap_an) theoLop[k.grade] = (theoLop[k.grade] || 0) + 1;
  }

  console.log(`Đã quét ${rows.length} câu hỏi.\n`);
  console.log(`Cặp phương án nghi trùng nghĩa: ${ketQua.length}`);
  Object.entries(theoLuat).forEach(([l, n]) => console.log(`  ${l}: ${n}`));

  const nghiemTrong = ketQua.filter((k) => k.dinh_dap_an);
  console.log(`\nTrong đó có dính đáp án đúng (học sinh chọn đúng vẫn bị chấm sai): ${nghiemTrong.length}`);
  console.log(`  theo lớp: ${JSON.stringify(theoLop)}`);

  nghiemTrong.slice(0, 30).forEach((k) => {
    console.log(`\n  lớp ${k.grade} id ${k.id} [${k.luat}] ${k.de_bai.slice(0, 62)}`);
    console.log(`    ${k.cap[0]}   ||   ${k.cap[1]}     -> chấm ${k.dap_an}`);
  });
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (nghiemTrong.length > 30) console.log(`\n  ... còn ${nghiemTrong.length - 30} cặp nữa, xem trong tệp báo cáo.`);

  fs.writeFileSync(KET_QUA, JSON.stringify(ketQua, null, 1), 'utf8');
  console.log(`\nBáo cáo: ${path.relative(ROOT, KET_QUA)}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Thất bại:', error.message);
    process.exit(1);
  });
