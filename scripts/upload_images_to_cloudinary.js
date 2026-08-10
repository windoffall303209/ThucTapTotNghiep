// Script upload images to cloudinary h? tr? nh?p, xu?t, ki?m tra ho?c b?o tr? d? li?u v? c?u h?nh c?a d? ?n.
/**
 * Đẩy toàn bộ ảnh câu hỏi và ảnh lý thuyết lên Cloudinary, đồng thời cập nhật
 * đường dẫn trong cơ sở dữ liệu.
 *
 * Vì sao cần: thư mục public/uploads/images bị .gitignore loại khỏi repo, nên
 * 4786 tệp ảnh chỉ tồn tại trên máy đang phát triển. Máy hỏng hoặc clone repo ở
 * nơi khác là mất toàn bộ phần hình của ngân hàng câu hỏi.
 *
 * Ảnh được tải lên NGUYÊN GỐC, không nén và không thu nhỏ. Phần tối ưu chuyển
 * sang làm lúc phục vụ, xem chú thích ở hằng TRANSFORMATION bên dưới.
 *
 * Dùng:
 *   node scripts/upload_images_to_cloudinary.js --limit 5     -> thử 5 ảnh
 *   node scripts/upload_images_to_cloudinary.js               -> xem trước toàn bộ
 *   node scripts/upload_images_to_cloudinary.js --commit      -> đẩy thật + cập nhật DB
 *
 * Có thể dừng giữa chừng rồi chạy lại: ảnh đã có trên Cloudinary sẽ được bỏ qua
 * nhờ đối chiếu bảng ánh xạ lưu trong data/cloudinary_image_map.json.
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const cloudinary = require('cloudinary').v2;
const db = require('../config/db');

const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const MAP_FILE = path.join(ROOT, 'data', 'cloudinary_image_map.json');
const FOLDER = process.env.CLOUDINARY_FOLDER || 'toanbotro';

const COMMIT = process.argv.includes('--commit');
const limitArg = process.argv.indexOf('--limit');
const LIMIT = limitArg !== -1 ? Number(process.argv[limitArg + 1]) : Infinity;

/**
 * KHÔNG biến đổi ảnh khi tải lên. Bản lưu trên Cloudinary giữ nguyên độ phân giải
 * và chất lượng gốc.
 *
 * Ban đầu script có nén sang WebP 1200px để tiết kiệm dung lượng (giảm khoảng
 * 92%), nhưng đó là tối ưu sai chỗ: tài khoản mới dùng 1,72% trong 25 credits nên
 * dung lượng không phải thứ cần tiết kiệm, còn ảnh gốc thì nén rồi không lấy lại
 * được. Với ngân hàng câu hỏi của một đồ án thì bản gốc quan trọng hơn.
 *
 * Việc tối ưu chuyển sang làm lúc PHỤC VỤ: đường dẫn hiển thị chèn f_auto,q_auto
 * để Cloudinary tự chọn định dạng nhẹ nhất mà trình duyệt của học sinh hỗ trợ,
 * trong khi bản gốc vẫn nằm nguyên trên máy chủ và lấy về được bất cứ lúc nào.
 */
const TRANSFORMATION = undefined;

// Chèn vào giữa "/upload/" và phần còn lại của đường dẫn để lấy bản đã tối ưu.
const DELIVERY_HINT = 'f_auto,q_auto';

// H?m duongDanToiUu d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function duongDanToiUu(secureUrl) {
  return secureUrl.replace('/image/upload/', `/image/upload/${DELIVERY_HINT}/`);
}

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

// H?m loadMap d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function loadMap() {
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!fs.existsSync(MAP_FILE)) return {};
  return parseJson(fs.readFileSync(MAP_FILE, 'utf8'), {});
}

// H?m saveMap d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function saveMap(map) {
  fs.mkdirSync(path.dirname(MAP_FILE), { recursive: true });
  fs.writeFileSync(MAP_FILE, JSON.stringify(map, null, 2), 'utf8');
}

// Gom mọi ảnh đang được tham chiếu từ QuestionBank và Lessons.
async function thuThapAnh() {
  const urls = new Set();

  const questions = await db.query(
    `SELECT q.content, q.choices, q.explanation FROM QuestionBank q
     JOIN Lessons l ON l.id = q.lesson_id
     JOIN Chapters ch ON ch.id = l.chapter_id`
  );
  questions.forEach((row) => {
    const content = parseJson(row.content, {}) || {};
    const explanation = parseJson(row.explanation, {}) || {};
    const choices = parseJson(row.choices, []) || [];
    [
      ...(content.images || []),
      ...(explanation.images || []),
      ...choices.flatMap((choice) => choice.images || [])
    ].forEach((image) => {
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (image && image.url) urls.add(image.url);
    });
  });

  const lessons = await db.query('SELECT theory_cards FROM Lessons');
  lessons.forEach((row) => {
    (parseJson(row.theory_cards, []) || []).forEach((card) => {
      (card.images || []).forEach((image) => {
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (image && image.url) urls.add(image.url);
      });
    });
  });

  return [...urls].sort();
}

