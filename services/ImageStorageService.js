const fs = require('fs/promises');
const cloudinary = require('cloudinary').v2;
const SystemSetting = require('../models/SystemSetting');

async function storeQuestionImage(file, options = {}) {
  const settings = await SystemSetting.getSettings();
  const cloudinaryConfig = getCloudinaryConfig(settings);

  if (cloudinaryConfig) {
    try {
      cloudinary.config(cloudinaryConfig);
      const uploadResult = await cloudinary.uploader.upload(file.path, {
        folder: options.folder || 'math-revision/questions',
        resource_type: 'image'
      });
      await safeUnlink(file.path);
      return {
        url: uploadResult.secure_url,
        storage_provider: 'cloudinary',
        public_id: uploadResult.public_id
      };
    } catch (error) {
      console.warn('Không thể tải ảnh lên Cloudinary, dùng lưu trữ local:', error.message);
    }
  }

  return {
    url: `/uploads/images/${file.filename}`,
    storage_provider: 'local',
    public_id: null
  };
}

async function safeUnlink(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    // Bỏ qua lỗi xóa file tạm vì ảnh đã được lưu ở Cloudinary.
  }
}

function getCloudinaryConfig(settings) {
  const cloudName = settings.cloudinary_cloud_name;
  const apiKey = settings.cloudinary_api_key;
  const apiSecret = settings.cloudinary_api_secret;

  if (!cloudName || !apiKey || !apiSecret) return null;

  return {
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true
  };
}

module.exports = {
  storeQuestionImage
};
