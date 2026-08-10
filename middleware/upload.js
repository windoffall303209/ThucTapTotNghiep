// Middleware upload ki?m tra ho?c b? sung ng? c?nh tr??c khi y?u c?u ?i v?o b? x? l? ti?p theo.
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
  // H?m destination d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  destination(req, file, callback) {
    callback(null, TEMP_UPLOAD_DIR);
  },
  // H?m filename d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  filename(req, file, callback) {
    callback(null, `${Date.now()}-${crypto.randomBytes(16).toString('hex')}.upload`);
  }
});

// H?m imageFileFilter d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function imageFileFilter(req, file, callback) {
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
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

// H?m limitMultipartRequest d?ng ?? x? l? y?u c?u, ?i?u ph?i c?c b??c nghi?p v? v? ph?n h?i l?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function limitMultipartRequest(uploadMiddleware, maxBytes = MAX_MULTIPART_REQUEST_BYTES) {
  return (req, res, next) => {
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!isMultipartRequest(req)) {
      return uploadMiddleware(req, res, next);
    }

    const contentLength = readContentLength(req);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (contentLength !== null && contentLength > maxBytes) {
      req.resume();
      return next(uploadRequestTooLargeError());
    }

    let streamedBytes = 0;
    let limitExceeded = false;
    // H?m countChunk d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
    const countChunk = (chunk) => {
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (limitExceeded) return;
      streamedBytes += Buffer.isBuffer(chunk)
        ? chunk.length
        : Buffer.byteLength(String(chunk || ''));
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
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

// H?m isMultipartRequest d?ng ?? x? l? y?u c?u, ?i?u ph?i c?c b??c nghi?p v? v? ph?n h?i l?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function isMultipartRequest(req) {
  return String(req.get?.('content-type') || req.headers?.['content-type'] || '')
    .toLowerCase()
    .startsWith('multipart/form-data');
}

// H?m readContentLength d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function readContentLength(req) {
  const rawValue = String(req.get?.('content-length') || req.headers?.['content-length'] || '').trim();
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!/^\d+$/.test(rawValue)) return null;
  const value = Number(rawValue);
  return Number.isSafeInteger(value) ? value : null;
}

// H?m uploadRequestTooLargeError d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function uploadRequestTooLargeError() {
  const error = new Error('Tổng dung lượng biểu mẫu và ảnh trong một lần gửi không được vượt quá 30 MB.');
  error.code = 'UPLOAD_REQUEST_TOO_LARGE';
  error.status = 413;
  return error;
}

// H?m validateUploadedImages d?ng ?? ki?m tra t?nh h?p l? v? c?c ?i?u ki?n an to?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function validateUploadedImages(req, res, next) {
  const files = flattenFiles(req.files);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (files.length === 0) return next();

  attachUploadCleanup(req, res);

  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    const totalBytes = files.reduce((sum, file) => sum + Number(file.size || 0), 0);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (totalBytes > MAX_REQUEST_IMAGE_BYTES) {
      throw uploadError('Tổng dung lượng ảnh trong một lần gửi không được vượt quá 25 MB.');
    }

    // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
    for (const file of files) {
      const detected = await detectImageType(file.path);
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
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
    await cleanupRequestUploads(req).catch(() => {});
    return next(error);
  }
}

// H?m prepareUploadCleanup d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function prepareUploadCleanup(req, res, next) {
  attachUploadCleanup(req, res);
  next();
}

// H?m commitRequestUploads d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function commitRequestUploads(req) {
  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const file of flattenFiles(req.files)) {
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (file?.readyToCommit) {
      file.uploadCommitted = true;
    }
  }
}

// H?m attachUploadCleanup d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function attachUploadCleanup(req, res) {
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (req.uploadCleanupAttached) return;
  req.uploadCleanupAttached = true;
  let cleanupPromise = null;
  // H?m cleanup d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  const cleanup = () => {
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (cleanupPromise) return;
    cleanupPromise = cleanupRequestUploadsWithRetry(req).catch(() => {
      console.warn('Không thể dọn hết ảnh của request sau nhiều lần thử.');
    });
  };
  res.once('finish', cleanup);
  res.once('close', cleanup);
}

