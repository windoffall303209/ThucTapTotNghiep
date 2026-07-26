/**
 * Sao lưu toàn bộ ảnh sang một thư mục nằm NGOÀI repo.
 *
 * Vì sao cần: .gitignore loại public/uploads/images khỏi repo nên 4786 tệp ảnh
 * chỉ tồn tại trong thư mục làm việc. Nếu lỡ xóa thư mục dự án, chạy git clean,
 * hoặc clone lại ở máy khác là mất sạch phần hình của ngân hàng câu hỏi.
 *
 * Thư mục đích mặc định nằm cạnh thư mục dự án (../ThucTapTotNghiep_anh_backup)
 * để không bị git đụng tới và cũng không bị lẫn vào bản nộp đồ án.
 *
 * Dùng:
 *   node scripts/backup_images_local.js                  -> xem trước
 *   node scripts/backup_images_local.js --commit         -> sao chép thật
 *   node scripts/backup_images_local.js --commit --dest "D:/AnhDoAn"
 *
 * Chạy lại nhiều lần được: tệp đã có và cùng kích thước sẽ được bỏ qua.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'public', 'uploads', 'images');

const COMMIT = process.argv.includes('--commit');
const destArg = process.argv.indexOf('--dest');
const DEST = destArg !== -1
  ? path.resolve(process.argv[destArg + 1])
  : path.resolve(ROOT, '..', 'ThucTapTotNghiep_anh_backup');

function liet(dir, base = dir) {
  const out = [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...liet(full, base));
    else out.push({ rel: path.relative(base, full), size: fs.statSync(full).size });
  });
  return out;
}

function dinhDang(bytes) {
  if (bytes > 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function main() {
  if (!fs.existsSync(SOURCE)) {
    throw new Error(`Không tìm thấy thư mục nguồn: ${SOURCE}`);
  }

  const files = liet(SOURCE);
  const tongByte = files.reduce((sum, file) => sum + file.size, 0);

  console.log(`Nguồn: ${SOURCE}`);
  console.log(`Đích:  ${DEST}`);
  console.log(`Số tệp: ${files.length} — ${dinhDang(tongByte)}\n`);

  const canChep = files.filter((file) => {
    const target = path.join(DEST, file.rel);
    if (!fs.existsSync(target)) return true;
    // Đã có nhưng khác kích thước thì chép đè, coi như bản nguồn mới hơn.
    return fs.statSync(target).size !== file.size;
  });

  console.log(`Đã có sẵn ở đích: ${files.length - canChep.length}`);
  console.log(`Cần sao chép:     ${canChep.length} — ${dinhDang(canChep.reduce((s, f) => s + f.size, 0))}`);

  if (!COMMIT) {
    console.log('\nĐây là bản xem trước. Thêm --commit để sao chép thật.');
    return;
  }

  let xong = 0;
  canChep.forEach((file, index) => {
    const from = path.join(SOURCE, file.rel);
    const to = path.join(DEST, file.rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    xong += 1;
    if (xong % 500 === 0 || index === canChep.length - 1) {
      console.log(`  ${xong}/${canChep.length}`);
    }
  });

  // Ghi kèm một tệp mô tả để sau này mở ra còn biết đây là gì.
  fs.writeFileSync(
    path.join(DEST, 'DOC-THEM.txt'),
    [
      'Sao lưu ảnh của dự án ThucTapTotNghiep (website ôn luyện Toán Tiểu học).',
      '',
      `Nguồn gốc: public/uploads/images trong repo, thư mục này bị .gitignore loại`,
      'khỏi git nên không có bản nào trên GitHub.',
      '',
      `Số tệp: ${files.length}`,
      `Dung lượng: ${dinhDang(tongByte)}`,
      '',
      'Khôi phục: chép toàn bộ thư mục con (grade1..grade5, crawled, ...) trở lại',
      'vào public/uploads/images của dự án.',
      '',
      'Ảnh cũng đã được đẩy lên Cloudinary, xem data/cloudinary_image_map.json',
      'trong repo để tra đường dẫn từng tệp.'
    ].join('\n'),
    'utf8'
  );

  console.log(`\nĐã sao lưu ${xong} tệp sang ${DEST}`);
  console.log('Kèm tệp DOC-THEM.txt mô tả nội dung và cách khôi phục.');
}

try {
  main();
} catch (error) {
  console.error('Thất bại:', error.message);
  process.exit(1);
}
