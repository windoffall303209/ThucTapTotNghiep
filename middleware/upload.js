// Middleware upload kiểm tra hoặc bổ sung ngữ cảnh trước khi yêu cầu đi vào bộ xử lý tiếp theo.
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
  // Hàm destination dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  destination(req, file, callback) {
    callback(null, TEMP_UPLOAD_DIR);
  },
  // Hàm filename dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  filename(req, file, callback) {
    callback(null, `${Date.now()}-${crypto.randomBytes(16).toString('hex')}.upload`);
  }
});

// Hàm imageFileFilter dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function imageFileFilter(req, file, callback) {
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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

// Hàm limitMultipartRequest dùng để xử lý yêu cầu, điều phối các bước nghiệp vụ và phản hồi lỗi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function limitMultipartRequest(uploadMiddleware, maxBytes = MAX_MULTIPART_REQUEST_BYTES) {
  return (req, res, next) => {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!isMultipartRequest(req)) {
      return uploadMiddleware(req, res, next);
    }

    const contentLength = readContentLength(req);
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (contentLength !== null && contentLength > maxBytes) {
      req.resume();
      return next(uploadRequestTooLargeError());
    }

    let streamedBytes = 0;
    let limitExceeded = false;
    // Hàm countChunk dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
    const countChunk = (chunk) => {
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (limitExceeded) return;
      streamedBytes += Buffer.isBuffer(chunk)
        ? chunk.length
        : Buffer.byteLength(String(chunk || ''));
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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

// Hàm isMultipartRequest dùng để xử lý yêu cầu, điều phối các bước nghiệp vụ và phản hồi lỗi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function isMultipartRequest(req) {
  return String(req.get?.('content-type') || req.headers?.['content-type'] || '')
    .toLowerCase()
    .startsWith('multipart/form-data');
}

// Hàm readContentLength dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function readContentLength(req) {
  const rawValue = String(req.get?.('content-length') || req.headers?.['content-length'] || '').trim();
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!/^\d+$/.test(rawValue)) return null;
  const value = Number(rawValue);
  return Number.isSafeInteger(value) ? value : null;
}

// Hàm uploadRequestTooLargeError dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function uploadRequestTooLargeError() {
  const error = new Error('Tổng dung lượng biểu mẫu và ảnh trong một lần gửi không được vượt quá 30 MB.');
  error.code = 'UPLOAD_REQUEST_TOO_LARGE';
  error.status = 413;
  return error;
}

// Hàm validateUploadedImages dùng để kiểm tra tính hợp lệ và các điều kiện an toàn; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function validateUploadedImages(req, res, next) {
  const files = flattenFiles(req.files);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (files.length === 0) return next();

  attachUploadCleanup(req, res);

  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  try {
    const totalBytes = files.reduce((sum, file) => sum + Number(file.size || 0), 0);
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (totalBytes > MAX_REQUEST_IMAGE_BYTES) {
      throw uploadError('Tổng dung lượng ảnh trong một lần gửi không được vượt quá 25 MB.');
    }

    // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
    for (const file of files) {
      const detected = await detectImageType(file.path);
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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

// Hàm prepareUploadCleanup dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function prepareUploadCleanup(req, res, next) {
  attachUploadCleanup(req, res);
  next();
}

// Hàm commitRequestUploads dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function commitRequestUploads(req) {
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const file of flattenFiles(req.files)) {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (file?.readyToCommit) {
      file.uploadCommitted = true;
    }
  }
}

// Hàm attachUploadCleanup dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function attachUploadCleanup(req, res) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (req.uploadCleanupAttached) return;
  req.uploadCleanupAttached = true;
  let cleanupPromise = null;
  // Hàm cleanup dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  const cleanup = () => {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (cleanupPromise) return;
    cleanupPromise = cleanupRequestUploadsWithRetry(req).catch(() => {
      console.warn('Không thể dọn hết ảnh của request sau nhiều lần thử.');
    });
  };
  res.once('finish', cleanup);
  res.once('close', cleanup);
}

// Hàm cleanupRequestUploads dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
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
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    try {
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (!file || file.uploadCleanupComplete) return;

      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (file.uploadCommitted) {
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (!file.cloudinaryLocalCleanupPending || !file.path) return;
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        try {
          await unlink(file.path);
        } catch (error) {
          // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
          if (error.code !== 'ENOENT') throw error;
        }
        file.cloudinaryLocalCleanupPending = false;
        file.localCleanupComplete = true;
        file.uploadCleanupComplete = true;
        return;
      }

      let cleanupError = null;
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (file.cloudinaryPublicId && !file.cloudinaryCleanupComplete) {
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        try {
          await destroyCloudinary(file.cloudinaryPublicId, { resource_type: 'image' });
          file.cloudinaryCleanupComplete = true;
        } catch (error) {
          cleanupError = error;
        }
      }

      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (file.path && !file.localCleanupComplete) {
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        try {
          await unlink(file.path);
          file.localCleanupComplete = true;
          file.cloudinaryLocalCleanupPending = false;
        } catch (error) {
          // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (cloudinaryDone && localDone) {
        file.uploadCleanupComplete = true;
      }
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (cleanupError) throw cleanupError;
    } catch (error) {
      failures.push(error);
    }
  }));
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (failures.length > 0) {
    throw new AggregateError(failures, 'Không thể dọn hết ảnh chưa commit');
  }
}

// Hàm cleanupRequestUploadsWithRetry dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
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
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (let attempt = 0; attempt < safeAttempts; attempt += 1) {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    try {
      await cleanupRequestUploads(req, cleanupOptions);
      return;
    } catch (error) {
      lastError = error;
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (attempt + 1 < safeAttempts) {
        await new Promise((resolve) => {
          setTimeout(resolve, retryDelayMs * (2 ** attempt));
        });
      }
    }
  }
  throw lastError;
}

// Hàm detectImageType dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function detectImageType(filePath) {
  const handle = await fsPromises.open(filePath, 'r');
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  try {
    const buffer = Buffer.alloc(16);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const header = buffer.subarray(0, bytesRead);

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
      return { extension: 'jpg', mimeType: 'image/jpeg' };
    }
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (
      header.length >= 8
      && header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    ) {
      return { extension: 'png', mimeType: 'image/png' };
    }
    const signature = header.subarray(0, 6).toString('ascii');
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (signature === 'GIF87a' || signature === 'GIF89a') {
      return { extension: 'gif', mimeType: 'image/gif' };
    }
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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

// Hàm flattenFiles dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function flattenFiles(files) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (Array.isArray(files)) return files;
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!files || typeof files !== 'object') return [];
  return Object.values(files).flat().filter(Boolean);
}

// Hàm uploadError dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function uploadError(message) {
  const error = new Error(message);
  error.code = 'INVALID_IMAGE_UPLOAD';
  error.status = 400;
  return error;
}

// Hàm safeDisplayName dùng để chuẩn bị và hiển thị kết quả cho người dùng; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
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
