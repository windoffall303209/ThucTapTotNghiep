const db = require('../config/db');
const sampleData = require('../sample-data/sampleData');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { fallbackOrThrow } = require('../utils/sampleDataFallback');
const { assertAllowedProviderBaseUrl } = require('../utils/outboundUrlPolicy');

const PRACTICE_DURATION_DEFAULTS = Object.freeze({
  5: 10,
  15: 30,
  20: 60
});

const PRACTICE_DURATION_SETTING_KEYS = Object.freeze({
  5: 'practice_duration_5_minutes',
  15: 'practice_duration_15_minutes',
  20: 'practice_duration_20_minutes'
});
const AI_LOG_RETENTION_DEFAULT_DAYS = 90;

const DEFAULT_SETTINGS = {
  practice_duration_5_minutes: process.env.PRACTICE_DURATION_5_MINUTES || '10',
  practice_duration_15_minutes: process.env.PRACTICE_DURATION_15_MINUTES || '30',
  practice_duration_20_minutes: process.env.PRACTICE_DURATION_20_MINUTES || '60',
  ai_provider: process.env.AI_PROVIDER || 'nvidia',
  ai_automation_enabled: process.env.AI_AUTOMATION_ENABLED || 'true',
  ai_json_timeout_ms: process.env.AI_JSON_TIMEOUT_MS || '45000',
  ai_enabled_grades: process.env.AI_ENABLED_GRADES || '3,4,5',
  ai_max_hints_per_question: process.env.AI_MAX_HINTS_PER_QUESTION || '2',
  ai_max_hints_per_session: process.env.AI_MAX_HINTS_PER_SESSION || '8',
  ai_max_requests_per_student_per_day: process.env.AI_MAX_REQUESTS_PER_STUDENT_PER_DAY || '30',
  ai_require_answer_before_help: process.env.AI_REQUIRE_ANSWER_BEFORE_HELP || 'true',
  ai_log_retention_days:
    process.env.AI_LOG_RETENTION_DAYS || String(AI_LOG_RETENTION_DEFAULT_DAYS),
  openai_api_key: process.env.OPENAI_API_KEY || '',
  openai_base_url: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  openai_model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  openai_vision_model: process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini',
  openai_embedding_model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
  gemini_api_key: process.env.GEMINI_API_KEY || '',
  gemini_model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
  gemini_cli_model: process.env.GEMINI_CLI_MODEL || 'gemini-2.5-flash-lite',
  gemini_cli_timeout_ms: process.env.GEMINI_CLI_TIMEOUT_MS || '120000',
  nvidia_nim_api_key: process.env.NVIDIA_NIM_API_KEY || '',
  nvidia_nim_base_url: process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1',
  nvidia_nim_model: process.env.NVIDIA_NIM_MODEL || 'meta/llama-3.3-70b-instruct',
  nvidia_nim_vision_model: process.env.NVIDIA_NIM_VISION_MODEL || 'meta/llama-3.2-90b-vision-instruct',
  nvidia_nim_embedding_model: process.env.NVIDIA_NIM_EMBEDDING_MODEL || 'nvidia/nv-embedqa-e5-v5',
  openrouter_api_key: process.env.OPENROUTER_API_KEY || '',
  openrouter_base_url: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
  openrouter_model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
  cloudinary_cloud_name: process.env.CLOUDINARY_CLOUD_NAME || '',
  cloudinary_api_key: process.env.CLOUDINARY_API_KEY || '',
  cloudinary_api_secret: process.env.CLOUDINARY_API_SECRET || ''
};
const ALLOWED_SETTING_KEYS = new Set(Object.keys(DEFAULT_SETTINGS));
const BASE_URL_PROVIDERS = Object.freeze({
  openai_base_url: 'openai',
  nvidia_nim_base_url: 'nvidia',
  openrouter_base_url: 'openrouter'
});

