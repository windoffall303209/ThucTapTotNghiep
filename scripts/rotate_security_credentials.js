// Script rotate security credentials h? tr? nh?p, xu?t, ki?m tra ho?c b?o tr? d? li?u v? c?u h?nh c?a d? ?n.
require('dotenv').config({ quiet: true });

const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('../config/db');

const ROOT_DIR = path.join(__dirname, '..');
const ENV_PATH = path.join(ROOT_DIR, '.env');
const APPLY_FLAG = '--apply';
const CONFIRM_DATABASE_PREFIX = '--confirm-database=';
const APPLICATION_SECRET_KEYS = [
  'SESSION_SECRET',
  'JWT_SECRET',
  'API_KEY_ENCRYPTION_SECRET'
];
const SAFE_DATABASE_NAME_PATTERN = /^[A-Za-z0-9_$.-]{1,64}$/;
const KNOWN_DEMO_ACCOUNTS = [
  {
    table: 'Admins',
    username: 'admin',
    knownPassword: 'admin123',
    envKey: 'LOCAL_SYSADMIN_PASSWORD'
  },
  {
    table: 'Admins',
    username: 'content',
    knownPassword: 'content123',
    envKey: 'LOCAL_CONTENT_ADMIN_PASSWORD'
  },
  {
    table: 'Students',
    username: 'annguyen',
    knownPassword: 'matkhau123',
    envKey: 'LOCAL_DEMO_ANNGUYEN_PASSWORD'
  },
  {
    table: 'Students',
    username: 'binhtran',
    knownPassword: 'matkhau123',
    envKey: 'LOCAL_DEMO_BINHTRAN_PASSWORD'
  },
  {
    table: 'Students',
    username: 'chilam',
    knownPassword: 'matkhau123',
    envKey: 'LOCAL_DEMO_CHILAM_PASSWORD'
  }
];

// H?m parseArgs d?ng ?? ph?n t?ch ??u v?o th?nh c?u tr?c c? th? s? d?ng; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function parseArgs(argv = []) {
  const options = {
    apply: false,
    confirmDatabase: ''
  };

  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const arg of argv) {
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (arg === APPLY_FLAG) {
      options.apply = true;
      continue;
    }
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (arg.startsWith(CONFIRM_DATABASE_PREFIX)) {
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (options.confirmDatabase) {
        throw new Error('Chỉ được truyền --confirm-database một lần.');
      }
      const databaseName = arg.slice(CONFIRM_DATABASE_PREFIX.length).trim();
      options.confirmDatabase = validateDatabaseName(databaseName);
      continue;
    }
    throw new Error('Có tham số không được hỗ trợ.');
  }

  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (options.confirmDatabase && !options.apply) {
    throw new Error('--confirm-database chỉ được dùng cùng --apply.');
  }
  return options;
}

// H?m inspectCurrentState d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function inspectCurrentState(dependencies = {}) {
  const fsApi = dependencies.fs || fs;
  const dbApi = dependencies.db || db;
  const bcryptApi = dependencies.bcrypt || bcrypt;
  const env = dependencies.env || process.env;
  const envPath = dependencies.envPath || ENV_PATH;

  const rawEnv = await fsApi.readFile(envPath, 'utf8');
  const previousEncryptionSecret = env.API_KEY_ENCRYPTION_SECRET
    || env.SESSION_SECRET
    || '';
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!previousEncryptionSecret) {
    throw new Error('Không có API_KEY_ENCRYPTION_SECRET hoặc SESSION_SECRET để giải mã dữ liệu hiện tại.');
  }

  const connectionState = await dbApi.testConnection();
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!connectionState.connected) {
    throw new Error(`Không kết nối được MySQL: ${connectionState.reason || 'missing_config'}`);
  }

  const databaseRows = await dbApi.query('SELECT DATABASE() AS database_name');
  const rawDatabaseName = String(databaseRows[0]?.database_name || '').trim();
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!rawDatabaseName) {
    throw new Error('Không xác định được database MySQL đang kết nối.');
  }
  const databaseName = validateDatabaseName(rawDatabaseName);

  const secretRows = await dbApi.query(
    `SELECT setting_key, setting_value
     FROM SystemSettings
     WHERE setting_key LIKE '%api_key%' OR setting_key LIKE '%api_secret%'`
  );
  const decryptedSettings = secretRows.map((row) => ({
    key: row.setting_key,
    value: decryptSecret(row.setting_value || '', previousEncryptionSecret)
  }));

  const matchingDemoAccounts = [];
  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const account of KNOWN_DEMO_ACCOUNTS) {
    const rows = await dbApi.query(
      `SELECT username, password_hash FROM ${account.table} WHERE username = ? LIMIT 1`,
      [account.username]
    );
    const row = rows[0];
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!row || !(await bcryptApi.compare(account.knownPassword, row.password_hash))) continue;
    matchingDemoAccounts.push(account);
  }

  return {
    rawEnv,
    previousEncryptionSecret,
    databaseName,
    decryptedSettings,
    matchingDemoAccounts,
    envPath
  };
}

