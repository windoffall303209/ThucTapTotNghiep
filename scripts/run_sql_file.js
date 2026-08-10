// Script run sql file hỗ trợ nhập, xuất, kiểm tra hoặc bảo trì dữ liệu và cấu hình của dự án.
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

// Hàm parseArguments dùng để phân tích đầu vào thành cấu trúc có thể sử dụng; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
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

// Hàm buildExecutionPlan dùng để xây dựng kết quả từ các nguồn dữ liệu và quy tắc liên quan; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function buildExecutionPlan(args, env = process.env) {
  const target = SQL_TARGETS[args.targetName];
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!target) {
    throw createUsageError(`Loại SQL không hợp lệ: ${args.targetName || '(trống)'}`);
  }

  const databaseName = String(env.DB_NAME || '').trim();
  const missingConfig = ['DB_HOST', 'DB_USER', 'DB_NAME']
    .filter((key) => !String(env[key] || '').trim());
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (missingConfig.length > 0) {
    throw createUsageError(`Thiếu cấu hình: ${missingConfig.join(', ')}`);
  }

  const production = env.NODE_ENV === 'production';
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (args.apply && target.destructive && args.confirmDatabase !== databaseName) {
    throw createUsageError(
      `Phải xác nhận đúng database bằng --confirm-database=${databaseName}`
    );
  }
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (args.apply && target.demoCredentials && production) {
    throw createUsageError('Không được nạp tài khoản demo trong production');
  }
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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

// Hàm buildConnectionOptions dùng để xây dựng kết quả từ các nguồn dữ liệu và quy tắc liên quan; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
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

// Hàm executePlan dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function executePlan(plan, env = process.env) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!plan.apply) return { applied: false };

  const sql = await fs.readFile(plan.file, 'utf8');
  const connection = await mysql.createConnection(buildConnectionOptions(env));
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  try {
    const [rows] = await connection.query('SELECT DATABASE() AS database_name');
    const selectedDatabase = String(rows?.[0]?.database_name || '');
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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

// Hàm createUsageError dùng để tạo bản ghi hoặc tài nguyên mới sau khi kiểm tra đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function createUsageError(message) {
  const error = new Error(message);
  error.code = 'INVALID_SQL_RUN_REQUEST';
  return error;
}

// Hàm printPlan dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function printPlan(plan) {
  console.log(`Mục tiêu: ${plan.description}`);
  console.log(`Database: ${plan.databaseName}`);
  console.log(`Môi trường: ${plan.production ? 'production' : 'non-production'}`);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!plan.apply) {
    console.log('Chỉ kiểm tra. Chưa có thay đổi nào được áp dụng.');
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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

// Hàm main dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function main() {
  const args = parseArguments();
  const plan = buildExecutionPlan(args);
  printPlan(plan);
  const result = await executePlan(plan);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (result.applied) {
    console.log(`Đã hoàn tất: ${plan.description} trên database ${plan.databaseName}.`);
  }
}

// Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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
