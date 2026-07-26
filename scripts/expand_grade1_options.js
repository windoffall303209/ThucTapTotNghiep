/**
 * Bổ sung phương án thứ tư cho các câu hỏi lớp 1 đang chỉ có ba phương án.
 *
 * VÌ SAO: 473 câu lớp 1 chỉ có ba phương án nên xác suất đoán mò là 33 phần trăm
 * thay vì 25. Đây cũng là lý do nhãn đáp án đúng của lớp 1 lệch hẳn, D chỉ chiếm
 * 15,9 phần trăm trong khi ba nhãn kia đều quanh 28: câu ba phương án thì không
 * bao giờ có đáp án D.
 *
 * CHỈ THÊM KHI SINH ĐƯỢC PHƯƠNG ÁN NHIỄU CÓ NGHĨA. Script không cố thêm cho mọi
 * câu. Nó xử lý bốn khuôn mà phương án nhiễu suy ra được chắc chắn:
 *
 *   SO         cả ba phương án là số nguyên, ví dụ 8 / 9 / 10.
 *   SO_DON_VI  số kèm cùng một đơn vị, ví dụ "7 cm" / "8 cm" / "9 cm".
 *   KHUON_CHU  cùng một khuôn chữ chỉ khác con số, ví dụ "Nhóm có 7 đồ vật".
 *   DAY_SO     một dãy số, ví dụ "10, 9, 8"; phương án mới là một hoán vị khác.
 *
 * Số dùng làm phương án nhiễu chọn theo lỗi học sinh hay mắc: lệch một hoặc hai
 * đơn vị so với đáp án đúng, hoặc nối tiếp dãy số đang có. Không lấy số ngẫu
 * nhiên vì phương án nhiễu quá vô lý thì học sinh loại được ngay, chẳng khác gì
 * vẫn chỉ có ba phương án.
 *
 * KHÔNG ĐỤNG TỚI:
 *   - Câu điền dấu so sánh (35 câu). Chỉ có đúng ba dấu là <, > và =; thêm phương
 *     án thứ tư sẽ là chữ vô nghĩa.
 *   - Câu đúng hay sai (54 câu) và câu có hay không (6 câu). Ba phương án gồm hai
 *     lựa chọn cộng "Không xác định được" đã là dạng chuẩn của loại câu này.
 *   - Câu có ảnh cắt từ tờ đề gộp, nhận ra qua c_crop trong đường dẫn ảnh, vì ảnh
 *     in sẵn nhãn A, B, C, D bên trong; thêm phương án là ảnh và dữ liệu lệch nhau.
 *
 * Phương án mới luôn được thêm vào cuối, mang nhãn D. Như vậy D sẽ toàn là phương
 * án sai, nên PHẢI chạy tiếp scripts/rebalance_answer_keys.js để rải lại đáp án
 * đúng ra cả bốn nhãn, nếu không thì lệch còn nặng hơn trước.
 *
 * Dùng:
 *   node scripts/expand_grade1_options.js            -> xem trước
 *   node scripts/expand_grade1_options.js --commit   -> ghi vào MySQL
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const db = require('../config/db');

const COMMIT = process.argv.includes('--commit');
const ROOT = path.join(__dirname, '..');
const BAO_CAO = path.join(ROOT, 'tmp', 'bao_cao_them_phuong_an.json');

function parseJson(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

const chuan = (s) => String(s || '').trim();

/** Sinh danh sách số ứng viên, xếp theo mức độ hợp lý giảm dần. */
function ungVienSo(dung, daCo) {
  const max = Math.max(...daCo);
  const min = Math.min(...daCo);
  const ds = [dung + 1, dung - 1, dung + 2, dung - 2, max + 1, min - 1, dung + 10, max + 2];
  for (const n of ds) {
    if (n >= 0 && !daCo.includes(n)) return n;
  }
  return null;
}

/** SO: cả ba phương án là số nguyên. */
function thuSo(texts, dungText) {
  if (!texts.every((t) => /^[0-9]+$/.test(t))) return null;
  const so = texts.map(Number);
  const moi = ungVienSo(Number(dungText), so);
  return moi === null ? null : { khuon: 'SO', text: String(moi) };
}

