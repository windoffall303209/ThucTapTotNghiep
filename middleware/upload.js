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
const MAX_MULTIPART_REQUEST_BYTES = 30 * 1024 * 1024;
const MAX_MULTIPART_FIELDS = 128;
const MAX_MULTIPART_FIELD_SIZE_BYTES = 512 * 1024;

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

const baseQuestionImageUpload = multer({
  storage: imageStorage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 24,
    fields: MAX_MULTIPART_FIELDS,
    fieldSize: MAX_MULTIPART_FIELD_SIZE_BYTES,
    parts: MAX_MULTIPART_FIELDS + 24
  }
});
const questionImageUpload = {
  any: (...args) => limitMultipartRequest(baseQuestionImageUpload.any(...args)),
  fields: (...args) => limitMultipartRequest(baseQuestionImageUpload.fields(...args))
};

function limitMultipartRequest(uploadMiddleware, maxBytes = MAX_MULTIPART_REQUEST_BYTES) {
  return (req, res, next) => {
    if (!isMultipartRequest(req)) {
      return uploadMiddleware(req, res, next);
    }

    const contentLength = readContentLength(req);
    if (contentLength !== null && contentLength > maxBytes) {
      req.resume();
      return next(uploadRequestTooLargeError());
    }

    let streamedBytes = 0;
    let limitExceeded = false;
    const countChunk = (chunk) => {
      if (limitExceeded) return;
      streamedBytes += Buffer.isBuffer(chunk)
        ? chunk.length
        : Buffer.byteLength(String(chunk || ''));
      if (streamedBytes <= maxBytes) return;

      limitExceeded = true;
      // Multer listens for request errors and uses that path to stop Busboy and
      // remove every file already written by the current request.
      req.emit('error', uploadRequestTooLargeError());
    };

    req.on('data', countChunk);
    return uploadMiddleware(req, res, (error) => {
      req.off('data', countChunk);
      return next(error);
    });
  };
}

function isMultipartRequest(req) {
  return String(req.get?.('content-type') || req.headers?.['content-type'] || '')
    .toLowerCase()
    .startsWith('multipart/form-data');
}

function readContentLength(req) {
  const rawValue = String(req.get?.('content-length') || req.headers?.['content-length'] || '').trim();
  if (!/^\d+$/.test(rawValue)) return null;
  const value = Number(rawValue);
  return Number.isSafeInteger(value) ? value : null;
}

function uploadRequestTooLargeError() {
  const error = new Error('Tổng dung lượng biểu mẫu và ảnh trong một lần gửi không được vượt quá 30 MB.');
  error.code = 'UPLOAD_REQUEST_TOO_LARGE';
  error.status = 413;
  return error;
}

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
  MAX_MULTIPART_FIELDS,
  MAX_MULTIPART_FIELD_SIZE_BYTES,
  MAX_MULTIPART_REQUEST_BYTES,
  commitRequestUploads,
  detectImageType,
  limitMultipartRequest,
  prepareUploadCleanup,
  questionImageUpload,
  validateUploadedImages
};
