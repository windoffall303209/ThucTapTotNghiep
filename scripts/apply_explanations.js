/**
 * Cập nhật lời giải cho các câu hỏi, đồng thời vào MySQL và file .tex.
 *
 * Nguồn: tệp JSON dạng mảng [{ id, loi_giai_moi }, ...] do các đợt rà soát sinh
 * ra. Script chỉ đụng tới trường explanation.text, giữ nguyên ảnh của lời giải và
 * mọi trường khác.
 *
 * Quy tắc an toàn: KHÔNG đổi đáp án. Nếu một đợt rà soát nghi đáp án sai thì phải
 * xử lý riêng bằng bước có kiểm chứng, không gộp vào đây.
 *
 * Cách khớp câu trong .tex: file .tex không lưu id của MySQL nên phải dò lại. Chỉ
 * dò theo đề bài là SAI, vì ngân hàng lớp 1 có 20 đề bài dùng chung cho nhiều câu
 * khác nhau, ví dụ "Phép tính nào phù hợp với tranh?" xuất hiện 30 lần với 30 bộ
 * phương án khác nhau. Khớp theo đề bài sẽ ghi cùng một lời giải cho cả 30 câu.
 * Vì vậy khoá khớp là bộ ba: đề bài + toàn bộ phương án + đáp án đúng. Câu nào vẫn
 * còn nhập nhằng sau khoá này thì bỏ qua và báo ra, không đoán bừa.
 *
 * Dùng:
 *   node scripts/apply_explanations.js <tệp.json>            -> xem trước
 *   node scripts/apply_explanations.js <tệp.json> --commit   -> ghi thật
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const db = require('../config/db');

const COMMIT = process.argv.includes('--commit');
const NGUON = process.argv[2];
const ROOT = path.join(__dirname, '..');

const TEX_THEO_KHOI = {
  1: 'grade1_question_bank_reviewed.tex',
  2: 'grade2_question_bank.tex',
  3: 'grade3_question_bank.tex',
  4: 'grade4_question_bank.tex',
  5: 'grade5_question_bank.tex'
};

function parseJson(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function decode(b64) {
  return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
}

function encode(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

/**
 * Chữ ký nhận dạng một câu hỏi, dùng để nối bản ghi trong MySQL với khối tương ứng
 * trong .tex. Gồm đề bài, toàn bộ phương án theo đúng thứ tự và đáp án đúng.
 */
function chuKy(deBai, choices, dapAn) {
  const pa = (choices || [])
    .map((c) => `${String(c.key || '').trim()}=${String(c.text || '').trim()}`)
    .join('');
  return `${String(deBai || '').trim()}${pa}${String(dapAn || '').trim()}`;
}

