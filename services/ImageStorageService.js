// D?ch v? image storage service ??ng g?i nghi?p v? ch?nh v? ph?i h?p c?c l?p d? li?u ho?c t?ch h?p b?n ngo?i.
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

// H?m storeQuestionImage d?ng ?? x? l? y?u c?u, ?i?u ph?i c?c b??c nghi?p v? v? ph?n h?i l?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function storeQuestionImage(file, options = {}) {
  const settings = await SystemSetting.getSettings();
  const cloudinaryConfig = getCloudinaryConfig(settings);

  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (cloudinaryConfig) {
    let uploadResult;
    // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
    try {
      cloudinary.config(cloudinaryConfig);
      uploadResult = await cloudinary.uploader.upload(file.path, {
        folder: options.folder || 'math-revision/questions',
        resource_type: 'image'
      });
    } catch (error) {
      console.warn('Không thể tải ảnh lên Cloudinary, dùng lưu trữ local:', error.message);
    }

    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (uploadResult) {
      file.cloudinaryPublicId = uploadResult.public_id;
      file.cloudinaryCloudName = cloudinaryConfig.cloud_name;
      // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
      try {
        await fs.unlink(file.path);
      } catch (error) {
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
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

// H?m collectImageDescriptors d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function collectImageDescriptors(value) {
  const images = [];
  const visited = new Set();
  const identities = new Set();

  // H?m visit d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  function visit(item) {
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!item || typeof item !== 'object' || visited.has(item)) return;
    visited.add(item);

    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!Array.isArray(item) && typeof item.url === 'string' && item.url.trim()) {
      const image = normalizeImageDescriptor(item);
      const identity = imageIdentity(image);
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (identity && !identities.has(identity)) {
        identities.add(identity);
        images.push(image);
      }
    }

    // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
    for (const child of Object.values(item)) {
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (child && typeof child === 'object') visit(child);
    }
  }

  visit(value);
  return images;
}

// H?m differenceImageDescriptors d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function differenceImageDescriptors(before, after) {
  const retained = new Set(collectImageDescriptors(after).map(imageIdentity));
  return collectImageDescriptors(before)
    .filter((image) => !retained.has(imageIdentity(image)));
}

// H?m normalizeImageDescriptor d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function normalizeImageDescriptor(image) {
  return {
    url: String(image?.url || '').trim(),
    storage_provider: String(image?.storage_provider || '').trim().toLowerCase(),
    public_id: image?.public_id == null ? null : String(image.public_id).trim(),
    cloud_name: image?.cloud_name == null ? null : String(image.cloud_name).trim()
  };
}

// H?m imageIdentity d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function imageIdentity(image) {
  const normalized = normalizeImageDescriptor(image);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (normalized.storage_provider === 'cloudinary' && normalized.public_id) {
    const cloudName = normalized.cloud_name || cloudNameFromDeliveryUrl(normalized.url) || 'unknown';
    return `cloudinary:${cloudName}:${normalized.public_id}`;
  }
  return normalized.url ? `url:${normalized.url}` : '';
}

// H?m escapeJsonSearchPattern d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function escapeJsonSearchPattern(value) {
  return String(value || '').replace(/[\\%_]/g, '\\$&');
}

// H?m buildReferenceQuery d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function buildReferenceQuery(image, { lock = false } = {}) {
  const normalized = normalizeImageDescriptor(image);
  const patterns = [normalized.url, normalized.public_id]
    .filter(Boolean)
    .map(escapeJsonSearchPattern);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (patterns.length === 0) {
    return null;
  }

  const params = [];
  const tableChecks = IMAGE_REFERENCE_COLUMNS.map(([tableName, columns]) => {
    const checks = [];
    // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
    for (const columnName of columns) {
      // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
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

// H?m isStoredImageReferenced d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function isStoredImageReferenced(image, { query = db.query } = {}) {
  const referenceQuery = buildReferenceQuery(image);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!referenceQuery) return true;
  const rows = await query(referenceQuery.sql, referenceQuery.params);
  return Boolean(Number(rows?.[0]?.is_referenced || 0));
}

// H?m withStoredImageReferenceGuard d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function withStoredImageReferenceGuard(image, callback) {
  return db.transaction(async (connection) => {
    const referenceQuery = buildReferenceQuery(image, { lock: true });
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!referenceQuery) {
      return callback(true);
    }
    const [rows] = await connection.execute(referenceQuery.sql, referenceQuery.params);
    const referenced = Boolean(Number(rows?.[0]?.is_referenced || 0));
    return callback(referenced);
  });
}

// H?m resolveLocalImagePath d?ng ?? l?a ch?n ph??ng ?n ph? h?p d?a tr?n tr?ng th?i v? ?u ti?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function resolveLocalImagePath(image, publicImageDir = PUBLIC_IMAGE_DIR) {
  const normalized = normalizeImageDescriptor(image);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (
    normalized.storage_provider
    && normalized.storage_provider !== 'local'
  ) {
    return null;
  }

  let parsed;
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    parsed = new URL(normalized.url, 'http://local.invalid');
  } catch (error) {
    return null;
  }
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (
    parsed.origin !== 'http://local.invalid'
    || parsed.search
    || parsed.hash
    || !parsed.pathname.startsWith(LOCAL_IMAGE_URL_PREFIX)
  ) {
    return null;
  }

  let filename;
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    filename = decodeURIComponent(parsed.pathname.slice(LOCAL_IMAGE_URL_PREFIX.length));
  } catch (error) {
    return null;
  }
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
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

// H?m cloudNameFromDeliveryUrl d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function cloudNameFromDeliveryUrl(value) {
  let url;
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    url = new URL(String(value || ''));
  } catch (error) {
    return null;
  }
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'res.cloudinary.com') {
    return null;
  }
  const [cloudName] = url.pathname.split('/').filter(Boolean);
  return SAFE_CLOUDINARY_CLOUD_NAME.test(String(cloudName || '')) ? cloudName : null;
}

// H?m deleteManagedStoredImage d?ng ?? x?a ho?c gi?i ph?ng t?i nguy?n theo ?i?u ki?n an to?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
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
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (localPath) {
    // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
    try {
      await unlink(localPath);
      return { image, deleted: true, provider: 'local' };
    } catch (error) {
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (error.code === 'ENOENT') {
        return { image, deleted: false, reason: 'already_missing' };
      }
      logger.warn?.('Không thể xóa ảnh local không còn được tham chiếu.');
      return { image, deleted: false, reason: 'delete_failed' };
    }
  }

  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (
    image.storage_provider === 'cloudinary'
    && MANAGED_CLOUDINARY_PUBLIC_ID.test(String(image.public_id || ''))
  ) {
    // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
    try {
      const cloudinaryConfig = getCloudinaryConfig(await getSettings());
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (!cloudinaryConfig) {
        return { image, deleted: false, reason: 'cloudinary_not_configured' };
      }
      const descriptorCloudName = image.cloud_name || cloudNameFromDeliveryUrl(image.url);
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
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

// H?m deleteStoredImagesIfUnreferenced d?ng ?? x?a ho?c gi?i ph?ng t?i nguy?n theo ?i?u ki?n an to?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
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
  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const image of collectImageDescriptors(images)) {
    // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
    try {
      const result = await referenceGuard(image, async (referenced) => {
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
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

// H?m getCloudinaryConfig d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function getCloudinaryConfig(settings) {
  const cloudName = settings.cloudinary_cloud_name;
  const apiKey = settings.cloudinary_api_key;
  const apiSecret = settings.cloudinary_api_secret;

  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
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
