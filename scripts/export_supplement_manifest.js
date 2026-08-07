/* eslint-disable no-console */
require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const path = require('node:path');

const db = require('../config/db');

const DEFAULT_OUTPUT = path.resolve(
  __dirname,
  '..',
  'database',
  'question_supplements',
  'supplement_manifest.json'
);

async function buildManifest() {
  const questions = await db.query(
    `SELECT
       JSON_UNQUOTE(JSON_EXTRACT(q.content, '$.source_key')) AS source_key,
       c.grade,
       c.id AS chapter_id,
       c.chapter_name,
       c.sort_order AS chapter_order,
       l.id AS lesson_id,
       l.lesson_name,
       l.sort_order AS lesson_order,
       q.id AS question_id,
       q.question_type,
       q.difficulty,
       q.layout_template,
       q.content,
       q.choices,
       q.correct_answer,
       q.explanation
     FROM QuestionBank q
     JOIN Lessons l ON l.id = q.lesson_id
     JOIN Chapters c ON c.id = l.chapter_id
     WHERE q.is_active = 1
       AND JSON_UNQUOTE(JSON_EXTRACT(q.content, '$.source_key')) LIKE 'SUP-20260807-%'
     ORDER BY c.grade, c.sort_order, l.sort_order, q.id`
  );

  return {
    title: 'Ngân hàng câu hỏi bổ sung lớp 1-5',
    generated_at: new Date().toISOString(),
    source: 'QuestionBank',
    question_count: questions.length,
    questions
  };
}

async function main() {
  try {
    const connection = await db.testConnection();
    if (!connection.connected) throw new Error(`Không kết nối được database: ${connection.reason}`);
    const output = path.resolve(process.argv[2] || DEFAULT_OUTPUT);
    const manifest = await buildManifest();
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ output, questionCount: manifest.question_count }, null, 2));
  } finally {
    await db.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = { buildManifest };
