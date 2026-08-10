// Script upload images to cloudinary hỗ trợ nhập, xuất, kiểm tra hoặc bảo trì dữ liệu và cấu hình của dự án.
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

// Hàm duongDanToiUu dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function duongDanToiUu(secureUrl) {
  return secureUrl.replace('/image/upload/', `/image/upload/${DELIVERY_HINT}/`);
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

// Hàm loadMap dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function loadMap() {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!fs.existsSync(MAP_FILE)) return {};
  return parseJson(fs.readFileSync(MAP_FILE, 'utf8'), {});
}

// Hàm saveMap dùng để cập nhật trạng thái hoặc dữ liệu theo quy tắc nghiệp vụ; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
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
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (image && image.url) urls.add(image.url);
    });
  });

  const lessons = await db.query('SELECT theory_cards FROM Lessons');
  lessons.forEach((row) => {
    (parseJson(row.theory_cards, []) || []).forEach((card) => {
      (card.images || []).forEach((image) => {
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (image && image.url) urls.add(image.url);
      });
    });
  });

  return [...urls].sort();
}

// Hàm duongDanCucBo dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function duongDanCucBo(url) {
  return path.join(PUBLIC_DIR, String(url).replace(/^\//, ''));
}

// public_id giữ nguyên cấu trúc thư mục để dễ đối chiếu về sau.
function publicIdTu(url) {
  const rel = String(url).replace(/^\/uploads\/images\//, '').replace(/\.[^.]+$/, '');
  return `${FOLDER}/${rel}`;
}

// Hàm main dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function main() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (thieuFile.length > 0) {
    console.log(`  KHÔNG tìm thấy tệp:     ${thieuFile.length}`);
    thieuFile.slice(0, 5).forEach((url) => console.log(`    ${url}`));
  }

  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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

  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (let i = 0; i < danhSach.length; i += 1) {
    const url = danhSach[i];
    const filePath = duongDanCucBo(url);
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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

      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (thanhCong % 25 === 0 || thanhCong === danhSach.length) {
        saveMap(map);
        const pct = ((i + 1) / danhSach.length * 100).toFixed(1);
        console.log(`  ${i + 1}/${danhSach.length} (${pct}%) — giảm ${(100 - byteSau / byteGoc * 100).toFixed(1)}%`);
      }
    } catch (error) {
      thatBai += 1;
      console.log(`  LỖI ${url}: ${error.message || JSON.stringify(error)}`);
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (thatBai > 20) {
        console.log('  Quá nhiều lỗi liên tiếp, dừng lại để kiểm tra.');
        break;
      }
    }
  }

  saveMap(map);
  console.log(`\nĐẩy xong: ${thanhCong} thành công, ${thatBai} lỗi.`);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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
