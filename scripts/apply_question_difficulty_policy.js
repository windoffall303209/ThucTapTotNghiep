// Script apply question difficulty policy hỗ trợ nhập, xuất, kiểm tra hoặc bảo trì dữ liệu và cấu hình của dự án.
require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const path = require('node:path');
const db = require('../config/db');

const ROOT = path.resolve(__dirname, '..');
const PLAN_PATH = path.join(ROOT, 'data', 'question_difficulty_policy_20260809.json');
const TEX_BY_GRADE = {
  1: 'grade1_question_bank_reviewed.tex',
  2: 'grade2_question_bank.tex',
  3: 'grade3_question_bank.tex',
  4: 'grade4_question_bank.tex',
  5: 'grade5_question_bank.tex'
};
const RULES = {
  1: { EASY: { side: 'tail', rate: 0.10, target: 'HARD' }, MEDIUM: { side: 'tail', rate: 0.10, target: 'HARD' } },
  2: { MEDIUM: { side: 'tail', rate: 0.15, target: 'HARD' } },
  3: { EASY: { side: 'tail', rate: 0.08, target: 'HARD' }, MEDIUM: { side: 'tail', rate: 0.20, target: 'HARD' } },
  4: { EASY: { side: 'tail', rate: 0.08, target: 'HARD' }, MEDIUM: { side: 'tail', rate: 0.18, target: 'HARD' } },
  5: { MEDIUM: { side: 'head', rate: 0.10, target: 'EASY' }, HARD: { side: 'head', rate: 0.20, target: 'MEDIUM' } }
};

// Hàm decodePayload dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function decodePayload(line) {
  return JSON.parse(Buffer.from(line.slice('% DBJSON '.length).trim(), 'base64').toString('utf8'));
}

// Hàm encodePayload dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

// Hàm readTexPayloads dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function readTexPayloads(grade) {
  const filePath = path.join(ROOT, 'data', TEX_BY_GRADE[grade]);
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
    .filter((line) => line.startsWith('% DBJSON ')).map(decodePayload);
}

// Hàm activeRowsByGrade dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function activeRowsByGrade(grade) {
  return db.query(
    `SELECT q.id, q.difficulty,
            JSON_UNQUOTE(JSON_EXTRACT(q.content, '$.source_key')) AS source_key
     FROM QuestionBank q
     JOIN Lessons l ON l.id = q.lesson_id
     JOIN Chapters ch ON ch.id = l.chapter_id
     WHERE q.is_active = 1 AND ch.grade = ?
     ORDER BY q.id`,
    [grade]
  );
}

// Hàm createPlan dùng để tạo bản ghi hoặc tài nguyên mới sau khi kiểm tra đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function createPlan() {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (fs.existsSync(PLAN_PATH)) throw new Error(`Kế hoạch đã tồn tại: ${PLAN_PATH}`);
  const operations = new Map();
  const ruleSummary = [];

  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const grade of [1, 2, 3, 4, 5]) {
    const rows = await activeRowsByGrade(grade);
    const mainRows = rows.filter((row) => !row.source_key);
    const payloads = readTexPayloads(grade);
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (mainRows.length !== payloads.length) {
      throw new Error(`Lớp ${grade}: ${mainRows.length} câu chính trong DB nhưng ${payloads.length} payload trong TEX`);
    }
    const externalIdByDbId = new Map(mainRows.map((row, index) => [Number(row.id), payloads[index].external_id]));

    // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
    for (const [difficulty, rule] of Object.entries(RULES[grade])) {
      const candidates = rows.filter((row) => row.difficulty === difficulty);
      const count = Math.floor(candidates.length * rule.rate);
      const selected = rule.side === 'head' ? candidates.slice(0, count) : candidates.slice(-count);
      // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
      for (const row of selected) {
        operations.set(Number(row.id), {
          db_id: Number(row.id),
          grade,
          original_difficulty: row.difficulty,
          target_difficulty: rule.target,
          source_kind: row.source_key ? 'supplement' : 'main',
          external_id: externalIdByDbId.get(Number(row.id)) || null,
          source_key: row.source_key || null,
          reasons: [`${rule.side}_${difficulty}_${Math.round(rule.rate * 100)}pct`]
        });
      }
      ruleSummary.push({ grade, difficulty, side: rule.side, rate: rule.rate, total: candidates.length, selected: count, target: rule.target });
    }

    // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
    for (const row of rows.filter((item) => item.source_key)) {
      const id = Number(row.id);
      const current = operations.get(id);
      operations.set(id, {
        db_id: id,
        grade,
        original_difficulty: row.difficulty,
        target_difficulty: 'HARD',
        source_kind: 'supplement',
        external_id: null,
        source_key: row.source_key,
        reasons: [...(current?.reasons || []), 'all_supplements_hard']
      });
    }
  }

  const plan = {
    policy_date: '2026-08-09',
    rounding: 'floor',
    selection_basis: 'active questions ordered by database id before relabeling',
    rule_summary: ruleSummary,
    operations: [...operations.values()].sort((a, b) => a.db_id - b.db_id)
  };
  fs.writeFileSync(PLAN_PATH, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  console.log(`Đã tạo kế hoạch ${path.relative(ROOT, PLAN_PATH)} với ${plan.operations.length} câu.`);
}