async function main() {
  if (!NGUON || !fs.existsSync(NGUON)) {
    throw new Error('Cần truyền đường dẫn tệp JSON chứa danh sách lời giải mới.');
  }

  const danhSach = JSON.parse(fs.readFileSync(NGUON, 'utf8'))
    .filter((item) => item && item.id && String(item.loi_giai_moi || '').trim());

  console.log(`Số lời giải cần cập nhật: ${danhSach.length}`);

  // Gom theo khối để chỉ mở mỗi file .tex một lần.
  const theoKhoi = new Map();
  const chiTiet = [];

  for (const item of danhSach) {
    const rows = await db.query(
      `SELECT q.id, ch.grade, q.content, q.choices, q.correct_answer, q.explanation FROM QuestionBank q
       JOIN Lessons l ON l.id = q.lesson_id
       JOIN Chapters ch ON ch.id = l.chapter_id
       WHERE q.id = ?`,
      [item.id]
    );
    if (rows.length === 0) {
      console.log(`  BỎ QUA id ${item.id}: không còn trong cơ sở dữ liệu`);
      continue;
    }

    const row = rows[0];
    const explanationCu = parseJson(row.explanation, {}) || {};
    const contentCu = parseJson(row.content, {}) || {};

    chiTiet.push({
      id: row.id,
      grade: row.grade,
      de_bai: String(contentCu.text || ''),
      loi_giai_cu: String(explanationCu.text || ''),
      loi_giai_moi: String(item.loi_giai_moi).trim()
    });

    if (!theoKhoi.has(row.grade)) theoKhoi.set(row.grade, []);
    theoKhoi.get(row.grade).push({
      id: row.id,
      chuKy: chuKy(contentCu.text, parseJson(row.choices, []), row.correct_answer),
      loiGiaiMoi: String(item.loi_giai_moi).trim()
    });

    if (COMMIT) {
      const explanationMoi = { ...explanationCu, text: String(item.loi_giai_moi).trim() };
      await db.query(
        'UPDATE QuestionBank SET explanation = CAST(? AS JSON) WHERE id = ?',
        [JSON.stringify(explanationMoi), row.id]
      );
    }
  }

  let suaTex = 0;
  const khongKhop = [];
  const nhapNhang = [];

  if (COMMIT) {
    for (const [grade, muc] of theoKhoi) {
      const fileName = TEX_THEO_KHOI[grade];
      if (!fileName) continue;
      const filePath = path.join(ROOT, 'data', fileName);
      if (!fs.existsSync(filePath)) continue;

      const lines = fs.readFileSync(filePath, 'utf8').split('\n');

      // Lượt 1: lập chỉ mục chữ ký -> các dòng DBJSON mang chữ ký đó.
      const viTriTheoChuKy = new Map();
      for (let i = 0; i < lines.length; i += 1) {
        if (!lines[i].startsWith('% DBJSON ')) continue;
        let payload;
        try {
          payload = decode(lines[i].slice('% DBJSON '.length).trim());
        } catch (error) {
          continue;
        }
        const key = chuKy(payload.content?.text, payload.choices, payload.correct_answer);
        if (!viTriTheoChuKy.has(key)) viTriTheoChuKy.set(key, []);
        viTriTheoChuKy.get(key).push(i);
      }

      // Lượt 2: mỗi câu chỉ ghi khi chữ ký trỏ tới đúng MỘT khối trong .tex.
      for (const m of muc) {
        const viTri = viTriTheoChuKy.get(m.chuKy) || [];
        if (viTri.length === 0) {
          khongKhop.push({ id: m.id, grade, ly_do: 'không tìm thấy khối tương ứng trong .tex' });
          continue;
        }
        if (viTri.length > 1) {
          // Hai câu giống hệt nhau cả đề, phương án lẫn đáp án: ghi cùng lời giải
          // cho mọi bản là đúng, vì chúng thực sự là một câu bị lặp.
          nhapNhang.push({ id: m.id, grade, so_ban: viTri.length });
        }

        for (const i of viTri) {
          const payload = decode(lines[i].slice('% DBJSON '.length).trim());
          payload.explanation = { ...(payload.explanation || {}), text: m.loiGiaiMoi };
          lines[i] = `% DBJSON ${encode(payload)}`;

          let end = i + 1;
          while (end < lines.length && !lines[end].includes('\\end{minipage}')) end += 1;
          for (let j = i + 1; j <= end; j += 1) {
            const cr = lines[j].endsWith('\r') ? '\r' : '';
            const noiDung = lines[j].replace(/\r$/, '');
            if (noiDung.includes('\\textbf{Lời giải:}')) {
              lines[j] = `\\textbf{Lời giải:} ${m.loiGiaiMoi}${cr}`;
              break;
            }
          }
          suaTex += 1;
        }
      }

      fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
      console.log(`  Đã ghi ${fileName}`);
    }
  }

  const baoCao = path.join(ROOT, 'tmp', 'bao_cao_loi_giai.json');
  fs.writeFileSync(baoCao, JSON.stringify(chiTiet, null, 1), 'utf8');

  console.log(`\nXử lý được: ${chiTiet.length}`);
  if (COMMIT) {
    console.log(`  Cập nhật MySQL: ${chiTiet.length}`);
    console.log(`  Sửa trong .tex: ${suaTex}`);
    if (nhapNhang.length) {
      console.log(`  Câu bị lặp y hệt trong .tex: ${nhapNhang.length} (đã ghi cho mọi bản)`);
    }
    if (khongKhop.length) {
      console.log(`  KHÔNG khớp được trong .tex: ${khongKhop.length}`);
      khongKhop.slice(0, 10).forEach((k) => console.log(`    id ${k.id} (lớp ${k.grade}): ${k.ly_do}`));
      if (khongKhop.length > 10) console.log(`    ... còn ${khongKhop.length - 10} câu nữa`);
    }
  } else {
    console.log('\nĐây là bản xem trước. Thêm --commit để ghi thật.');
    chiTiet.slice(0, 3).forEach((c) => {
      console.log(`\n  id ${c.id} (lớp ${c.grade})`);
      console.log(`    cũ : ${c.loi_giai_cu.slice(0, 78)}`);
      console.log(`    mới: ${c.loi_giai_moi.slice(0, 78)}`);
    });
  }
  console.log(`  Báo cáo: ${path.relative(ROOT, baoCao)}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Thất bại:', error.message);
    process.exit(1);
  });
