// Script crop sheet images hỗ trợ nhập, xuất, kiểm tra hoặc bảo trì dữ liệu và cấu hình của dự án.
/**
 * Cắt các tờ đề gộp thành từng ô câu hỏi riêng bằng Cloudinary.
 *
 * Bối cảnh: 13 ảnh của lớp 1 không phải tranh minh họa mà là một TỜ ĐỀ chứa 5 câu
 * hỏi, in sẵn cả đề lẫn phương án A/B/C/D bên trong. Gắn nguyên tờ vào một câu thì
 * học sinh nhìn thấy cả 4 câu khác, còn gỡ ảnh đi thì mất luôn phần minh họa vốn
 * có giá trị với học sinh lớp 1.
 *
 * Cách làm: tải ảnh gốc lên Cloudinary rồi dùng phép biến đổi c_crop để lấy ra
 * từng ô. Cắt ảnh không phải vẽ mới nên làm được; toạ độ mỗi ô do người vận hành
 * khai báo trong LAYOUTS sau khi nhìn ảnh.
 *
 * Toạ độ tính theo TỈ LỆ (0 đến 1) so với chiều rộng/cao ảnh, để không phụ thuộc
 * kích thước thật của từng tệp.
 *
 * Dùng:
 *   node scripts/crop_sheet_images.js --upload         -> đẩy 13 ảnh gốc lên
 *   node scripts/crop_sheet_images.js --preview <id>   -> in URL các ô đã cắt
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const cloudinary = require('cloudinary').v2;

const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const MAP_FILE = path.join(ROOT, 'tmp', 'sheet_crop_map.json');
const FOLDER = process.env.CLOUDINARY_FOLDER || 'toanbotro';

// Ảnh tờ đề gộp của lớp 1, theo thứ tự câu hỏi đầu tiên trong nhóm.
const SHEETS = [
  { url: '/uploads/images/grade1/g1-l001-q001-01.png', idDau: 5518 },
  { url: '/uploads/images/grade1/g1-l001-q006-01.png', idDau: 5523 },
  { url: '/uploads/images/grade1/g1-l001-q011-01.png', idDau: 5528 },
  { url: '/uploads/images/grade1/g1-l002-q001-01.png', idDau: 5565 },
  { url: '/uploads/images/grade1/g1-l002-q006-01.png', idDau: 5570 },
  { url: '/uploads/images/grade1/g1-l003-q001-01.png', idDau: 5598 },
  { url: '/uploads/images/grade1/g1-l004-q001-01.png', idDau: 5630 },
  { url: '/uploads/images/grade1/g1-l005-q001-01.png', idDau: 5662 },
  { url: '/uploads/images/grade1/g1-l006-q001-01.png', idDau: 5694 },
  { url: '/uploads/images/grade1/g1-l007-q001-01.png', idDau: 5727 },
  { url: '/uploads/images/grade1/g1-l008-q001-01.png', idDau: 5760 },
  { url: '/uploads/images/grade1/g1-l009-q001-01.png', idDau: 5793 },
  { url: '/uploads/images/grade1/g1-l001-q023-01.png', idDau: 5540 }
];

// Hàm publicIdTu dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function publicIdTu(url) {
  const rel = String(url).replace(/^\/uploads\/images\//, '').replace(/\.[^.]+$/, '');
  return `${FOLDER}/${rel}`;
}

// Hàm loadMap dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function loadMap() {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!fs.existsSync(MAP_FILE)) return {};
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  try {
    return JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'));
  } catch (error) {
    return {};
  }
}

// Hàm saveMap dùng để cập nhật trạng thái hoặc dữ liệu theo quy tắc nghiệp vụ; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function saveMap(map) {
  fs.mkdirSync(path.dirname(MAP_FILE), { recursive: true });
  fs.writeFileSync(MAP_FILE, JSON.stringify(map, null, 2), 'utf8');
}

// Dựng URL đã cắt. Tham số theo TỈ LỆ nên Cloudinary tự quy đổi ra pixel.
function urlCat(publicId, { x, y, w, h }) {
  const base = `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload`;
  const crop = `c_crop,x_${x},y_${y},w_${w},h_${h}`;
  return `${base}/${crop}/f_auto,q_auto/${publicId}`;
}

// Hàm upload dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function upload() {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });

  const map = loadMap();
  let xong = 0;

  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const sheet of SHEETS) {
    const filePath = path.join(PUBLIC_DIR, sheet.url.replace(/^\//, ''));
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!fs.existsSync(filePath)) {
      console.log(`  BỎ QUA (không có tệp): ${sheet.url}`);
      continue;
    }
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    try {
      const result = await cloudinary.uploader.upload(filePath, {
        public_id: publicIdTu(sheet.url),
        overwrite: true,
        resource_type: 'image'
      });
      map[sheet.url] = {
        public_id: result.public_id,
        secure_url: result.secure_url,
        width: result.width,
        height: result.height,
        idDau: sheet.idDau
      };
      xong += 1;
      console.log(`  ${result.width}x${result.height}  ${sheet.url.split('/').pop()}`);
    } catch (error) {
      console.log(`  LỖI ${sheet.url}: ${error.message}`);
    }
  }

  saveMap(map);
  console.log(`\nĐã đẩy ${xong}/${SHEETS.length} tờ đề lên Cloudinary.`);
  console.log(`Bảng: ${path.relative(ROOT, MAP_FILE)}`);
}

// Hàm preview dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function preview(url) {
  const map = loadMap();
  const info = map[url];
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!info) {
    console.log('Chưa có trong bảng, hãy chạy --upload trước.');
    return;
  }
  console.log(`${url}  (${info.width}x${info.height})`);
  console.log('Ảnh đầy đủ:', info.secure_url);
  console.log('');
  console.log('Thử vài vùng cắt theo tỉ lệ để dò bố cục:');
  const vung = {
    'nua-trai': { x: 0, y: 0, w: 0.5, h: 1 },
    'nua-phai': { x: 0.5, y: 0, w: 0.5, h: 1 },
    'nua-tren': { x: 0, y: 0, w: 1, h: 0.5 },
    'nua-duoi': { x: 0, y: 0.5, w: 1, h: 0.5 },
    'goc-trai-tren': { x: 0, y: 0, w: 0.34, h: 0.56 }
  };
  Object.entries(vung).forEach(([ten, v]) => {
    console.log(`  ${ten.padEnd(16)} ${urlCat(info.public_id, v)}`);
  });
}

// Chỉ chạy phần dòng lệnh khi gọi trực tiếp, để file còn dùng được như module.
if (require.main === module) {
  const args = process.argv.slice(2);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (args.includes('--upload')) {
    upload().then(() => process.exit(0)).catch((e) => {
      console.error(e.message);
      process.exit(1);
    });
  } else if (args.includes('--preview')) {
    preview(args[args.indexOf('--preview') + 1]);
    process.exit(0);
  } else {
    console.log('Dùng: --upload  hoặc  --preview <đường dẫn ảnh>');
    process.exit(0);
  }
}

module.exports = { urlCat, loadMap, SHEETS };
