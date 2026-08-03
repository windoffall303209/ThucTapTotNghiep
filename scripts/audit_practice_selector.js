/* eslint-disable no-console */
require('dotenv').config({ quiet: true });

const db = require('../config/db');
const Curriculum = require('../models/Curriculum');
const Question = require('../models/Question');
const { MIN_GRADE, MAX_GRADE } = require('../config/grades');
const { selectQuestionsV2 } = require('../utils/practiceQuestionSelectorV2');

function parseArguments(argv = process.argv.slice(2)) {
  const runsFlag = argv.find((arg) => arg.startsWith('--runs='));
  const unknown = argv.filter((arg) => !arg.startsWith('--runs='));
  if (unknown.length > 0) throw new Error(`Tham số không được hỗ trợ: ${unknown.join(', ')}`);
  const runs = Number(runsFlag?.slice('--runs='.length) || 25);
  if (!Number.isInteger(runs) || runs < 1 || runs > 500) {
    throw new Error('--runs phải là số nguyên từ 1 đến 500.');
  }
  return { runs };
}

function auditScope({ grade, scope, mode, candidates, count, runs }) {
  const poolIds = new Set(candidates.map((question) => Number(question.id)));
  const usedIds = new Set();
  const totals = {
    generated: 0,
    incomplete: 0,
    duplicateQuestionIds: 0,
    outOfScopeQuestionIds: 0,
    difficulty: { EASY: 0, MEDIUM: 0, HARD: 0 },
    fallbackReasons: {}
  };

  for (let run = 0; run < runs; run += 1) {
    const seed = buildAuditSeed(grade, scope, count, run);
    const result = selectQuestionsV2(candidates, { count, mode, seed, maxPerLesson: 2 });
    const ids = result.questions.map((question) => Number(question.id));
    totals.generated += 1;
    if (ids.length !== Math.min(count, candidates.length)) totals.incomplete += 1;
    totals.duplicateQuestionIds += ids.length - new Set(ids).size;
    totals.outOfScopeQuestionIds += ids.filter((id) => !poolIds.has(id)).length;
    ids.forEach((id) => usedIds.add(id));
    for (const difficulty of Object.keys(totals.difficulty)) {
      totals.difficulty[difficulty] += Number(result.selection.metadata.actualDifficulty[difficulty] || 0);
    }
    for (const reason of result.selection.metadata.fallbackReasons) {
      totals.fallbackReasons[reason] = (totals.fallbackReasons[reason] || 0) + 1;
    }
  }

  const selectedTotal = Object.values(totals.difficulty).reduce((sum, value) => sum + value, 0);
  return {
    grade,
    scope,
    mode,
    requestedCount: count,
    candidateCount: candidates.length,
    runs: totals.generated,
    incompleteRuns: totals.incomplete,
    duplicateQuestionIds: totals.duplicateQuestionIds,
    outOfScopeQuestionIds: totals.outOfScopeQuestionIds,
    uniqueQuestionsUsed: usedIds.size,
    poolCoverage: candidates.length > 0
      ? Number((usedIds.size / candidates.length).toFixed(4))
      : 0,
    actualDifficultyRatio: Object.fromEntries(
      Object.entries(totals.difficulty).map(([difficulty, value]) => [
        difficulty,
        selectedTotal > 0 ? Number((value / selectedTotal).toFixed(4)) : 0
      ])
    ),
    fallbackReasons: totals.fallbackReasons
  };
}

function buildAuditSeed(grade, scope, count, run) {
  const value = `${grade}|${scope}|${count}|${run}`;
  let first = 2166136261;
  let second = 0x9e3779b9;
  for (const character of value) {
    first = Math.imul(first ^ character.charCodeAt(0), 16777619) >>> 0;
    second = Math.imul(second ^ character.charCodeAt(0), 2246822519) >>> 0;
  }
  return first.toString(16).padStart(8, '0') + second.toString(16).padStart(8, '0');
}

async function buildAuditReport(runs) {
  const report = [];
  for (let grade = MIN_GRADE; grade <= MAX_GRADE; grade += 1) {
    const [chapters, gradeCandidates] = await Promise.all([
      Curriculum.getCurriculumByGrade(grade),
      Question.getQuestionCandidates({ grade })
    ]);
    const scopes = [
      { name: 'Cả năm', mode: 'COMPREHENSIVE', candidates: gradeCandidates },
      ...[1, 2].map((semester) => ({
        name: `Học kỳ ${semester}`,
        mode: 'COMPREHENSIVE',
        candidates: gradeCandidates.filter((question) => Number(question.semester) === semester)
      })),
      ...chapters.map((chapter) => ({
        name: `Chương ${chapter.id}`,
        mode: 'CHAPTER',
        candidates: gradeCandidates.filter(
          (question) => Number(question.chapter_id) === Number(chapter.id)
        )
      }))
    ];

    for (const scope of scopes.filter((item) => item.candidates.length > 0)) {
      for (const count of [15, 20]) {
        report.push(auditScope({
          grade,
          scope: scope.name,
          mode: scope.mode,
          candidates: scope.candidates,
          count,
          runs
        }));
      }
    }
  }
  return report;
}

async function main() {
  const { runs } = parseArguments();
  const connection = await db.testConnection();
  if (!connection.connected) throw new Error(`Không kết nối được database: ${connection.reason}`);
  const scopes = await buildAuditReport(runs);
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), readOnly: true, scopes }, null, 2));
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(`Audit bộ chọn câu hỏi thất bại: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(() => db.close());
}

module.exports = { parseArguments, auditScope, buildAuditSeed, buildAuditReport };
