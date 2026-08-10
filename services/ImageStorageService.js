// Dịch vụ image storage service đóng gói nghiệp vụ chính và phối hợp các lớp dữ liệu hoặc tích hợp bên ngoài.
const fs = require('node:fs/promises');
const path = require('node:path');
const cloudinary = require('cloudinary').v2;
const db = require('../config/db');
const SystemSetting = require('../models/SystemSetting');

const PUBLIC_IMAGE_DIR = path.resolve(__dirname, '..', 'public', 'uploads', 'images');
const LOCAL_IMAGE_URL_PREFIX = '/uploads/images/';
const SAFE_LOCAL_IMAGE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}\.(?:jpe?g|png|webp|gif)$/i;
const MANAGED_CLOUDINARY_PUBLIC_ID =
  /^math-revision\/(?:questions|choices|theory)\/[A-Za-z0-9_-]{1,160}$/;
const SAFE_CLOUDINARY_CLOUD_NAME = /^[A-Za-z0-9_-]{1,100}$/;
const IMAGE_REFERENCE_COLUMNS = Object.freeze([
  ['QuestionBank', ['content', 'choices', 'explanation']],
  ['Lessons', ['theory_cards']],
  ['PracticeSessionQuestions', ['snapshot']]
]);

// Hàm storeQuestionImage dùng để xử lý yêu cầu, điều phối các bước nghiệp vụ và phản hồi lỗi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function storeQuestionImage(file, options = {}) {
  const settings = await SystemSetting.getSettings();
  const cloudinaryConfig = getCloudinaryConfig(settings);

  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (cloudinaryConfig) {
    let uploadResult;
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    try {
      cloudinary.config(cloudinaryConfig);
      uploadResult = await cloudinary.uploader.upload(file.path, {
        folder: options.folder || 'math-revision/questions',
        resource_type: 'image'
      });
    } catch (error) {
      console.warn('Không thể tải ảnh lên Cloudinary, dùng lưu trữ local:', error.message);
    }

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (uploadResult) {
      file.cloudinaryPublicId = uploadResult.public_id;
      file.cloudinaryCloudName = cloudinaryConfig.cloud_name;
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      try {
        await fs.unlink(file.path);
      } catch (error) {
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (error.code !== 'ENOENT') {
          file.cloudinaryLocalCleanupPending = true;
        }
      }
      return {
        url: uploadResult.secure_url,
        storage_provider: 'cloudinary',
        public_id: uploadResult.public_id,
        cloud_name: cloudinaryConfig.cloud_name
      };
    }
  }

  return {
    url: `/uploads/images/${file.filename}`,
    storage_provider: 'local',
    public_id: null,
    cloud_name: null
  };
}

// Hàm collectImageDescriptors dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function collectImageDescriptors(value) {
  const images = [];
  const visited = new Set();
  const identities = new Set();

  // Hàm visit dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function visit(item) {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!item || typeof item !== 'object' || visited.has(item)) return;
    visited.add(item);

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!Array.isArray(item) && typeof item.url === 'string' && item.url.trim()) {
      const image = normalizeImageDescriptor(item);
      const identity = imageIdentity(image);
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (identity && !identities.has(identity)) {
        identities.add(identity);
        images.push(image);
      }
    }

    // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
    for (const child of Object.values(item)) {
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (child && typeof child === 'object') visit(child);
    }
  }

  visit(value);
  return images;
}

// Hàm differenceImageDescriptors dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function differenceImageDescriptors(before, after) {
  const retained = new Set(collectImageDescriptors(after).map(imageIdentity));
  return collectImageDescriptors(before)
    .filter((image) => !retained.has(imageIdentity(image)));
}

// Hàm normalizeImageDescriptor dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function normalizeImageDescriptor(image) {
  return {
    url: String(image?.url || '').trim(),
    storage_provider: String(image?.storage_provider || '').trim().toLowerCase(),
    public_id: image?.public_id == null ? null : String(image.public_id).trim(),
    cloud_name: image?.cloud_name == null ? null : String(image.cloud_name).trim()
  };
}

