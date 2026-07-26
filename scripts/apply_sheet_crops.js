/**
 * Gắn ảnh đã cắt vào từng câu hỏi và đồng bộ phương án theo đúng ảnh.
 *
 * Bối cảnh: 13 ảnh của lớp 1 là TỜ ĐỀ gộp nhiều câu, in sẵn cả đề lẫn phương án
 * A/B/C/D bên trong. Một lượt phân tích đã cắt mỗi tờ thành từng ô, kiểm chứng
 * bằng cách tải ảnh cắt về xem, rồi đối chiếu với câu hỏi trong cơ sở dữ liệu.
 *
 * Việc script này làm cho mỗi ô dùng được:
 *   1. Gắn URL ảnh đã cắt (Cloudinary c_crop) làm ảnh minh họa của câu hỏi.
 *   2. Sắp lại thứ tự phương án cho khớp nhãn A/B/C/D in trong ảnh.
 *   3. Đặt lại đáp án đúng theo đúng nhãn trong ảnh.
 *   4. Khôi phục đề bài theo đúng chữ in trong ảnh.
 *
 * Vì sao phải làm cả bốn: cắt ảnh thôi chưa đủ, vì ảnh cắt ra VẪN in nhãn
 * A/B/C/D. Nếu thứ tự trong cơ sở dữ liệu khác thứ tự in trong ảnh thì học sinh
 * đọc ảnh bấm đúng vẫn bị chấm sai.
 *
 * Dùng:
 *   node scripts/apply_sheet_crops.js            -> xem trước
 *   node scripts/apply_sheet_crops.js --commit   -> ghi vào MySQL và .tex
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const db = require('../config/db');
const { urlCat, loadMap } = require('./crop_sheet_images');

const COMMIT = process.argv.includes('--commit');
const ROOT = path.join(__dirname, '..');
const KET_QUA = path.join(ROOT, 'tmp', 'ket_qua_cat.json');
const TEX = path.join(ROOT, 'data', 'grade1_question_bank_reviewed.tex');
const BAO_CAO = path.join(ROOT, 'tmp', 'bao_cao_cat_anh.json');

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

// Lỗi chính tả in nhầm trong ảnh gốc. Giữ nguyên nghĩa, chỉ thêm dấu cho đúng.
const SUA_CHINH_TA = new Map([
  ['Trên ban', 'Trên bàn']
]);

function suaLoiChinhTa(text) {
  return SUA_CHINH_TA.get(text) || text;
}

// Bỏ tiền tố "Câu 7:" mà ảnh in ở đầu, vì số thứ tự trong tờ đề không còn ý nghĩa
// khi câu hỏi đứng riêng trong hệ thống.
function lamSachDeBai(text) {
  return String(text || '')
    .replace(/^C[âa]u\s*\d+\s*[::.]\s*/iu, '')
    .trim();
}