const ENV_KEY_MAP = {
  practice_duration_5_minutes: 'PRACTICE_DURATION_5_MINUTES',
  practice_duration_15_minutes: 'PRACTICE_DURATION_15_MINUTES',
  practice_duration_20_minutes: 'PRACTICE_DURATION_20_MINUTES',
  ai_provider: 'AI_PROVIDER',
  ai_automation_enabled: 'AI_AUTOMATION_ENABLED',
  ai_json_timeout_ms: 'AI_JSON_TIMEOUT_MS',
  ai_enabled_grades: 'AI_ENABLED_GRADES',
  ai_max_hints_per_question: 'AI_MAX_HINTS_PER_QUESTION',
  ai_max_hints_per_session: 'AI_MAX_HINTS_PER_SESSION',
  ai_max_requests_per_student_per_day: 'AI_MAX_REQUESTS_PER_STUDENT_PER_DAY',
  ai_require_answer_before_help: 'AI_REQUIRE_ANSWER_BEFORE_HELP',
  ai_log_retention_days: 'AI_LOG_RETENTION_DAYS',
  openai_api_key: 'OPENAI_API_KEY',
  openai_base_url: 'OPENAI_BASE_URL',
  openai_model: 'OPENAI_MODEL',
  openai_vision_model: 'OPENAI_VISION_MODEL',
  openai_embedding_model: 'OPENAI_EMBEDDING_MODEL',
  gemini_api_key: 'GEMINI_API_KEY',
  gemini_model: 'GEMINI_MODEL',
  gemini_cli_model: 'GEMINI_CLI_MODEL',
  gemini_cli_timeout_ms: 'GEMINI_CLI_TIMEOUT_MS',
  nvidia_nim_api_key: 'NVIDIA_NIM_API_KEY',
  nvidia_nim_base_url: 'NVIDIA_NIM_BASE_URL',
  nvidia_nim_model: 'NVIDIA_NIM_MODEL',
  nvidia_nim_vision_model: 'NVIDIA_NIM_VISION_MODEL',
  nvidia_nim_embedding_model: 'NVIDIA_NIM_EMBEDDING_MODEL',
  openrouter_api_key: 'OPENROUTER_API_KEY',
  openrouter_base_url: 'OPENROUTER_BASE_URL',
  openrouter_model: 'OPENROUTER_MODEL',
  cloudinary_cloud_name: 'CLOUDINARY_CLOUD_NAME',
  cloudinary_api_key: 'CLOUDINARY_API_KEY',
  cloudinary_api_secret: 'CLOUDINARY_API_SECRET'
};

async function getSettings() {
  try {
    const rows = await db.query('SELECT setting_key, setting_value FROM SystemSettings');
    const dbSettings = rows.reduce((result, row) => {
      result[row.setting_key] = isSecretKey(row.setting_key)
        ? decryptSecret(row.setting_value || '')
        : row.setting_value || '';
      return result;
    }, {});

    return { ...DEFAULT_SETTINGS, ...dbSettings };
  } catch (error) {
    fallbackOrThrow(error);
    return { ...DEFAULT_SETTINGS, ...sampleData.systemSettings };
  }
}