// Hàm updateTexSources dùng để cập nhật trạng thái hoặc dữ liệu theo quy tắc nghiệp vụ; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function updateTexSources(plan) {
  const targets = new Map(plan.operations.filter((item) => item.external_id).map((item) => [item.external_id, item.target_difficulty]));
  let changed = 0;
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const grade of [1, 2, 3, 4, 5]) {
    const filePath = path.join(ROOT, 'data', TEX_BY_GRADE[grade]);
    const lines = fs.readFileSync(filePath, 'utf8').split(/(?<=\n)/);
    // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
    for (let index = 0; index < lines.length; index += 1) {
      const raw = lines[index].replace(/\r?\n$/, '');
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (!raw.startsWith('% DBJSON ')) continue;
      const payload = decodePayload(raw);
      const target = targets.get(payload.external_id);
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (!target || payload.difficulty === target) continue;
      const ending = lines[index].slice(raw.length);
      payload.difficulty = target;
      lines[index] = `% DBJSON ${encodePayload(payload)}${ending}`;
      const visible = new RegExp(`(${payload.external_id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\()[A-Z]+(\\):)`);
      // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
      for (let cursor = index + 1; cursor < Math.min(lines.length, index + 8); cursor += 1) {
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (visible.test(lines[cursor])) {
          lines[cursor] = lines[cursor].replace(visible, `$1${target}$2`);
          break;
        }
      }
      changed += 1;
    }
    fs.writeFileSync(filePath, lines.join(''), 'utf8');
  }
  console.log(`Đã đổi nhãn ${changed} câu trong các nguồn TEX.`);
}

// Hàm updateSupplementSources dùng để cập nhật trạng thái hoặc dữ liệu theo quy tắc nghiệp vụ; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function updateSupplementSources() {
  const directory = path.join(ROOT, 'review', 'question_bank_redesign');
  const files = fs.readdirSync(directory).filter((name) => /^batch-.*\.json$/i.test(name));
  let questions = 0;
  let changed = 0;
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const name of files) {
    const filePath = path.join(directory, name);
    const batch = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
    for (const question of batch.questions || []) {
      questions += 1;
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (question.difficulty !== 'HARD') {
        question.difficulty = 'HARD';
        changed += 1;
      }
    }
    fs.writeFileSync(filePath, `${JSON.stringify(batch, null, 2)}\n`, 'utf8');
  }
  console.log(`Đã kiểm tra ${questions} câu bổ sung và đổi ${changed} câu sang HARD.`);
}

// Hàm applyDatabase dùng để cập nhật trạng thái hoặc dữ liệu theo quy tắc nghiệp vụ; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function applyDatabase(plan) {
  await db.transaction(async (connection) => {
    // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
    for (const operation of plan.operations) {
      const [rows] = await connection.execute('SELECT difficulty FROM QuestionBank WHERE id = ? AND is_active = 1 FOR UPDATE', [operation.db_id]);
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (!rows[0]) throw new Error(`Không tìm thấy câu đang hoạt động id=${operation.db_id}`);
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (![operation.original_difficulty, operation.target_difficulty].includes(rows[0].difficulty)) {
        throw new Error(`Câu id=${operation.db_id} đang có nhãn ${rows[0].difficulty}, không khớp kế hoạch`);
      }
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (rows[0].difficulty !== operation.target_difficulty) {
        await connection.execute('UPDATE QuestionBank SET difficulty = ? WHERE id = ?', [operation.target_difficulty, operation.db_id]);
      }
    }
  });
  console.log(`Đã áp dụng ${plan.operations.length} mục kế hoạch vào database.`);
}

// Hàm verify dùng để đối chiếu kết quả với các điều kiện mong đợi và báo cáo sai lệch; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function verify(plan) {
  const expected = new Map(plan.operations.map((item) => [item.db_id, item.target_difficulty]));
  const ids = [...expected.keys()];
  const rows = [];
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (let offset = 0; offset < ids.length; offset += 500) {
    const chunk = ids.slice(offset, offset + 500);
    const placeholders = chunk.map(() => '?').join(',');
    rows.push(...await db.query(`SELECT id, difficulty FROM QuestionBank WHERE id IN (${placeholders})`, chunk));
  }
  const mismatches = rows.filter((row) => expected.get(Number(row.id)) !== row.difficulty);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (rows.length !== ids.length || mismatches.length) throw new Error(`Database còn ${ids.length - rows.length + mismatches.length} mục chưa khớp kế hoạch`);
  const stats = await db.query(
    `SELECT ch.grade, q.difficulty, COUNT(*) AS total
     FROM QuestionBank q JOIN Lessons l ON l.id=q.lesson_id JOIN Chapters ch ON ch.id=l.chapter_id
     WHERE q.is_active=1 AND ch.grade BETWEEN 1 AND 5
     GROUP BY ch.grade, q.difficulty ORDER BY ch.grade, FIELD(q.difficulty,'EASY','MEDIUM','HARD')`
  );
  console.table(stats);
}

// Hàm main dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function main() {
  const args = new Set(process.argv.slice(2));
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (args.has('--create-plan')) await createPlan();
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!fs.existsSync(PLAN_PATH)) throw new Error('Chưa có manifest; chạy với --create-plan trước');
  const plan = JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8'));
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (args.has('--update-sources')) {
    updateTexSources(plan);
    updateSupplementSources();
  }
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (args.has('--apply-db')) await applyDatabase(plan);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (args.has('--verify')) await verify(plan);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (![...args].some((arg) => ['--create-plan', '--update-sources', '--apply-db', '--verify'].includes(arg))) {
    console.log(JSON.stringify({ operations: plan.operations.length, rules: plan.rule_summary }, null, 2));
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(async () => db.close());