async function main() {
  const ketQua = JSON.parse(fs.readFileSync(KET_QUA, 'utf8'));
  const anhMap = loadMap();
  const lines = fs.readFileSync(TEX, 'utf8').split('\n');

  const oDungDuoc = ketQua.chiTiet
    .flatMap((to) => (to.o || []).map((o) => ({ ...o, url_anh: to.url_anh })))
    .filter((o) => o.dung_duoc && o.da_kiem_chung && o.question_id > 0
      && Array.isArray(o.phuong_an_trong_anh) && o.phuong_an_trong_anh.length >= 3);

  const baoCao = [];
  let suaDb = 0;
  let suaTex = 0;
  let boQua = 0;

  for (const o of oDungDuoc) {
    const info = anhMap[o.url_anh];
    if (!info) {
      console.log(`  BỎ QUA id ${o.question_id}: chưa có ảnh gốc trên Cloudinary`);
      boQua += 1;
      continue;
    }

    const rows = await db.query(
      'SELECT q.id, q.content, q.choices, q.correct_answer, l.lesson_name '
      + 'FROM QuestionBank q JOIN Lessons l ON l.id = q.lesson_id WHERE q.id = ?',
      [o.question_id]
    );
    if (rows.length === 0) {
      boQua += 1;
      continue;
    }

    const row = rows[0];
    const contentCu = parseJson(row.content, {}) || {};
    const choicesCu = parseJson(row.choices, []) || [];

    const urlAnhCat = urlCat(info.public_id, o.crop);
    const deBaiMoi = lamSachDeBai(o.de_bai_trong_anh);

    // Phương án lấy nguyên theo ảnh: đó là thứ học sinh nhìn thấy, nên hệ thống
    // phải chấm theo đúng nhãn đó. Riêng lỗi chính tả in trong ảnh thì sửa lại
    // cho đúng, không đưa lỗi vào dữ liệu; phần chữ trong ảnh sẽ chỉnh khi nào
    // vẽ lại được ảnh.
    const choicesMoi = o.phuong_an_trong_anh.map((pa) => ({
      key: String(pa.key).trim().toUpperCase(),
      text: suaLoiChinhTa(String(pa.text || '').trim()),
      images: []
    }));

    const dapAnMoi = String(o.dap_an_dung_theo_anh || '').trim().toUpperCase().slice(0, 1);
    if (!choicesMoi.some((c) => c.key === dapAnMoi)) {
      console.log(`  BỎ QUA id ${o.question_id}: đáp án "${dapAnMoi}" không có trong phương án`);
      boQua += 1;
      continue;
    }

    const contentMoi = {
      ...contentCu,
      text: deBaiMoi,
      images: [{
        id: `image-1`,
        url: urlAnhCat,
        alt_text: `Hình minh họa cho câu hỏi`,
        width_percent: 100
      }]
    };

    baoCao.push({
      id: row.id,
      bai_hoc: row.lesson_name,
      to_de: o.url_anh,
      o_trong_to: o.so_cau_trong_anh,
      crop: o.crop,
      url_anh_cat: urlAnhCat,
      de_cu: String(contentCu.text || ''),
      de_moi: deBaiMoi,
      phuong_an_cu: choicesCu.map((c) => ({ key: c.key, text: String(c.text || '') })),
      phuong_an_moi: choicesMoi.map((c) => ({ key: c.key, text: c.text })),
      dap_an_cu: row.correct_answer,
      dap_an_moi: dapAnMoi,
      doi_dap_an: row.correct_answer !== dapAnMoi,
      ghi_chu: o.ghi_chu || ''
    });

    if (COMMIT) {
      await db.query(
        'UPDATE QuestionBank SET content = CAST(? AS JSON), choices = CAST(? AS JSON), correct_answer = ? WHERE id = ?',
        [JSON.stringify(contentMoi), JSON.stringify(choicesMoi), dapAnMoi, row.id]
      );
      suaDb += 1;
    }

    // Đồng bộ file .tex. Tra theo đề bài hiện có trong cơ sở dữ liệu vì payload
    // không lưu id của MySQL.
    const deCu = String(contentCu.text || '');
    for (let i = 0; i < lines.length; i += 1) {
      if (!lines[i].startsWith('% DBJSON ')) continue;
      let payload;
      try {
        payload = decode(lines[i].slice('% DBJSON '.length).trim());
      } catch (error) {
        continue;
      }
      if (String(payload.content?.text || '') !== deCu) continue;

      payload.content.text = deBaiMoi;
      payload.content.images = contentMoi.images;
      payload.choices = choicesMoi;
      payload.correct_answer = dapAnMoi;
      lines[i] = `% DBJSON ${encode(payload)}`;

      let end = i + 1;
      while (end < lines.length && !lines[end].includes('\\end{minipage}')) end += 1;
      for (let j = i + 1; j <= end; j += 1) {
        const cr = lines[j].endsWith('\r') ? '\r' : '';
        const noiDung = lines[j].replace(/\r$/, '');
        const khopDe = noiDung.match(/^(\\noindent\\textbf\{[^}]+\}\s*)(.*)$/);
        if (khopDe) {
          lines[j] = `${khopDe[1]}${deBaiMoi}${cr}`;
          continue;
        }
        const khopItem = noiDung.match(/^\\item ([A-D])\. /);
        if (khopItem) {
          const pa = choicesMoi.find((c) => c.key === khopItem[1]);
          if (pa) lines[j] = `\\item ${pa.key}. ${pa.text}${cr}`;
          continue;
        }
        if (noiDung.includes('Đáp án đúng:')) {
          lines[j] = noiDung.replace(/(Đáp án đúng:\} )([A-D])/, `$1${dapAnMoi}`) + cr;
        }
      }
      suaTex += 1;
      break;
    }
  }

  console.log(`Ô xử lý được:     ${baoCao.length}`);
  console.log(`  Bỏ qua:         ${boQua}`);
  console.log(`  Đổi đáp án:     ${baoCao.filter((b) => b.doi_dap_an).length}`);
  console.log(`  Sửa trong .tex: ${suaTex}`);

  if (COMMIT) {
    console.log(`  Cập nhật MySQL: ${suaDb}`);
    fs.writeFileSync(TEX, lines.join('\n'), 'utf8');
    console.log(`  Đã ghi ${path.basename(TEX)}`);
  } else {
    console.log('\nĐây là bản xem trước. Thêm --commit để ghi thật.');
  }

  fs.writeFileSync(BAO_CAO, JSON.stringify(baoCao, null, 1), 'utf8');
  console.log(`  Báo cáo:        ${path.relative(ROOT, BAO_CAO)}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Thất bại:', error.message);
    process.exit(1);
  });
