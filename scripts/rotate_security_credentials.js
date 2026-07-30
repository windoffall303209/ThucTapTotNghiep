require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('../config/db');

const ROOT_DIR = path.join(__dirname, '..');
const ENV_PATH = path.join(ROOT_DIR, '.env');
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

async function main() {
  const rawEnv = await fs.readFile(ENV_PATH, 'utf8');
  const previousEncryptionSecret = process.env.API_KEY_ENCRYPTION_SECRET
    || process.env.SESSION_SECRET
    || '';
  if (!previousEncryptionSecret) {
    throw new Error('Không có API_KEY_ENCRYPTION_SECRET hoặc SESSION_SECRET để giải mã dữ liệu hiện tại.');
  }

  const connectionState = await db.testConnection();
  if (!connectionState.connected) {
    throw new Error(`Không kết nối được MySQL: ${connectionState.reason || 'missing_config'}`);
  }

  const newSecrets = {
    SESSION_SECRET: randomSecret(48),
    JWT_SECRET: randomSecret(48),
    API_KEY_ENCRYPTION_SECRET: randomSecret(48)
  };
  const secretRows = await db.query(
    `SELECT setting_key, setting_value
     FROM SystemSettings
     WHERE setting_key LIKE '%api_key%' OR setting_key LIKE '%api_secret%'`
  );
  const decryptedSettings = secretRows.map((row) => ({
    key: row.setting_key,
    value: decryptSecret(row.setting_value || '', previousEncryptionSecret)
  }));

  const credentialUpdates = [];
  for (const account of KNOWN_DEMO_ACCOUNTS) {
    const rows = await db.query(
      `SELECT username, password_hash FROM ${account.table} WHERE username = ? LIMIT 1`,
      [account.username]
    );
    const row = rows[0];
    if (!row || !(await bcrypt.compare(account.knownPassword, row.password_hash))) continue;

    const password = randomSecret(24);
    credentialUpdates.push({
      ...account,
      password,
      passwordHash: await bcrypt.hash(password, 12)
    });
  }

  let envWritten = false;
  try {
    await db.transaction(async (connection) => {
      for (const setting of decryptedSettings) {
        await connection.execute(
          'UPDATE SystemSettings SET setting_value = ? WHERE setting_key = ?',
          [encryptSecret(setting.value, newSecrets.API_KEY_ENCRYPTION_SECRET), setting.key]
        );
      }
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
      await fs.writeFile(ENV_PATH, updateEnv(rawEnv, envUpdates), 'utf8');
      envWritten = true;
    });
  } catch (error) {
    if (envWritten) {
      await fs.writeFile(ENV_PATH, rawEnv, 'utf8');
    }
    throw error;
  } finally {
    await db.close();
  }

  console.log(JSON.stringify({
    rotatedApplicationSecrets: Object.keys(newSecrets),
    reEncryptedSettingCount: decryptedSettings.filter((setting) => setting.value).length,
    rotatedCredentialCount: credentialUpdates.length,
    credentialsStoredIn: '.env'
  }, null, 2));
}

function randomSecret(byteLength) {
  return crypto.randomBytes(byteLength).toString('base64url');
}

function getEncryptionKey(secret) {
  return crypto.createHash('sha256').update(secret).digest();
}

function decryptSecret(value, secret) {
  if (!value || !value.startsWith('enc:v1:')) return value;
  const parts = value.split(':');
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

function encryptSecret(value, secret) {
  if (!value) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

function updateEnv(rawEnv, updates) {
  const lines = rawEnv.split(/\r?\n/);
  const indexes = new Map();
  lines.forEach((line, index) => {
    const match = line.match(/^([A-Z0-9_]+)=/);
    if (match) indexes.set(match[1], index);
  });

  for (const [key, value] of Object.entries(updates)) {
    const line = `${key}=${value}`;
    if (indexes.has(key)) lines[indexes.get(key)] = line;
    else lines.push(line);
  }
  return `${lines.join('\n').replace(/\n+$/, '')}\n`;
}

main().catch(async (error) => {
  try {
    await db.close();
  } catch (closeError) {
    // Giữ nguyên lỗi gốc.
  }
  console.error(`Không thể xoay khóa bảo mật: ${error.message}`);
  process.exit(1);
});