// H?m duongDanCucBo d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function duongDanCucBo(url) {
  return path.join(PUBLIC_DIR, String(url).replace(/^\//, ''));
}

// public_id giữ nguyên cấu trúc thư mục để dễ đối chiếu về sau.
function publicIdTu(url) {
  const rel = String(url).replace(/^\/uploads\/images\//, '').replace(/\.[^.]+$/, '');
  return `${FOLDER}/${rel}`;
}

// H?m main d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function main() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Thiếu CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET trong .env');
  }
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });

  const map = loadMap();
  const urls = await thuThapAnh();

  const canDay = urls.filter((url) => !map[url]);
  const thieuFile = canDay.filter((url) => !fs.existsSync(duongDanCucBo(url)));
  const saoChep = canDay.filter((url) => fs.existsSync(duongDanCucBo(url)));

  console.log(`Ảnh đang được tham chiếu: ${urls.length}`);
  console.log(`  Đã có trên Cloudinary:  ${urls.length - canDay.length}`);
  console.log(`  Cần đẩy lên:            ${saoChep.length}`);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (thieuFile.length > 0) {
    console.log(`  KHÔNG tìm thấy tệp:     ${thieuFile.length}`);
    thieuFile.slice(0, 5).forEach((url) => console.log(`    ${url}`));
  }

  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!COMMIT) {
    const tongXemTruoc = saoChep.reduce((sum, url) => sum + fs.statSync(duongDanCucBo(url)).size, 0);
    console.log(`  Dung lượng gốc:         ${(tongXemTruoc / 1024 / 1024 / 1024).toFixed(2)} GB`);
    console.log('\nĐây là bản xem trước. Thêm --commit để đẩy thật.');
    return;
  }

  let thanhCong = 0;
  let thatBai = 0;
  let byteGoc = 0;
  let byteSau = 0;
  const danhSach = saoChep.slice(0, LIMIT);

  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (let i = 0; i < danhSach.length; i += 1) {
    const url = danhSach[i];
    const filePath = duongDanCucBo(url);
    // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
    try {
      const goc = fs.statSync(filePath).size;
      const result = await cloudinary.uploader.upload(filePath, {
        public_id: publicIdTu(url),
        overwrite: true,
        resource_type: 'image',
        transformation: TRANSFORMATION
      });

      map[url] = {
        // Bản gốc, dùng khi cần lấy lại đúng chất lượng ban đầu.
        secure_url: result.secure_url,
        // Bản để nhúng vào trang, Cloudinary tự tối ưu theo trình duyệt.
        delivery_url: duongDanToiUu(result.secure_url),
        public_id: result.public_id,
        bytes: result.bytes,
        format: result.format,
        width: result.width,
        height: result.height
      };
      byteGoc += goc;
      byteSau += result.bytes;
      thanhCong += 1;

      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (thanhCong % 25 === 0 || thanhCong === danhSach.length) {
        saveMap(map);
        const pct = ((i + 1) / danhSach.length * 100).toFixed(1);
        console.log(`  ${i + 1}/${danhSach.length} (${pct}%) — giảm ${(100 - byteSau / byteGoc * 100).toFixed(1)}%`);
      }
    } catch (error) {
      thatBai += 1;
      console.log(`  LỖI ${url}: ${error.message || JSON.stringify(error)}`);
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (thatBai > 20) {
        console.log('  Quá nhiều lỗi liên tiếp, dừng lại để kiểm tra.');
        break;
      }
    }
  }

  saveMap(map);
  console.log(`\nĐẩy xong: ${thanhCong} thành công, ${thatBai} lỗi.`);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (byteGoc > 0) {
    console.log(`  Dung lượng: ${(byteGoc / 1024 / 1024).toFixed(0)} MB -> ${(byteSau / 1024 / 1024).toFixed(0)} MB`);
    console.log(`  Giảm ${(100 - byteSau / byteGoc * 100).toFixed(1)}%`);
  }
  console.log(`  Bảng ánh xạ: ${path.relative(ROOT, MAP_FILE)}`);
  console.log('\nChạy scripts/apply_cloudinary_urls.js để cập nhật đường dẫn trong cơ sở dữ liệu.');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Thất bại:', error.message);
    process.exit(1);
  });
