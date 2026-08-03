const crypto = require('node:crypto');

const SELECTION_VERSION = 'balanced-v2';
const DIFFICULTIES = Object.freeze(['EASY', 'MEDIUM', 'HARD']);
const DIFFICULTY_TARGETS = Object.freeze({
  5: Object.freeze({ EASY: 2, MEDIUM: 2, HARD: 1 }),
  8: Object.freeze({ EASY: 4, MEDIUM: 3, HARD: 1 }),
  15: Object.freeze({ EASY: 7, MEDIUM: 6, HARD: 2 }),
  20: Object.freeze({ EASY: 9, MEDIUM: 8, HARD: 3 })
});

function createSelectionSeed() {
  return crypto.randomBytes(8).toString('hex');
}

function createSeededRandom(seed) {
  const normalized = normalizeSeed(seed);
  let state = (
    Number.parseInt(normalized.slice(0, 8), 16)
    ^ Number.parseInt(normalized.slice(8), 16)
  ) >>> 0;
  if (state === 0) state = 0x9e3779b9;
  return function random() {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

function selectQuestionsV2(candidates, options = {}) {
  const count = normalizeCount(options.count);
  const mode = normalizeMode(options.mode);
  const seed = normalizeSeed(options.seed || createSelectionSeed());
  const random = options.random || createSeededRandom(seed);
  const recentIds = toIdSet(options.recentIds);
  const reviewIds = toIdSet(options.reviewIds);
  const weakLessonIds = toIdSet(options.weakLessonIds);
  const normalizedCandidates = normalizeCandidates(candidates);
  const targets = normalizeDifficultyTargets(
    options.difficultyTargets || DIFFICULTY_TARGETS[count] || buildRatioTargets(count),
    count
  );
  const maxPerLesson = normalizePositiveInteger(options.maxPerLesson, 2);
  const requestedWeakTarget = ['CHAPTER', 'COMPREHENSIVE'].includes(mode)
    ? Math.min(count, Math.round(count * normalizeRatio(options.personalizationRatio, 0.3)))
    : 0;
  const weakCandidateCount = normalizedCandidates.filter(
    (question) => weakLessonIds.has(question.lesson_id)
  ).length;
  const weakTarget = Math.min(
    requestedWeakTarget,
    weakCandidateCount,
    weakLessonIds.size * maxPerLesson
  );

  const basePool = normalizedCandidates.filter((question) => !reviewIds.has(question.id));
  const freshPool = basePool.filter((question) => !recentIds.has(question.id));
  const phases = [
    { name: 'STRICT', pool: freshPool, enforceDifficulty: true, lessonCap: maxPerLesson },
    { name: 'RECENT_REUSED', pool: basePool, enforceDifficulty: true, lessonCap: maxPerLesson },
    { name: 'REVIEW_REUSED', pool: normalizedCandidates, enforceDifficulty: true, lessonCap: maxPerLesson },
    { name: 'DIFFICULTY_RELAXED', pool: normalizedCandidates, enforceDifficulty: false, lessonCap: maxPerLesson },
    { name: 'LESSON_CAP_RELAXED', pool: normalizedCandidates, enforceDifficulty: false, lessonCap: Number.POSITIVE_INFINITY }
  ];

  let result = { selected: [], maxLessonCount: 0 };
  let phaseIndex = 0;
  for (; phaseIndex < phases.length; phaseIndex += 1) {
    const phase = phases[phaseIndex];
    if (phase.name === 'RECENT_REUSED' && recentIds.size === 0) continue;
    if (phase.name === 'REVIEW_REUSED' && reviewIds.size === 0) continue;
    result = attemptSelection(phase.pool, {
      count,
      targets,
      weakLessonIds,
      weakTarget,
      enforceDifficulty: phase.enforceDifficulty,
      lessonCap: phase.lessonCap,
      random
    });
    if (result.selected.length >= Math.min(count, normalizedCandidates.length)) break;
  }

  const selected = result.selected.slice(0, count).map(({ randomOrder, ...question }) => question);
  const actualDifficulty = countByDifficulty(selected);
  const lessonCounts = countBy(selected, 'lesson_id');
  const fallbackReasons = fallbackReasonsForPhase(
    phases[Math.min(phaseIndex, phases.length - 1)]?.name,
    { recentIds, reviewIds }
  );

  return {
    questions: selected,
    selection: {
      version: SELECTION_VERSION,
      seed,
      metadata: {
        mode,
        requestedCount: count,
        selectedCount: selected.length,
        difficultyTargets: targets,
        actualDifficulty,
        coveredChapters: new Set(selected.map((item) => item.chapter_id)).size,
        coveredLessons: lessonCounts.size,
        maxQuestionsPerLesson: lessonCounts.size > 0 ? Math.max(...lessonCounts.values()) : 0,
        weakTarget,
        weakSelected: selected.filter((item) => weakLessonIds.has(item.lesson_id)).length,
        recentExcluded: normalizedCandidates.filter((item) => recentIds.has(item.id)).length,
        reviewExcluded: normalizedCandidates.filter((item) => reviewIds.has(item.id)).length,
        fallbackReasons
      }
    }
  };
}

function attemptSelection(pool, options) {
  const available = randomize(pool, options.random);
  const chapterCounts = new Map();
  const lessonCounts = new Map();
  const difficultyCounts = { EASY: 0, MEDIUM: 0, HARD: 0 };
  const selected = [];
  const selectedIds = new Set();
  const chapters = new Set(available.map((item) => item.chapter_id));
  const requireChapterCoverage = chapters.size > 1 && options.count >= chapters.size;

  while (selected.length < options.count) {
    const remainingSlots = options.count - selected.length;
    const uncoveredChapters = requireChapterCoverage
      ? new Set([...chapters].filter((chapterId) => !chapterCounts.has(chapterId)))
      : new Set();
    const weakSelected = selected.filter((item) => options.weakLessonIds.has(item.lesson_id)).length;
    const weakStillNeeded = Math.max(0, options.weakTarget - weakSelected);

    let eligible = available.filter((question) => {
      if (selectedIds.has(question.id)) return false;
      if ((lessonCounts.get(question.lesson_id) || 0) >= options.lessonCap) return false;
      if (
        options.enforceDifficulty
        && difficultyCounts[question.difficulty] >= options.targets[question.difficulty]
      ) return false;
      if (uncoveredChapters.size >= remainingSlots && !uncoveredChapters.has(question.chapter_id)) {
        return false;
      }
      if (weakStillNeeded >= remainingSlots && !options.weakLessonIds.has(question.lesson_id)) {
        return false;
      }
      return true;
    });
    if (eligible.length === 0) break;

    eligible = eligible.sort((left, right) => compareCandidates(left, right, {
      chapterCounts,
      lessonCounts,
      difficultyCounts,
      targets: options.targets,
      enforceDifficulty: options.enforceDifficulty,
      weakLessonIds: options.weakLessonIds,
      weakStillNeeded
    }));
    const chosen = eligible[0];
    selected.push(chosen);
    selectedIds.add(chosen.id);
    chapterCounts.set(chosen.chapter_id, (chapterCounts.get(chosen.chapter_id) || 0) + 1);
    lessonCounts.set(chosen.lesson_id, (lessonCounts.get(chosen.lesson_id) || 0) + 1);
    difficultyCounts[chosen.difficulty] += 1;
  }

  return {
    selected: randomize(selected, options.random),
    maxLessonCount: lessonCounts.size > 0 ? Math.max(...lessonCounts.values()) : 0
  };
}

function compareCandidates(left, right, context) {
  const leftWeak = context.weakLessonIds.has(left.lesson_id) ? 0 : 1;
  const rightWeak = context.weakLessonIds.has(right.lesson_id) ? 0 : 1;
  if (context.weakStillNeeded > 0 && leftWeak !== rightWeak) return leftWeak - rightWeak;

  if (context.enforceDifficulty && left.difficulty !== right.difficulty) {
    const leftRemaining = context.targets[left.difficulty]
      - context.difficultyCounts[left.difficulty];
    const rightRemaining = context.targets[right.difficulty]
      - context.difficultyCounts[right.difficulty];
    if (leftRemaining !== rightRemaining) return leftRemaining - rightRemaining;
  }

  const chapterDifference = (context.chapterCounts.get(left.chapter_id) || 0)
    - (context.chapterCounts.get(right.chapter_id) || 0);
  if (chapterDifference !== 0) return chapterDifference;

  const lessonDifference = (context.lessonCounts.get(left.lesson_id) || 0)
    - (context.lessonCounts.get(right.lesson_id) || 0);
  if (lessonDifference !== 0) return lessonDifference;
  return left.randomOrder - right.randomOrder;
}

function normalizeCandidates(candidates) {
  const seen = new Set();
  return (Array.isArray(candidates) ? candidates : []).reduce((result, item) => {
    const id = Number(item?.id);
    const lessonId = Number(item?.lesson_id);
    const chapterId = Number(item?.chapter_id);
    if (!id || !lessonId || !chapterId || seen.has(id)) return result;
    seen.add(id);
    result.push({
      ...item,
      id,
      lesson_id: lessonId,
      chapter_id: chapterId,
      difficulty: normalizeDifficulty(item.difficulty)
    });
    return result;
  }, []);
}

function normalizeDifficulty(value) {
  const difficulty = String(value || 'EASY').trim().toUpperCase();
  if (difficulty === 'EXPERT') return 'HARD';
  return DIFFICULTIES.includes(difficulty) ? difficulty : 'EASY';
}

function normalizeDifficultyTargets(targets, count) {
  const normalized = Object.fromEntries(
    DIFFICULTIES.map((difficulty) => [difficulty, Math.max(0, Math.floor(Number(targets?.[difficulty]) || 0))])
  );
  let remaining = count - Object.values(normalized).reduce((sum, value) => sum + value, 0);
  for (const difficulty of DIFFICULTIES) {
    if (remaining <= 0) break;
    normalized[difficulty] += 1;
    remaining -= 1;
  }
  while (remaining < 0) {
    const difficulty = [...DIFFICULTIES].reverse().find((item) => normalized[item] > 0);
    if (!difficulty) break;
    normalized[difficulty] -= 1;
    remaining += 1;
  }
  return normalized;
}

function buildRatioTargets(count) {
  const easy = Math.round(count * 0.45);
  const medium = Math.round(count * 0.4);
  return { EASY: easy, MEDIUM: medium, HARD: Math.max(0, count - easy - medium) };
}

function fallbackReasonsForPhase(phaseName, { recentIds, reviewIds }) {
  const reasons = [];
  const order = ['RECENT_REUSED', 'REVIEW_REUSED', 'DIFFICULTY_RELAXED', 'LESSON_CAP_RELAXED'];
  const phasePosition = order.indexOf(phaseName);
  if (phasePosition < 0) return reasons;
  if (phasePosition >= 0 && recentIds.size > 0) reasons.push('RECENT_REUSED');
  if (phasePosition >= 1 && reviewIds.size > 0) reasons.push('REVIEW_REUSED');
  if (phasePosition >= 2) reasons.push('DIFFICULTY_RELAXED');
  if (phasePosition >= 3) reasons.push('LESSON_CAP_RELAXED');
  return reasons;
}

function randomize(items, random) {
  return items
    .map((item) => ({ ...item, randomOrder: random() }))
    .sort((left, right) => left.randomOrder - right.randomOrder);
}

function countBy(items, field) {
  return items.reduce((result, item) => {
    result.set(item[field], (result.get(item[field]) || 0) + 1);
    return result;
  }, new Map());
}

function countByDifficulty(items) {
  return items.reduce((result, item) => {
    result[item.difficulty] = (result[item.difficulty] || 0) + 1;
    return result;
  }, { EASY: 0, MEDIUM: 0, HARD: 0 });
}

function toIdSet(values) {
  return new Set((Array.isArray(values) ? values : []).map(Number).filter(Boolean));
}

function normalizeSeed(value) {
  const seed = String(value || '').trim().toLowerCase();
  if (/^[a-f0-9]{16}$/.test(seed)) return seed;
  return crypto.createHash('sha256').update(seed || 'balanced-v2').digest('hex').slice(0, 16);
}

function normalizeMode(value) {
  const mode = String(value || 'COMPREHENSIVE').trim().toUpperCase();
  return ['REVIEW', 'LESSON', 'CHAPTER', 'COMPREHENSIVE'].includes(mode)
    ? mode
    : 'COMPREHENSIVE';
}

function normalizeCount(value) {
  const count = Number(value);
  return Number.isInteger(count) && count > 0 ? count : 0;
}

function normalizePositiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function normalizeRatio(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1 ? number : fallback;
}

module.exports = {
  DIFFICULTY_TARGETS,
  SELECTION_VERSION,
  createSeededRandom,
  createSelectionSeed,
  selectQuestionsV2
};
