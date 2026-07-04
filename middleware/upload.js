const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const imageStorage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, path.join(__dirname, '..', 'public', 'uploads', 'images'));
  },
  filename(req, file, cb) {
    const extension = path.extname(file.originalname).toLowerCase();
    const safeName = crypto.randomBytes(12).toString('hex');
    cb(null, `${Date.now()}-${safeName}${extension}`);
  }
});

function imageFileFilter(req, file, cb) {
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowedMimeTypes.includes(file.mimetype)) {
    return cb(new Error('Chỉ chấp nhận tệp ảnh JPG, PNG, WEBP hoặc GIF.'));
  }
  return cb(null, true);
}

const questionImageUpload = multer({
  storage: imageStorage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 40
  }
});

module.exports = {
  questionImageUpload
};