// Hàm imageIdentity dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function imageIdentity(image) {
  const normalized = normalizeImageDescriptor(image);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (normalized.storage_provider === 'cloudinary' && normalized.public_id) {
    const cloudName = normalized.cloud_name || cloudNameFromDeliveryUrl(normalized.url) || 'unknown';
    return `cloudinary:${cloudName}:${normalized.public_id}`;
  }
  return normalized.url ? `url:${normalized.url}` : '';
}

// Hàm escapeJsonSearchPattern dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function escapeJsonSearchPattern(value) {
  return String(value || '').replace(/[\\%_]/g, '\\$&');
}

// Hàm buildReferenceQuery dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function buildReferenceQuery(image, { lock = false } = {}) {
  const normalized = normalizeImageDescriptor(image);
  const patterns = [normalized.url, normalized.public_id]
    .filter(Boolean)
    .map(escapeJsonSearchPattern);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (patterns.length === 0) {
    return null;
  }

  const params = [];
  const tableChecks = IMAGE_REFERENCE_COLUMNS.map(([tableName, columns]) => {
    const checks = [];
    // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
    for (const columnName of columns) {
      // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
      for (const pattern of patterns) {
        checks.push(`JSON_SEARCH(${columnName}, 'one', ?) IS NOT NULL`);
        params.push(pattern);
      }
    }
    return `EXISTS(
      SELECT 1
      FROM ${tableName}
      WHERE ${checks.join(' OR ')}
      LIMIT 1${lock ? ' FOR SHARE' : ''}
    )`;
  });

  return {
    sql: `SELECT (${tableChecks.join(' OR ')}) AS is_referenced`,
    params
  };
}

// Hàm isStoredImageReferenced dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function isStoredImageReferenced(image, { query = db.query } = {}) {
  const referenceQuery = buildReferenceQuery(image);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!referenceQuery) return true;
  const rows = await query(referenceQuery.sql, referenceQuery.params);
  return Boolean(Number(rows?.[0]?.is_referenced || 0));
}

// Hàm withStoredImageReferenceGuard dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function withStoredImageReferenceGuard(image, callback) {
  return db.transaction(async (connection) => {
    const referenceQuery = buildReferenceQuery(image, { lock: true });
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!referenceQuery) {
      return callback(true);
    }
    const [rows] = await connection.execute(referenceQuery.sql, referenceQuery.params);
    const referenced = Boolean(Number(rows?.[0]?.is_referenced || 0));
    return callback(referenced);
  });
}

// Hàm resolveLocalImagePath dùng để lựa chọn phương án phù hợp dựa trên trạng thái và ưu tiên; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function resolveLocalImagePath(image, publicImageDir = PUBLIC_IMAGE_DIR) {
  const normalized = normalizeImageDescriptor(image);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (
    normalized.storage_provider
    && normalized.storage_provider !== 'local'
  ) {
    return null;
  }

  let parsed;
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  try {
    parsed = new URL(normalized.url, 'http://local.invalid');
  } catch (error) {
    return null;
  }
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (
    parsed.origin !== 'http://local.invalid'
    || parsed.search
    || parsed.hash
    || !parsed.pathname.startsWith(LOCAL_IMAGE_URL_PREFIX)
  ) {
    return null;
  }

  let filename;
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  try {
    filename = decodeURIComponent(parsed.pathname.slice(LOCAL_IMAGE_URL_PREFIX.length));
  } catch (error) {
    return null;
  }
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (
    filename !== path.basename(filename)
    || !SAFE_LOCAL_IMAGE_NAME.test(filename)
  ) {
    return null;
  }

  const root = path.resolve(publicImageDir);
  const candidate = path.resolve(root, filename);
  return path.dirname(candidate) === root ? candidate : null;
}

// Hàm cloudNameFromDeliveryUrl dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function cloudNameFromDeliveryUrl(value) {
  let url;
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  try {
    url = new URL(String(value || ''));
  } catch (error) {
    return null;
  }
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'res.cloudinary.com') {
    return null;
  }
  const [cloudName] = url.pathname.split('/').filter(Boolean);
  return SAFE_CLOUDINARY_CLOUD_NAME.test(String(cloudName || '')) ? cloudName : null;
}

