require('dotenv').config({ quiet: true });

const fs = require('node:fs/promises');
const path = require('node:path');
const mysql = require('mysql2/promise');
const {
  buildDatabasePoolOptions,
  loadDatabaseSslMaterial
} = require('../config/db');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SQL_TARGETS = Object.freeze({
  schema: {
    file: path.join(PROJECT_ROOT, 'database', 'database_schema.sql'),
    destructive: true,
    description: 'khởi tạo lại toàn bộ schema'
  },
  seed: {
    file: path.join(PROJECT_ROOT, 'database', 'seed.sql'),
    destructive: false,
    demoCredentials: true,
    description: 'nạp dữ liệu và tài khoản demo'
  }
});

function parseArguments(argv = process.argv.slice(2)) {
  const [targetName, ...flags] = argv;
  const confirmDatabaseFlag = flags.find((item) => item.startsWith('--confirm-database='));
  return {
    targetName: String(targetName || '').trim().toLowerCase(),
    apply: flags.includes('--apply'),
    confirmDatabase: confirmDatabaseFlag
      ? confirmDatabaseFlag.slice('--confirm-database='.length)
      : '',
    confirmDemoCredentials: flags.includes('--confirm-demo-credentials')
  };
}

function buildExecutionPlan(args, env = process.env) {
  const target = SQL_TARGETS[args.targetName];
  if (!target) {
    throw createUsageError(`Loại SQL không hợp lệ: ${args.targetName || '(trống)'}`);
  }

  const databaseName = String(env.DB_NAME || '').trim();
  const missingConfig = ['DB_HOST', 'DB_USER', 'DB_NAME']
    .filter((key) => !String(env[key] || '').trim());
  if (missingConfig.length > 0) {
    throw createUsageError(`Thiếu cấu hình: ${missingConfig.join(', ')}`);
  }

  const production = env.NODE_ENV === 'production';
  if (args.apply && target.destructive && args.confirmDatabase !== databaseName) {
    throw createUsageError(
      `Phải xác nhận đúng database bằng --confirm-database=${databaseName}`
    );
  }
  if (
    args.apply
    && target.destructive
    && production
    && env.ALLOW_PRODUCTION_DATABASE_RESET !== 'true'
  ) {
    throw createUsageError(
      'Không được reset database production nếu ALLOW_PRODUCTION_DATABASE_RESET không bằng true'
    );
  }
  if (args.apply && target.demoCredentials && production) {
    throw createUsageError('Không được nạp tài khoản demo trong production');
  }
  if (args.apply && target.demoCredentials && !args.confirmDemoCredentials) {
    throw createUsageError(
      'Phải thêm --confirm-demo-credentials để xác nhận nạp tài khoản demo'
    );
  }

  return {
    ...target,
    targetName: args.targetName,
    databaseName,
    apply: args.apply,
    production
  };
}

function buildConnectionOptions(env = process.env) {
  const sslMaterial = loadDatabaseSslMaterial(env);
  const poolOptions = buildDatabasePoolOptions(env, sslMaterial);
  const {
    waitForConnections,
    connectionLimit,
    queueLimit,
    namedPlaceholders,
    ...connectionOptions
  } = poolOptions;
  return {
    ...connectionOptions,
    multipleStatements: true
  };
}

async function executePlan(plan, env = process.env) {
  if (!plan.apply) return { applied: false };

  const sql = await fs.readFile(plan.file, 'utf8');
  const connection = await mysql.createConnection(buildConnectionOptions(env));
  try {
    const [rows] = await connection.query('SELECT DATABASE() AS database_name');
    const selectedDatabase = String(rows?.[0]?.database_name || '');
    if (selectedDatabase !== plan.databaseName) {
      throw createUsageError(
        `Kết nối đang chọn database "${selectedDatabase}", không phải "${plan.databaseName}"`
      );
    }
    await connection.query(sql);
    return { applied: true };
  } finally {
    await connection.end();
  }
}

function createUsageError(message) {
  const error = new Error(message);
  error.code = 'INVALID_SQL_RUN_REQUEST';
  return error;
}

function printPlan(plan) {
  console.log(`Mục tiêu: ${plan.description}`);
  console.log(`Database: ${plan.databaseName}`);
  console.log(`Môi trường: ${plan.production ? 'production' : 'non-production'}`);
  if (!plan.apply) {
    console.log('Chỉ kiểm tra. Chưa có thay đổi nào được áp dụng.');
    if (plan.destructive) {
      console.log(
        `Để thực thi: npm run db:init -- --apply --confirm-database=${plan.databaseName}`
      );
    } else {
      console.log(
        'Để thực thi: npm run db:seed-demo -- --apply --confirm-demo-credentials'
      );
    }
  }
}

async function main() {
  const args = parseArguments();
  const plan = buildExecutionPlan(args);
  printPlan(plan);
  const result = await executePlan(plan);
  if (result.applied) {
    console.log(`Đã hoàn tất: ${plan.description} trên database ${plan.databaseName}.`);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Không thể chạy file SQL: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  SQL_TARGETS,
  buildConnectionOptions,
  buildExecutionPlan,
  executePlan,
  parseArguments
};
