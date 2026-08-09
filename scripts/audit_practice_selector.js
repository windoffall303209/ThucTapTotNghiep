/* eslint-disable no-console */
require('dotenv').config({ quiet: true });

const db = require('../config/db');
const Curriculum = require('../models/Curriculum');
const Question = require('../models/Question');
const { MIN_GRADE, MAX_GRADE } = require('../config/grades');
const { selectQuestionsV2 } = require('../utils/practiceQuestionSelectorV2');

function parseArguments(argv = process.argv.slice(2)) {
  const runsFlag = argv.find((arg) => arg.startsWith('--runs='));
  const difficultyFlag = argv.find((arg) => arg.startsWith('--max-difficulty-fallback-rate='));
  const similarityFlag = argv.find((arg) => arg.startsWith('--max-similarity-fallback-rate='));
  const supportedPrefixes = [
    '--runs=',
    '--max-difficulty-fallback-rate=',
    '--max-similarity-fallback-rate='
  ];
  const unknown = argv.filter((arg) => (
    arg !== '--fail-on-warning'
    && !supportedPrefixes.some((prefix) => arg.startsWith(prefix))
  ));
  if (unknown.length > 0) throw new Error(`Tham số không được hỗ trợ: ${unknown.join(', ')}`);
  const runs = Number(runsFlag?.slice('--runs='.length) || 25);
  if (!Number.isInteger(runs) || runs < 1 || runs > 500) {
    throw new Error('--runs phải là số nguyên từ 1 đến 500.');
  }
  return {
    runs,
    failOnWarning: argv.includes('--fail-on-warning'),
    thresholds: {
      difficultyFallbackRate: parseRate(difficultyFlag, '--max-difficulty-fallback-rate=', 0.25),
      similarityFallbackRate: parseRate(similarityFlag, '--max-similarity-fallback-rate=', 0.05)
    }
  };
}