// Hàm deleteManagedStoredImage dùng để xóa hoặc giải phóng tài nguyên theo điều kiện an toàn; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function deleteManagedStoredImage(
  image,
  {
    unlink,
    getSettings,
    cloudinaryClient,
    publicImageDir,
    logger
  }
) {
  const localPath = resolveLocalImagePath(image, publicImageDir);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (localPath) {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    try {
      await unlink(localPath);
      return { image, deleted: true, provider: 'local' };
    } catch (error) {
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (error.code === 'ENOENT') {
        return { image, deleted: false, reason: 'already_missing' };
      }
      logger.warn?.('Không thể xóa ảnh local không còn được tham chiếu.');
      return { image, deleted: false, reason: 'delete_failed' };
    }
  }

  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (
    image.storage_provider === 'cloudinary'
    && MANAGED_CLOUDINARY_PUBLIC_ID.test(String(image.public_id || ''))
  ) {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    try {
      const cloudinaryConfig = getCloudinaryConfig(await getSettings());
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (!cloudinaryConfig) {
        return { image, deleted: false, reason: 'cloudinary_not_configured' };
      }
      const descriptorCloudName = image.cloud_name || cloudNameFromDeliveryUrl(image.url);
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (
        !descriptorCloudName
        || descriptorCloudName !== String(cloudinaryConfig.cloud_name)
      ) {
        return { image, deleted: false, reason: 'cloudinary_account_mismatch' };
      }
      cloudinaryClient.config(cloudinaryConfig);
      await cloudinaryClient.uploader.destroy(image.public_id, {
        resource_type: 'image',
        invalidate: true
      });
      return { image, deleted: true, provider: 'cloudinary' };
    } catch (error) {
      logger.warn?.('Không thể xóa ảnh Cloudinary không còn được tham chiếu.');
      return { image, deleted: false, reason: 'delete_failed' };
    }
  }

  return { image, deleted: false, reason: 'unmanaged_image' };
}

// Hàm deleteStoredImagesIfUnreferenced dùng để xóa hoặc giải phóng tài nguyên theo điều kiện an toàn; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function deleteStoredImagesIfUnreferenced(images, options = {}) {
  const dependencies = {
    unlink: options.unlink || fs.unlink,
    getSettings: options.getSettings || SystemSetting.getSettings,
    cloudinaryClient: options.cloudinaryClient || cloudinary,
    publicImageDir: options.publicImageDir || PUBLIC_IMAGE_DIR,
    logger: options.logger || console
  };
  const referenceGuard = typeof options.withReferenceGuard === 'function'
    ? options.withReferenceGuard
    : typeof options.isReferenced === 'function'
      ? async (image, callback) => callback(await options.isReferenced(image))
      : withStoredImageReferenceGuard;

  const results = [];
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const image of collectImageDescriptors(images)) {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    try {
      const result = await referenceGuard(image, async (referenced) => {
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (referenced) {
          return { image, deleted: false, reason: 'referenced' };
        }
        return deleteManagedStoredImage(image, dependencies);
      });
      results.push(result);
    } catch (error) {
      dependencies.logger.warn?.(
        'Không thể khóa và kiểm tra tham chiếu ảnh; giữ lại ảnh để tránh mất dữ liệu.'
      );
      results.push({ image, deleted: false, reason: 'reference_check_failed' });
    }
  }
  return results;
}

// Hàm getCloudinaryConfig dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function getCloudinaryConfig(settings) {
  const cloudName = settings.cloudinary_cloud_name;
  const apiKey = settings.cloudinary_api_key;
  const apiSecret = settings.cloudinary_api_secret;

  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!cloudName || !apiKey || !apiSecret) return null;

  return {
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true
  };
}

module.exports = {
  buildReferenceQuery,
  cloudNameFromDeliveryUrl,
  collectImageDescriptors,
  deleteStoredImagesIfUnreferenced,
  differenceImageDescriptors,
  escapeJsonSearchPattern,
  isStoredImageReferenced,
  resolveLocalImagePath,
  storeQuestionImage,
  withStoredImageReferenceGuard
};