/** SO_DON_VI: số kèm cùng một đơn vị bằng chữ. */
function thuSoDonVi(texts, dungText) {
  const tach = texts.map((t) => t.match(/^([0-9]+)\s+([a-zà-ỹ][a-zà-ỹ\s]*)$/u));
  if (tach.some((m) => !m)) return null;
  const donVi = tach[0][2].trim();
  if (!tach.every((m) => m[2].trim() === donVi)) return null;
  const so = tach.map((m) => Number(m[1]));
  const dung = Number(dungText.match(/^([0-9]+)/)[1]);
  const moi = ungVienSo(dung, so);
  return moi === null ? null : { khuon: 'SO_DON_VI', text: `${moi} ${donVi}` };
}

/** KHUON_CHU: cùng một khuôn chữ, chỉ khác đúng một con số nằm giữa. */
function thuKhuonChu(texts, dungText) {
  const tach = texts.map((t) => t.match(/^(\D*?)([0-9]+)(\D*)$/u));
  if (tach.some((m) => !m)) return null;
  const dau = tach[0][1];
  const cuoi = tach[0][3];
  if (!tach.every((m) => m[1] === dau && m[3] === cuoi)) return null;
  if (!dau.trim() && !cuoi.trim()) return null; // đã thuộc khuôn SO
  const so = tach.map((m) => Number(m[2]));
  const mDung = dungText.match(/^(\D*?)([0-9]+)(\D*)$/u);
  const moi = ungVienSo(Number(mDung[2]), so);
  return moi === null ? null : { khuon: 'KHUON_CHU', text: `${dau}${moi}${cuoi}` };
}

/** DAY_SO: mỗi phương án là một dãy số; phương án mới là một hoán vị chưa dùng. */
function thuDaySo(texts) {
  const tach = texts.map((t) => (/^[0-9]+(\s*,\s*[0-9]+)+$/.test(t) ? t.split(/\s*,\s*/).map(Number) : null));
  if (tach.some((m) => !m)) return null;
  const dai = tach[0].length;
  if (!tach.every((m) => m.length === dai)) return null;

  // Lấy tập số của dãy đầu rồi thử các hoán vị đơn giản: đảo ngược, đổi chỗ hai
  // phần tử đầu, đổi chỗ hai phần tử cuối.
  const goc = tach[0];
  const daCo = new Set(texts.map((t) => t.replace(/\s+/g, '')));
  const thu = [];
  thu.push([...goc].reverse());
  if (dai >= 2) {
    const a = [...goc]; [a[0], a[1]] = [a[1], a[0]]; thu.push(a);
    const b = [...goc]; [b[dai - 2], b[dai - 1]] = [b[dai - 1], b[dai - 2]]; thu.push(b);
  }
  for (const p of thu) {
    const s = p.join(', ');
    if (!daCo.has(s.replace(/\s+/g, ''))) return { khuon: 'DAY_SO', text: s };
  }
  return null;
}

// Câu điền dấu so sánh, câu đúng sai, câu có không: giữ nguyên ba phương án.
function boQuaTheoDang(texts) {
  const tap = new Set(texts.map((t) => t.toLowerCase().replace(/[.;]+$/, '')));
  if (texts.every((t) => /^[<>=]$/.test(t))) return 'dấu so sánh chỉ có ba dấu';
  if (tap.has('đúng') && tap.has('sai')) return 'câu đúng hay sai';
  if (tap.has('có') && tap.has('không')) return 'câu có hay không';
  return null;
}