function auditScope({ grade, scope, mode, candidates, count, runs }) {
  const poolIds = new Set(candidates.map((question) => Number(question.id)));
  const usedIds = new Set();
  const totals = {
    generated: 0,
    incomplete: 0,
    duplicateQuestionIds: 0,
    nearDuplicatePairs: 0,
    outOfScopeQuestionIds: 0,
    chapterQuotaMismatches: 0,
    sequenceConflicts: { chapter: 0, lesson: 0, difficulty: 0 },
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
    totals.nearDuplicatePairs += Number(result.selection.metadata.nearDuplicatePairs || 0);
    totals.outOfScopeQuestionIds += ids.filter((id) => !poolIds.has(id)).length;
    if (!sameNumberRecord(
      result.selection.metadata.chapterTargets,
      result.selection.metadata.actualChapters
    )) totals.chapterQuotaMismatches += 1;
    for (const field of Object.keys(totals.sequenceConflicts)) {
      totals.sequenceConflicts[field] += Number(
        result.selection.metadata.sequenceConflicts?.[field] || 0
      );
    }
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
    nearDuplicatePairs: totals.nearDuplicatePairs,
    outOfScopeQuestionIds: totals.outOfScopeQuestionIds,
    chapterQuotaMismatches: totals.chapterQuotaMismatches,
    sequenceConflicts: totals.sequenceConflicts,
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

function evaluateAuditGate(scopes = [], thresholds = {}) {
  const totalRuns = scopes.reduce((sum, scope) => sum + Number(scope.runs || 0), 0);
  const totals = scopes.reduce((summary, scope) => {
    summary.incompleteRuns += Number(scope.incompleteRuns || 0);
    summary.duplicateQuestionIds += Number(scope.duplicateQuestionIds || 0);
    summary.nearDuplicatePairs += Number(scope.nearDuplicatePairs || 0);
    summary.outOfScopeQuestionIds += Number(scope.outOfScopeQuestionIds || 0);
    summary.chapterQuotaMismatches += Number(scope.chapterQuotaMismatches || 0);
    for (const [reason, count] of Object.entries(scope.fallbackReasons || {})) {
      summary.fallbackReasons[reason] = (summary.fallbackReasons[reason] || 0) + Number(count || 0);
    }
    return summary;
  }, {
    incompleteRuns: 0,
    duplicateQuestionIds: 0,
    nearDuplicatePairs: 0,
    outOfScopeQuestionIds: 0,
    chapterQuotaMismatches: 0,
    fallbackReasons: {}
  });
  const violations = [];
  if (totals.incompleteRuns > 0) violations.push({ code: 'INCOMPLETE_EXAMS', count: totals.incompleteRuns });
  if (totals.duplicateQuestionIds > 0) {
    violations.push({ code: 'DUPLICATE_QUESTION_IDS', count: totals.duplicateQuestionIds });
  }
  if (totals.outOfScopeQuestionIds > 0) {
    violations.push({ code: 'OUT_OF_SCOPE_QUESTION_IDS', count: totals.outOfScopeQuestionIds });
  }
  if (totals.chapterQuotaMismatches > 0) {
    violations.push({ code: 'CHAPTER_QUOTA_MISMATCHES', count: totals.chapterQuotaMismatches });
  }

  const rates = {
    difficultyFallbackRate: fallbackRate(totals, 'DIFFICULTY_RELAXED', totalRuns),
    similarityFallbackRate: fallbackRate(totals, 'SIMILARITY_RELAXED', totalRuns)
  };
  const normalizedThresholds = {
    difficultyFallbackRate: validRate(thresholds.difficultyFallbackRate, 0.25),
    similarityFallbackRate: validRate(thresholds.similarityFallbackRate, 0.05)
  };
  const warnings = [];
  const warningCodes = {
    difficultyFallbackRate: 'HIGH_DIFFICULTY_FALLBACK_RATE',
    similarityFallbackRate: 'HIGH_SIMILARITY_FALLBACK_RATE'
  };
  for (const [metric, rate] of Object.entries(rates)) {
    if (rate > normalizedThresholds[metric]) {
      warnings.push({
        code: warningCodes[metric],
        actualRate: rate,
        maximumRate: normalizedThresholds[metric]
      });
    }
  }
  if (totals.nearDuplicatePairs > 0) {
    warnings.push({
      code: 'NEAR_DUPLICATE_PAIRS_SELECTED',
      count: totals.nearDuplicatePairs
    });
  }

  return {
    status: violations.length > 0 ? 'FAIL' : warnings.length > 0 ? 'WARN' : 'PASS',
    totalRuns,
    totals,
    rates,
    thresholds: normalizedThresholds,
    violations,
    warnings
  };
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
  const { runs, failOnWarning, thresholds } = parseArguments();
  const connection = await db.testConnection();
  if (!connection.connected) throw new Error(`Không kết nối được database: ${connection.reason}`);
  const scopes = await buildAuditReport(runs);
  const gate = evaluateAuditGate(scopes, thresholds);
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), readOnly: true, gate, scopes }, null, 2));
  if (gate.status === 'FAIL' || (failOnWarning && gate.status === 'WARN')) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(`Audit bộ chọn câu hỏi thất bại: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(() => db.close());
}

function parseRate(flag, prefix, fallback) {
  if (!flag) return fallback;
  const value = Number(flag.slice(prefix.length));
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${prefix.slice(0, -1)} phải nằm trong khoảng 0 đến 1.`);
  }
  return value;
}

function validRate(value, fallback) {
  return Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 1
    ? Number(value)
    : fallback;
}

function fallbackRate(totals, reason, totalRuns) {
  return totalRuns > 0
    ? Number((Number(totals.fallbackReasons[reason] || 0) / totalRuns).toFixed(4))
    : 0;
}

function sameNumberRecord(left = {}, right = {}) {
  const keys = new Set([...Object.keys(left || {}), ...Object.keys(right || {})]);
  return [...keys].every((key) => Number(left?.[key] || 0) === Number(right?.[key] || 0));
}

module.exports = {
  parseArguments,
  auditScope,
  buildAuditSeed,
  buildAuditReport,
  evaluateAuditGate
};