// H?m validateDatabaseName d?ng ?? ki?m tra t?nh h?p l? v? c?c ?i?u ki?n an to?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function validateDatabaseName(value) {
  const databaseName = String(value || '').trim();
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!SAFE_DATABASE_NAME_PATTERN.test(databaseName)) {
    throw new Error('Tên database không thể dùng làm xác nhận an toàn.');
  }
  return databaseName;
}

// H?m buildPreflightReport d?ng ?? x?y d?ng k?t qu? t? c?c ngu?n d? li?u v? quy t?c li?n quan; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function buildPreflightReport(state) {
  return {
    mode: 'preflight',
    database: state.databaseName,
    applicationSecretsToRotate: [...APPLICATION_SECRET_KEYS],
    encryptedSettingCount: state.decryptedSettings.filter((setting) => setting.value).length,
    demoCredentialCount: state.matchingDemoAccounts.length,
    credentialsDestination: '.env'
  };
}

// H?m assertApplyConfirmation d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function assertApplyConfirmation(options, databaseName) {
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!options.apply) return;
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!options.confirmDatabase || options.confirmDatabase !== databaseName) {
    throw new Error(
      `Để áp dụng, chạy lại với ${APPLY_FLAG} `
      + `${CONFIRM_DATABASE_PREFIX}${databaseName}`
    );
  }
}

// H?m applyRotation d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function applyRotation(state, dependencies = {}) {
  const fsApi = dependencies.fs || fs;
  const dbApi = dependencies.db || db;
  const bcryptApi = dependencies.bcrypt || bcrypt;
  const createSecret = dependencies.randomSecret || randomSecret;
  const newSecrets = Object.fromEntries(
    APPLICATION_SECRET_KEYS.map((key) => [key, createSecret(48)])
  );
  const credentialUpdates = [];
  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const account of state.matchingDemoAccounts) {
    const password = createSecret(24);
    credentialUpdates.push({
      ...account,
      password,
      passwordHash: await bcryptApi.hash(password, 12)
    });
  }

  let envWriteAttempted = false;
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    await dbApi.transaction(async (connection) => {
      const [databaseRows] = await connection.execute(
        'SELECT DATABASE() AS database_name'
      );
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (String(databaseRows[0]?.database_name || '').trim() !== state.databaseName) {
        throw new Error('Database đích đã thay đổi sau bước preflight; hủy xoay credentials.');
      }

      // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
      for (const setting of state.decryptedSettings) {
        await connection.execute(
          'UPDATE SystemSettings SET setting_value = ? WHERE setting_key = ?',
          [encryptSecret(setting.value, newSecrets.API_KEY_ENCRYPTION_SECRET), setting.key]
        );
      }
      // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
      for (const account of credentialUpdates) {
        await connection.execute(
          `UPDATE ${account.table}
           SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
           WHERE username = ?`,
          [account.passwordHash, account.username]
        );
      }

      const envUpdates = {
        ...newSecrets,
        ...Object.fromEntries(credentialUpdates.map((account) => [account.envKey, account.password]))
      };
      envWriteAttempted = true;
      await fsApi.writeFile(state.envPath, updateEnv(state.rawEnv, envUpdates), 'utf8');
    });
  } catch (error) {
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (envWriteAttempted) {
      // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
      try {
        await fsApi.writeFile(state.envPath, state.rawEnv, 'utf8');
      } catch (restoreError) {
        const recoveryError = new Error(
          'Xoay credentials thất bại và không thể tự khôi phục .env; cần phục hồi bản sao lưu ngay.'
        );
        recoveryError.cause = error;
        throw recoveryError;
      }
    }
    throw error;
  }

  return {
    mode: 'post-apply',
    database: state.databaseName,
    rotatedApplicationSecrets: [...APPLICATION_SECRET_KEYS],
    reEncryptedSettingCount: state.decryptedSettings.filter((setting) => setting.value).length,
    rotatedCredentialCount: credentialUpdates.length,
    credentialsStoredIn: '.env'
  };
}