async function main() {
  const rows = await db.query(
    `SELECT q.id, l.lesson_name, q.content, q.choices, q.correct_answer
     FROM QuestionBank q
     JOIN Lessons l ON l.id = q.lesson_id
     JOIN Chapters ch ON ch.id = l.chapter_id
     WHERE ch.grade = 1 ORDER BY q.id`
  );

  const baoCao = [];
  const boQua = [];
  const theoKhuon = {};

  for (const row of rows) {
    const choices = parseJson(row.choices, []) || [];
    if (choices.length !== 3) continue;

    const content = parseJson(row.content, {}) || {};
    const deBai = String(content.text || '');
    const anhCat = (content.images || []).some((im) => String(im.url || '').includes('c_crop'));
    if (anhCat) {
      boQua.push({ id: row.id, de_bai: deBai, vi: 'ảnh cắt in sẵn nhãn A, B, C, D bên trong' });
      continue;
    }

    const texts = choices.map((c) => chuan(c.text));
    const lyDoBoQua = boQuaTheoDang(texts);
    if (lyDoBoQua) {
      boQua.push({ id: row.id, de_bai: deBai, vi: lyDoBoQua });
      continue;
    }

    const dungText = chuan((choices.find((c) => c.key === row.correct_answer) || {}).text);
    if (!dungText) {
      boQua.push({ id: row.id, de_bai: deBai, vi: 'không tìm được nội dung đáp án đúng' });
      continue;
    }

    const ra = thuSo(texts, dungText)
      || thuSoDonVi(texts, dungText)
      || thuKhuonChu(texts, dungText)
      || thuDaySo(texts);

    if (!ra) {
      boQua.push({ id: row.id, de_bai: deBai, vi: 'không suy ra được phương án nhiễu có nghĩa' });
      continue;
    }

    // Chốt chặn: phương án mới không được trùng và không được là đáp án đúng.
    const daCo = texts.map((t) => t.toLowerCase());
    if (daCo.includes(ra.text.toLowerCase())) {
      boQua.push({ id: row.id, de_bai: deBai, vi: 'phương án sinh ra bị trùng' });
      continue;
    }

    const choicesMoi = [...choices, { key: 'D', text: ra.text, images: [] }];
    theoKhuon[ra.khuon] = (theoKhuon[ra.khuon] || 0) + 1;

    baoCao.push({
      id: row.id, bai_hoc: row.lesson_name, de_bai: deBai, khuon: ra.khuon,
      phuong_an_cu: choices.map((c) => `${c.key}. ${c.text}`),
      phuong_an_moi: choicesMoi.map((c) => `${c.key}. ${c.text}`),
      them: ra.text, dap_an: row.correct_answer
    });

    if (COMMIT) {
      await db.query('UPDATE QuestionBank SET choices = CAST(? AS JSON) WHERE id = ?',
        [JSON.stringify(choicesMoi), row.id]);
    }
  }

  console.log(`Câu lớp 1 chỉ có 3 phương án: ${baoCao.length + boQua.length}`);
  console.log(`  Thêm được phương án thứ tư: ${baoCao.length}`);
  Object.entries(theoKhuon).forEach(([k, n]) => console.log(`    khuôn ${k}: ${n}`));
  console.log(`  Giữ nguyên 3 phương án:     ${boQua.length}`);
  const theoLyDo = {};
  boQua.forEach((b) => { theoLyDo[b.vi] = (theoLyDo[b.vi] || 0) + 1; });
  Object.entries(theoLyDo).forEach(([k, n]) => console.log(`    ${k}: ${n}`));

  console.log('\nVí dụ phương án vừa thêm:');
  Object.keys(theoKhuon).forEach((khuon) => {
    baoCao.filter((b) => b.khuon === khuon).slice(0, 2).forEach((b) => {
      console.log(`\n  [${khuon}] id ${b.id}  ${b.de_bai.slice(0, 62)}`);
      console.log(`    cũ : ${b.phuong_an_cu.join(' | ')}`);
      console.log(`    mới: ${b.phuong_an_moi.join(' | ')}   -> ${b.dap_an}`);
    });
  });

  if (COMMIT) {
    console.log(`\nĐã cập nhật MySQL: ${baoCao.length} câu.`);
    console.log('PHẢI chạy tiếp rebalance_answer_keys.js để rải lại nhãn đáp án đúng,');
    console.log('vì phương án mới đều mang nhãn D và đều sai.');
  } else {
    console.log('\nĐây là bản xem trước. Thêm --commit để ghi thật.');
  }

  fs.writeFileSync(BAO_CAO, JSON.stringify({ daThem: baoCao, giuNguyen: boQua }, null, 1), 'utf8');
  console.log(`Báo cáo: ${path.relative(ROOT, BAO_CAO)}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Thất bại:', error.message);
    process.exit(1);
  });
