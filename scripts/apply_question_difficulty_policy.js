// Script apply question difficulty policy h? tr? nh?p, xu?t, ki?m tra ho?c b?o tr? d? li?u v? c?u h?nh c?a d? ?n.
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

// H?m decodePayload d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function decodePayload(line) {
  return JSON.parse(Buffer.from(line.slice('% DBJSON '.length).trim(), 'base64').toString('utf8'));
}

// H?m encodePayload d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

// H?m readTexPayloads d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function readTexPayloads(grade) {
  const filePath = path.join(ROOT, 'data', TEX_BY_GRADE[grade]);
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
    .filter((line) => line.startsWith('% DBJSON ')).map(decodePayload);
}

// H?m activeRowsByGrade d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
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

// H?m createPlan d?ng ?? t?o b?n ghi ho?c t?i nguy?n m?i sau khi ki?m tra ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function createPlan() {
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (fs.existsSync(PLAN_PATH)) throw new Error(`Kế hoạch đã tồn tại: ${PLAN_PATH}`);
  const operations = new Map();
  const ruleSummary = [];

  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const grade of [1, 2, 3, 4, 5]) {
    const rows = await activeRowsByGrade(grade);
    const mainRows = rows.filter((row) => !row.source_key);
    const payloads = readTexPayloads(grade);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (mainRows.length !== payloads.length) {
      throw new Error(`Lớp ${grade}: ${mainRows.length} câu chính trong DB nhưng ${payloads.length} payload trong TEX`);
    }
    const externalIdByDbId = new Map(mainRows.map((row, index) => [Number(row.id), payloads[index].external_id]));

    // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
    for (const [difficulty, rule] of Object.entries(RULES[grade])) {
      const candidates = rows.filter((row) => row.difficulty === difficulty);
      const count = Math.floor(candidates.length * rule.rate);
      const selected = rule.side === 'head' ? candidates.slice(0, count) : candidates.slice(-count);
      // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
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

    // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
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

// H?m updateTexSources d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function updateTexSources(plan) {
  const targets = new Map(plan.operations.filter((item) => item.external_id).map((item) => [item.external_id, item.target_difficulty]));
  let changed = 0;
  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const grade of [1, 2, 3, 4, 5]) {
    const filePath = path.join(ROOT, 'data', TEX_BY_GRADE[grade]);
    const lines = fs.readFileSync(filePath, 'utf8').split(/(?<=\n)/);
    // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
    for (let index = 0; index < lines.length; index += 1) {
      const raw = lines[index].replace(/\r?\n$/, '');
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (!raw.startsWith('% DBJSON ')) continue;
      const payload = decodePayload(raw);
      const target = targets.get(payload.external_id);
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (!target || payload.difficulty === target) continue;
      const ending = lines[index].slice(raw.length);
      payload.difficulty = target;
      lines[index] = `% DBJSON ${encodePayload(payload)}${ending}`;
      const visible = new RegExp(`(${payload.external_id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\()[A-Z]+(\\):)`);
      // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
      for (let cursor = index + 1; cursor < Math.min(lines.length, index + 8); cursor += 1) {
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
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

// H?m updateSupplementSources d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function updateSupplementSources() {
  const directory = path.join(ROOT, 'review', 'question_bank_redesign');
  const files = fs.readdirSync(directory).filter((name) => /^batch-.*\.json$/i.test(name));
  let questions = 0;
  let changed = 0;
  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const name of files) {
    const filePath = path.join(directory, name);
    const batch = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
    for (const question of batch.questions || []) {
      questions += 1;
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (question.difficulty !== 'HARD') {
        question.difficulty = 'HARD';
        changed += 1;
      }
    }
    fs.writeFileSync(filePath, `${JSON.stringify(batch, null, 2)}\n`, 'utf8');
  }
  console.log(`Đã kiểm tra ${questions} câu bổ sung và đổi ${changed} câu sang HARD.`);
}

// H?m applyDatabase d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function applyDatabase(plan) {
  await db.transaction(async (connection) => {
    // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
    for (const operation of plan.operations) {
      const [rows] = await connection.execute('SELECT difficulty FROM QuestionBank WHERE id = ? AND is_active = 1 FOR UPDATE', [operation.db_id]);
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (!rows[0]) throw new Error(`Không tìm thấy câu đang hoạt động id=${operation.db_id}`);
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (![operation.original_difficulty, operation.target_difficulty].includes(rows[0].difficulty)) {
        throw new Error(`Câu id=${operation.db_id} đang có nhãn ${rows[0].difficulty}, không khớp kế hoạch`);
      }
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (rows[0].difficulty !== operation.target_difficulty) {
        await connection.execute('UPDATE QuestionBank SET difficulty = ? WHERE id = ?', [operation.target_difficulty, operation.db_id]);
      }
    }
  });
  console.log(`Đã áp dụng ${plan.operations.length} mục kế hoạch vào database.`);
}

// H?m verify d?ng ?? ??i chi?u k?t qu? v?i c?c ?i?u ki?n mong ??i v? b?o c?o sai l?ch; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function verify(plan) {
  const expected = new Map(plan.operations.map((item) => [item.db_id, item.target_difficulty]));
  const ids = [...expected.keys()];
  const rows = [];
  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (let offset = 0; offset < ids.length; offset += 500) {
    const chunk = ids.slice(offset, offset + 500);
    const placeholders = chunk.map(() => '?').join(',');
    rows.push(...await db.query(`SELECT id, difficulty FROM QuestionBank WHERE id IN (${placeholders})`, chunk));
  }
  const mismatches = rows.filter((row) => expected.get(Number(row.id)) !== row.difficulty);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (rows.length !== ids.length || mismatches.length) throw new Error(`Database còn ${ids.length - rows.length + mismatches.length} mục chưa khớp kế hoạch`);
  const stats = await db.query(
    `SELECT ch.grade, q.difficulty, COUNT(*) AS total
     FROM QuestionBank q JOIN Lessons l ON l.id=q.lesson_id JOIN Chapters ch ON ch.id=l.chapter_id
     WHERE q.is_active=1 AND ch.grade BETWEEN 1 AND 5
     GROUP BY ch.grade, q.difficulty ORDER BY ch.grade, FIELD(q.difficulty,'EASY','MEDIUM','HARD','EXPERT')`
  );
  console.table(stats);
}

// H?m main d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function main() {
  const args = new Set(process.argv.slice(2));
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (args.has('--create-plan')) await createPlan();
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!fs.existsSync(PLAN_PATH)) throw new Error('Chưa có manifest; chạy với --create-plan trước');
  const plan = JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8'));
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (args.has('--update-sources')) {
    updateTexSources(plan);
    updateSupplementSources();
  }
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (args.has('--apply-db')) await applyDatabase(plan);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (args.has('--verify')) await verify(plan);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (![...args].some((arg) => ['--create-plan', '--update-sources', '--apply-db', '--verify'].includes(arg))) {
    console.log(JSON.stringify({ operations: plan.operations.length, rules: plan.rule_summary }, null, 2));
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(async () => db.close());
