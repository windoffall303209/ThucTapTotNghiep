const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const fsPromises = require('fs/promises');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;

const TEMP_UPLOAD_DIR = path.join(__dirname, '..', 'storage', 'tmp', 'uploads');
const PUBLIC_IMAGE_DIR = path.join(__dirname, '..', 'public', 'uploads', 'images');
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_REQUEST_IMAGE_BYTES = 25 * 1024 * 1024;

fs.mkdirSync(TEMP_UPLOAD_DIR, { recursive: true });
fs.mkdirSync(PUBLIC_IMAGE_DIR, { recursive: true });

const imageStorage = multer.diskStorage({
  destination(req, file, callback) {
    callback(null, TEMP_UPLOAD_DIR);
  },
  filename(req, file, callback) {
    callback(null, `${Date.now()}-${crypto.randomBytes(16).toString('hex')}.upload`);
  }
});

function imageFileFilter(req, file, callback) {
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowedMimeTypes.includes(String(file.mimetype || '').toLowerCase())) {
    return callback(uploadError('Chỉ chấp nhận tệp ảnh JPG, PNG, WEBP hoặc GIF.'));
  }
  return callback(null, true);
}

const questionImageUpload = multer({
  storage: imageStorage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 24,
    fields: 250,
    fieldSize: 2 * 1024 * 1024
  }
});

async function validateUploadedImages(req, res, next) {
  const files = flattenFiles(req.files);
  if (files.length === 0) return next();

  attachUploadCleanup(req, res);

  try {
    const totalBytes = files.reduce((sum, file) => sum + Number(file.size || 0), 0);
    if (totalBytes > MAX_REQUEST_IMAGE_BYTES) {
      throw uploadError('Tổng dung lượng ảnh trong một lần gửi không được vượt quá 25 MB.');
    }

    for (const file of files) {
      const detected = await detectImageType(file.path);
      if (!detected) {
        throw uploadError(`Tệp "${safeDisplayName(file.originalname)}" không phải ảnh hợp lệ.`);
      }

      const finalFilename = `${Date.now()}-${crypto.randomBytes(16).toString('hex')}.${detected.extension}`;
      const finalPath = path.join(PUBLIC_IMAGE_DIR, finalFilename);
      await fsPromises.rename(file.path, finalPath);
      file.path = finalPath;
      file.destination = PUBLIC_IMAGE_DIR;
      file.filename = finalFilename;
      file.mimetype = detected.mimeType;
      file.detectedImageType = detected.extension;
    }
    return next();
  } catch (error) {
    await cleanupRequestUploads(req);
    return next(error);
  }
}

function prepareUploadCleanup(req, res, next) {
  attachUploadCleanup(req, res);
  next();
}

function commitRequestUploads(req) {
  req.uploadsCommitted = true;
}

function attachUploadCleanup(req, res) {
  if (req.uploadCleanupAttached) return;
  req.uploadCleanupAttached = true;
  let cleanupStarted = false;
  const cleanup = () => {
    if (cleanupStarted || req.uploadsCommitted) return;
    cleanupStarted = true;
    cleanupRequestUploads(req).catch(() => {});
  };
  res.once('finish', cleanup);
  res.once('close', cleanup);
}

async function cleanupRequestUploads(req) {
  const files = flattenFiles(req.files);
  await Promise.all(files.map(async (file) => {
    if (file?.cloudinaryPublicId) {
      try {
        await cloudinary.uploader.destroy(file.cloudinaryPublicId, { resource_type: 'image' });
      } catch (error) {
        // Best-effort rollback. The local temporary file is still cleaned below.
      }
    }
    if (!file?.path) return;
    try {
      await fsPromises.unlink(file.path);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }));
}

async function detectImageType(filePath) {
  const handle = await fsPromises.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(16);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const header = buffer.subarray(0, bytesRead);

    if (header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
      return { extension: 'jpg', mimeType: 'image/jpeg' };
    }
    if (
      header.length >= 8
      && header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    ) {
      return { extension: 'png', mimeType: 'image/png' };
    }
    const signature = header.subarray(0, 6).toString('ascii');
    if (signature === 'GIF87a' || signature === 'GIF89a') {
      return { extension: 'gif', mimeType: 'image/gif' };
    }
    if (
      header.length >= 12
      && header.subarray(0, 4).toString('ascii') === 'RIFF'
      && header.subarray(8, 12).toString('ascii') === 'WEBP'
    ) {
      return { extension: 'webp', mimeType: 'image/webp' };
    }
    return null;
  } finally {
    await handle.close();
  }
}

function flattenFiles(files) {
  if (Array.isArray(files)) return files;
  if (!files || typeof files !== 'object') return [];
  return Object.values(files).flat().filter(Boolean);
}

function uploadError(message) {
  const error = new Error(message);
  error.code = 'INVALID_IMAGE_UPLOAD';
  error.status = 400;
  return error;
}

function safeDisplayName(value) {
  return path.basename(String(value || 'tệp đã tải')).slice(0, 120);
}

module.exports = {
  commitRequestUploads,
  detectImageType,
  prepareUploadCleanup,
  questionImageUpload,
  validateUploadedImages
};