async function updateSettings(input) {
  const current = await getSettings();
  const nextSettings = {};

  for (const [key, value] of Object.entries(input)) {
    if (typeof value !== 'string' || !ALLOWED_SETTING_KEYS.has(key)) continue;
    const trimmedValue = value.trim();
    if (Object.values(PRACTICE_DURATION_SETTING_KEYS).includes(key)) {
      const minutes = Number(trimmedValue);
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 240) {
        const validationError = new Error('Thời gian luyện tập phải là số phút nguyên từ 1 đến 240.');
        validationError.code = 'INVALID_PRACTICE_DURATION';
        throw validationError;
      }
      nextSettings[key] = String(minutes);
      continue;
    }
    if (BASE_URL_PROVIDERS[key]) {
      nextSettings[key] = assertAllowedProviderBaseUrl(trimmedValue, BASE_URL_PROVIDERS[key]);
      continue;
    }
    if (isSecretKey(key) && trimmedValue === '') continue;
    nextSettings[key] = validateSettingValue(key, trimmedValue);
  }

  const mergedSettings = { ...current, ...nextSettings };

  try {
    await db.transaction(async (connection) => {
      for (const [key, value] of Object.entries(nextSettings)) {
        const storedValue = isSecretKey(key) ? encryptSecret(value) : value;
        await connection.execute(
          `INSERT INTO SystemSettings (setting_key, setting_value)
           VALUES (?, ?)
           ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
          [key, storedValue]
        );
      }
    });
  } catch (error) {
    fallbackOrThrow(error);
    sampleData.systemSettings = mergedSettings;
  }

  await syncEnvFile(nextSettings, mergedSettings);

  return mergedSettings;
}

function publicSettings(settings) {
  return Object.entries(settings).reduce((result, [key, value]) => {
    result[key] = isSecretKey(key) && value ? '••••••••' : value;
    return result;
  }, {});
}

function isSecretKey(key) {
  return key.includes('api_key') || key.includes('api_secret');
}

function validateSettingValue(key, value) {
  if (key === 'ai_provider') {
    if (!['mock', 'openai', 'gemini', 'gemini_cli', 'nvidia', 'openrouter'].includes(value)) {
      throw invalidSetting('Nguồn AI không hợp lệ.');
    }
    return value;
  }
  if (['ai_automation_enabled', 'ai_require_answer_before_help'].includes(key)) {
    if (!['true', 'false'].includes(value)) {
      throw invalidSetting('Giá trị bật/tắt cấu hình AI không hợp lệ.');
    }
    return value;
  }
  if (key === 'ai_enabled_grades') {
    const tokens = value.split(',').map((item) => item.trim());
    if (tokens.some((item) => !/^[1-5]$/.test(item))) {
      throw invalidSetting('Khối lớp bật AI phải là danh sách từ 1 đến 5, phân cách bằng dấu phẩy.');
    }
    const grades = [...new Set(
      tokens.map(Number)
    )].sort((a, b) => a - b);
    if (grades.length === 0) {
      throw invalidSetting('Khối lớp bật AI phải là danh sách từ 1 đến 5, phân cách bằng dấu phẩy.');
    }
    return grades.join(',');
  }
  const integerRules = {
    ai_json_timeout_ms: [1000, 120000, 'Timeout AI phải từ 1000 đến 120000 ms.'],
    gemini_cli_timeout_ms: [1000, 300000, 'Timeout Gemini CLI phải từ 1000 đến 300000 ms.'],
    ai_max_hints_per_question: [1, 20, 'Quota AI mỗi câu phải từ 1 đến 20.'],
    ai_max_hints_per_session: [1, 100, 'Quota AI mỗi phiên phải từ 1 đến 100.'],
    ai_max_requests_per_student_per_day: [1, 500, 'Quota AI mỗi học sinh mỗi ngày phải từ 1 đến 500.'],
    ai_log_retention_days: [1, 365, 'Thời gian lưu nhật ký AI phải từ 1 đến 365 ngày.']
  };
  if (integerRules[key]) {
    const [min, max, message] = integerRules[key];
    const number = Number(value);
    if (!Number.isInteger(number) || number < min || number > max) {
      throw invalidSetting(message);
    }
    return String(number);
  }
  if (isSecretKey(key)) {
    if (value.length > 4096) throw invalidSetting('Khóa bí mật quá dài.');
    return value;
  }
  if (value.length > 255) {
    throw invalidSetting('Giá trị cấu hình không được vượt quá 255 ký tự.');
  }
  return value;
}

function invalidSetting(message) {
  const error = new Error(message);
  error.code = 'INVALID_SYSTEM_SETTING';
  return error;
}

function getPracticeDurationMinutes(questionCount, settings = DEFAULT_SETTINGS) {
  const count = Number(questionCount);
  const fallback = PRACTICE_DURATION_DEFAULTS[count];
  const settingKey = PRACTICE_DURATION_SETTING_KEYS[count];
  if (!fallback || !settingKey) return null;

  const configured = Number(settings?.[settingKey]);
  return Number.isInteger(configured) && configured >= 1 && configured <= 240
    ? configured
    : fallback;
}

function getPracticeDurationSeconds(questionCount, settings = DEFAULT_SETTINGS) {
  const minutes = getPracticeDurationMinutes(questionCount, settings);
  return minutes ? minutes * 60 : null;
}

function getAiLogRetentionDays(settings = DEFAULT_SETTINGS) {
  const configured = Number(settings?.ai_log_retention_days);
  return Number.isInteger(configured) && configured >= 1 && configured <= 365
    ? configured
    : AI_LOG_RETENTION_DEFAULT_DAYS;
}

async function syncEnvFile(changedSettings, mergedSettings) {
  const envPath = path.join(__dirname, '..', '.env');
  let rawEnv = '';

  try {
    rawEnv = await fs.readFile(envPath, 'utf8');
  } catch (error) {
    rawEnv = '';
  }

  const lines = rawEnv ? rawEnv.split(/\r?\n/) : [];
  const lineIndexByKey = new Map();
  lines.forEach((line, index) => {
    const match = line.match(/^([A-Z0-9_]+)=/);
    if (match) lineIndexByKey.set(match[1], index);
  });

  for (const [settingKey, envKey] of Object.entries(ENV_KEY_MAP)) {
    if (!(settingKey in changedSettings)) continue;
    const value = mergedSettings[settingKey] || '';
    const nextLine = `${envKey}=${escapeEnvValue(value)}`;
    if (lineIndexByKey.has(envKey)) {
      lines[lineIndexByKey.get(envKey)] = nextLine;
    } else {
      lines.push(nextLine);
    }
  }

  if (!lineIndexByKey.has('API_KEY_ENCRYPTION_SECRET')) {
    lines.push('API_KEY_ENCRYPTION_SECRET=change_me_for_admin_saved_api_keys');
  }

  await fs.writeFile(envPath, `${lines.join('\n').replace(/\n+$/, '')}\n`, 'utf8');
}

function escapeEnvValue(value) {
  if (/[\s#"'=]/.test(value)) {
    return JSON.stringify(value);
  }
  return value;
}

function getEncryptionSecret() {
  return process.env.API_KEY_ENCRYPTION_SECRET || process.env.SESSION_SECRET || 'dev-only-change-this-secret';
}

function getEncryptionKey() {
  return crypto.createHash('sha256').update(getEncryptionSecret()).digest();
}

function encryptSecret(value) {
  if (!value || value.startsWith('enc:v1:')) return value;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `enc:v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decryptSecret(value) {
  if (!value || !value.startsWith('enc:v1:')) return value;

  try {
    const [, , ivBase64, tagBase64, encryptedBase64] = value.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(ivBase64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagBase64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedBase64, 'base64')),
      decipher.final()
    ]).toString('utf8');
  } catch (error) {
    console.warn('Không giải mã được API key đã lưu:', error.message);
    return '';
  }
}

module.exports = {
  PRACTICE_DURATION_DEFAULTS,
  PRACTICE_DURATION_SETTING_KEYS,
  AI_LOG_RETENTION_DEFAULT_DAYS,
  getSettings,
  updateSettings,
  publicSettings,
  validateSettingValue,
  getPracticeDurationMinutes,
  getPracticeDurationSeconds,
  getAiLogRetentionDays
};