// H?m cleanupRequestUploads d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function cleanupRequestUploads(
  req,
  {
    destroyCloudinary = (publicId, options) => cloudinary.uploader.destroy(publicId, options),
    unlink = fsPromises.unlink
  } = {}
) {
  const files = flattenFiles(req.files);
  const failures = [];
  await Promise.all(files.map(async (file) => {
    // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
    try {
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (!file || file.uploadCleanupComplete) return;

      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (file.uploadCommitted) {
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (!file.cloudinaryLocalCleanupPending || !file.path) return;
        // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
        try {
          await unlink(file.path);
        } catch (error) {
          // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
          if (error.code !== 'ENOENT') throw error;
        }
        file.cloudinaryLocalCleanupPending = false;
        file.localCleanupComplete = true;
        file.uploadCleanupComplete = true;
        return;
      }

      let cleanupError = null;
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (file.cloudinaryPublicId && !file.cloudinaryCleanupComplete) {
        // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
        try {
          await destroyCloudinary(file.cloudinaryPublicId, { resource_type: 'image' });
          file.cloudinaryCleanupComplete = true;
        } catch (error) {
          cleanupError = error;
        }
      }

      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (file.path && !file.localCleanupComplete) {
        // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
        try {
          await unlink(file.path);
          file.localCleanupComplete = true;
          file.cloudinaryLocalCleanupPending = false;
        } catch (error) {
          // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
          if (error.code === 'ENOENT') {
            file.localCleanupComplete = true;
            file.cloudinaryLocalCleanupPending = false;
          } else {
            cleanupError ||= error;
          }
        }
      }

      const cloudinaryDone = !file.cloudinaryPublicId || file.cloudinaryCleanupComplete;
      const localDone = !file.path || file.localCleanupComplete;
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (cloudinaryDone && localDone) {
        file.uploadCleanupComplete = true;
      }
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (cleanupError) throw cleanupError;
    } catch (error) {
      failures.push(error);
    }
  }));
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (failures.length > 0) {
    throw new AggregateError(failures, 'Không thể dọn hết ảnh chưa commit');
  }
}

// H?m cleanupRequestUploadsWithRetry d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function cleanupRequestUploadsWithRetry(
  req,
  {
    attempts = 3,
    retryDelayMs = 50,
    ...cleanupOptions
  } = {}
) {
  let lastError = null;
  const safeAttempts = Math.min(Math.max(Number(attempts) || 1, 1), 5);
  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (let attempt = 0; attempt < safeAttempts; attempt += 1) {
    // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
    try {
      await cleanupRequestUploads(req, cleanupOptions);
      return;
    } catch (error) {
      lastError = error;
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (attempt + 1 < safeAttempts) {
        await new Promise((resolve) => {
          setTimeout(resolve, retryDelayMs * (2 ** attempt));
        });
      }
    }
  }
  throw lastError;
}

// H?m detectImageType d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function detectImageType(filePath) {
  const handle = await fsPromises.open(filePath, 'r');
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    const buffer = Buffer.alloc(16);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const header = buffer.subarray(0, bytesRead);

    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
      return { extension: 'jpg', mimeType: 'image/jpeg' };
    }
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (
      header.length >= 8
      && header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    ) {
      return { extension: 'png', mimeType: 'image/png' };
    }
    const signature = header.subarray(0, 6).toString('ascii');
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (signature === 'GIF87a' || signature === 'GIF89a') {
      return { extension: 'gif', mimeType: 'image/gif' };
    }
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
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

// H?m flattenFiles d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function flattenFiles(files) {
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (Array.isArray(files)) return files;
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!files || typeof files !== 'object') return [];
  return Object.values(files).flat().filter(Boolean);
}

// H?m uploadError d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function uploadError(message) {
  const error = new Error(message);
  error.code = 'INVALID_IMAGE_UPLOAD';
  error.status = 400;
  return error;
}

// H?m safeDisplayName d?ng ?? chu?n b? v? hi?n th? k?t qu? cho ng??i d?ng; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function safeDisplayName(value) {
  return path.basename(String(value || 'tệp đã tải')).slice(0, 120);
}

module.exports = {
  MAX_MULTIPART_FIELDS,
  MAX_MULTIPART_FIELD_SIZE_BYTES,
  MAX_MULTIPART_REQUEST_BYTES,
  cleanupRequestUploads,
  cleanupRequestUploadsWithRetry,
  commitRequestUploads,
  detectImageType,
  limitMultipartRequest,
  prepareUploadCleanup,
  questionImageUpload,
  validateUploadedImages
};