// H?m main d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function main(argv = process.argv.slice(2), dependencies = {}) {
  const options = parseArgs(argv);
  const logger = dependencies.logger || console;
  const state = await inspectCurrentState(dependencies);
  const preflight = buildPreflightReport(state);
  logger.log(JSON.stringify(preflight, null, 2));

  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!options.apply) {
    logger.log(
      'Chưa thay đổi file hoặc database. Dùng '
      + `"node scripts/rotate_security_credentials.js ${APPLY_FLAG} `
      + `${CONFIRM_DATABASE_PREFIX}${state.databaseName}" để áp dụng.`
    );
    return preflight;
  }

  assertApplyConfirmation(options, state.databaseName);
  const result = await applyRotation(state, dependencies);
  logger.log(JSON.stringify(result, null, 2));
  return result;
}

// H?m randomSecret d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function randomSecret(byteLength) {
  return crypto.randomBytes(byteLength).toString('base64url');
}

// H?m getEncryptionKey d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function getEncryptionKey(secret) {
  return crypto.createHash('sha256').update(secret).digest();
}

// H?m decryptSecret d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function decryptSecret(value, secret) {
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!value || !value.startsWith('enc:v1:')) return value;
  const parts = value.split(':');
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (parts.length !== 5) throw new Error('Giá trị secret mã hóa không đúng định dạng enc:v1.');

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getEncryptionKey(secret),
    Buffer.from(parts[2], 'base64')
  );
  decipher.setAuthTag(Buffer.from(parts[3], 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(parts[4], 'base64')),
    decipher.final()
  ]).toString('utf8');
}

// H?m encryptSecret d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function encryptSecret(value, secret) {
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!value) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

// H?m updateEnv d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function updateEnv(rawEnv, updates) {
  const lines = rawEnv.split(/\r?\n/);
  const updateMap = new Map(Object.entries(updates));
  const written = new Set();
  const output = [];
  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const line of lines) {
    const match = line.match(/^([A-Z0-9_]+)=/);
    const key = match?.[1];
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!key || !updateMap.has(key)) {
      output.push(line);
      continue;
    }
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (written.has(key)) continue;
    output.push(`${key}=${updateMap.get(key)}`);
    written.add(key);
  }
  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const [key, value] of updateMap) {
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (written.has(key)) continue;
    output.push(`${key}=${value}`);
  }
  return `${output.join('\n').replace(/\n+$/, '')}\n`;
}

// Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
if (require.main === module) {
  main()
    .catch((error) => {
      console.error(`Không thể xoay khóa bảo mật: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(async () => {
      // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
      try {
        await db.close();
      } catch (closeError) {
        // Giữ nguyên lỗi gốc.
      }
    });
}

module.exports = {
  APPLY_FLAG,
  CONFIRM_DATABASE_PREFIX,
  APPLICATION_SECRET_KEYS,
  SAFE_DATABASE_NAME_PATTERN,
  parseArgs,
  validateDatabaseName,
  inspectCurrentState,
  buildPreflightReport,
  assertApplyConfirmation,
  applyRotation,
  randomSecret,
  decryptSecret,
  encryptSecret,
  updateEnv,
  main
};
