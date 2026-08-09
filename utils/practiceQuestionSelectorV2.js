const crypto = require('node:crypto');
const {
  DEFAULT_SIMILARITY_THRESHOLD,
  areQuestionsNearDuplicate,
  countNearDuplicatePairs,
  normalizeQuestionTextForSimilarity
} = require('./questionSimilarity');

const SELECTION_VERSION = 'balanced-v4';
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

function allocateChapterQuotas(candidates, count, selectionHistory = {}, random = Math.random) {
  const normalizedCandidates = normalizeCandidates(candidates);
  const targetCount = Math.min(normalizeCount(count), normalizedCandidates.length);
  const history = normalizeSelectionHistory(selectionHistory);
  const chapters = [...groupBy(normalizedCandidates, 'chapter_id').entries()].map(([chapterId, questions]) => {
    const lessonIds = [...new Set(questions.map((question) => question.lesson_id))];
    const lessonHistory = lessonIds.map((lessonId) => getHistoryEntry(history.lessons, lessonId));
    return {
      id: chapterId,
      lessonCount: lessonIds.length,
      availableCount: questions.length,
      historyCount: lessonHistory.reduce((sum, entry) => sum + entry.count, 0),
      lastSelectedAt: Math.max(...lessonHistory.map((entry) => entry.lastSelectedAt)),
      sortOrder: Math.min(...questions.map((question) => question.chapter_sort_order)),
      randomOrder: random(),
      quota: 0
    };
  });
  const totalLessons = chapters.reduce((sum, chapter) => sum + chapter.lessonCount, 0);
  const totalHistory = chapters.reduce((sum, chapter) => sum + chapter.historyCount, 0);
  for (const chapter of chapters) {
    chapter.expectedCount = (totalHistory + targetCount) * chapter.lessonCount / Math.max(totalLessons, 1);
  }

  if (targetCount >= chapters.length) {
    for (const chapter of chapters) chapter.quota = 1;
  }

  // Phân từng câu còn lại cho chương đang thiếu bao phủ nhất so với số bài.
  let remaining = targetCount - chapters.reduce((sum, chapter) => sum + chapter.quota, 0);
  while (remaining > 0) {
    const chapter = chapters
      .filter((item) => item.quota < item.availableCount)
      .sort(compareChapterCoverage)[0];
    if (!chapter) break;
    chapter.quota += 1;
    remaining -= 1;
  }

  return Object.fromEntries(chapters.map((chapter) => [chapter.id, chapter.quota]));
}

function compareChapterCoverage(left, right) {
  const leftDeficit = left.expectedCount - left.historyCount - left.quota;
  const rightDeficit = right.expectedCount - right.historyCount - right.quota;
  if (leftDeficit !== rightDeficit) return rightDeficit - leftDeficit;
  if (left.lessonCount !== right.lessonCount) return right.lessonCount - left.lessonCount;
  if (left.lastSelectedAt !== right.lastSelectedAt) return left.lastSelectedAt - right.lastSelectedAt;
  if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
  return left.randomOrder - right.randomOrder;
}

function buildLessonGroups(candidates, chapterQuotas, selectionHistory = {}, random = Math.random) {
  const normalizedCandidates = normalizeCandidates(candidates);
  const history = normalizeSelectionHistory(selectionHistory);
  const groups = [];
  for (const [chapterId, questions] of groupBy(normalizedCandidates, 'chapter_id')) {
    let remaining = Math.min(
      Math.max(0, Number(chapterQuotas?.[chapterId]) || 0),
      questions.length
    );
    const lessons = [...groupBy(questions, 'lesson_id').entries()].map(([lessonId, lessonQuestions]) => {
      const lessonHistory = getHistoryEntry(history.lessons, lessonId);
      return {
        id: lessonId,
        historyCount: lessonHistory.count,
        lastSelectedAt: lessonHistory.lastSelectedAt,
        sortOrder: Math.min(...lessonQuestions.map((question) => question.lesson_sort_order)),
        availableCount: lessonQuestions.length,
        assignedCount: 0,
        randomOrder: random()
      };
    });
    const tiers = [...groupBy(lessons, 'historyCount').entries()]
      .sort(([left], [right]) => Number(left) - Number(right));

    for (const [, tierLessons] of tiers) {
      if (remaining <= 0) break;
      const ordered = [...tierLessons].sort(compareLessonOrder);
      if (remaining < ordered.length) {
        for (const lessonGroup of partitionContiguous(ordered, remaining)) {
          groups.push({ chapterId, lessonIds: lessonGroup.map((lesson) => lesson.id) });
          for (const lesson of lessonGroup) lesson.assignedCount += 1;
        }
        remaining = 0;
        break;
      }
      for (const lesson of ordered) {
        groups.push({ chapterId, lessonIds: [lesson.id] });
        lesson.assignedCount += 1;
        remaining -= 1;
      }
    }

    // Khi số câu nhiều hơn số bài, cấp thêm lần lượt cho bài đang ít xuất hiện nhất.
    while (remaining > 0) {
      const lesson = lessons
        .filter((item) => item.assignedCount < item.availableCount)
        .sort(compareAdditionalLessonSlot)[0];
      if (!lesson) break;
      groups.push({ chapterId, lessonIds: [lesson.id] });
      lesson.assignedCount += 1;
      remaining -= 1;
    }
  }
  return groups;
}

function compareLessonOrder(left, right) {
  if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
  if (left.lastSelectedAt !== right.lastSelectedAt) return left.lastSelectedAt - right.lastSelectedAt;
  return left.randomOrder - right.randomOrder;
}

function compareAdditionalLessonSlot(left, right) {
  const leftCoverage = left.historyCount + left.assignedCount;
  const rightCoverage = right.historyCount + right.assignedCount;
  if (leftCoverage !== rightCoverage) return leftCoverage - rightCoverage;
  if (left.lastSelectedAt !== right.lastSelectedAt) return left.lastSelectedAt - right.lastSelectedAt;
  return compareLessonOrder(left, right);
}

function partitionContiguous(items, groupCount) {
  if (groupCount <= 0) return [];
  return Array.from({ length: groupCount }, (_, index) => {
    const start = Math.floor(index * items.length / groupCount);
    const end = Math.floor((index + 1) * items.length / groupCount);
    return items.slice(start, end);
  }).filter((group) => group.length > 0);
}

function selectQuestionsV2(candidates, options = {}) {
  const count = normalizeCount(options.count);
  const mode = normalizeMode(options.mode);
  const seed = normalizeSeed(options.seed || createSelectionSeed());
  const random = options.random || createSeededRandom(seed);
  const selectionHistory = normalizeSelectionHistory(options.selectionHistory);
  const recentIds = new Set([
    ...toIdSet(options.recentIds),
    ...recentQuestionIdsFromHistory(selectionHistory, options.recentLimit)
  ]);
  const reviewIds = toIdSet(options.reviewIds);
  const weakLessonIds = toIdSet(options.weakLessonIds);
  const normalizedCandidates = normalizeCandidates(candidates);
  const targets = normalizeDifficultyTargets(
    options.difficultyTargets || DIFFICULTY_TARGETS[count] || buildRatioTargets(count),
    count
  );
  const maxPerLesson = normalizePositiveInteger(options.maxPerLesson, 2);
  const maxPerConcept = normalizePositiveInteger(options.maxPerConcept, 2);
  const similarityThreshold = normalizeSimilarityThreshold(options.similarityThreshold);
  const chapterQuotas = allocateChapterQuotas(
    normalizedCandidates,
    count,
    options.selectionHistory,
    random
  );
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
    { name: 'STRICT', pool: freshPool, enforceDifficulty: true, enforceSimilarity: true, lessonCap: maxPerLesson, conceptCap: maxPerConcept },
    { name: 'RECENT_REUSED', pool: basePool, enforceDifficulty: true, enforceSimilarity: true, lessonCap: maxPerLesson, conceptCap: maxPerConcept },
    { name: 'REVIEW_REUSED', pool: normalizedCandidates, enforceDifficulty: true, enforceSimilarity: true, lessonCap: maxPerLesson, conceptCap: maxPerConcept },
    { name: 'DIFFICULTY_RELAXED', pool: normalizedCandidates, enforceDifficulty: false, enforceSimilarity: true, lessonCap: maxPerLesson, conceptCap: maxPerConcept },
    { name: 'CONCEPT_CAP_RELAXED', pool: normalizedCandidates, enforceDifficulty: false, enforceSimilarity: true, lessonCap: maxPerLesson, conceptCap: Number.POSITIVE_INFINITY },
    { name: 'LESSON_CAP_RELAXED', pool: normalizedCandidates, enforceDifficulty: false, enforceSimilarity: true, lessonCap: Number.POSITIVE_INFINITY, conceptCap: Number.POSITIVE_INFINITY },
    { name: 'SIMILARITY_RELAXED', pool: normalizedCandidates, enforceDifficulty: false, enforceSimilarity: false, lessonCap: Number.POSITIVE_INFINITY, conceptCap: Number.POSITIVE_INFINITY }
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
      enforceSimilarity: phase.enforceSimilarity,
      similarityThreshold,
      lessonCap: phase.lessonCap,
      conceptCap: phase.conceptCap,
      chapterQuotas,
      selectionHistory,
      random
    });
    if (result.selected.length >= Math.min(count, normalizedCandidates.length)) break;
  }

  const selected = result.selected.slice(0, count).map(({
    randomOrder,
    similarity_text: similarityText,
    ...question
  }) => question);
  const actualDifficulty = countByDifficulty(selected);
  const chapterCounts = countBy(selected, 'chapter_id');
  const lessonCounts = countBy(selected, 'lesson_id');
  const taggedQuestions = selected.filter((question) => question.concept_id);
  const conceptCounts = countBy(taggedQuestions, 'concept_id');
  const fallbackReasons = fallbackReasonsForPhase(
    phases[Math.min(phaseIndex, phases.length - 1)]?.name,
    {
      recentIds,
      reviewIds,
      hasTaggedConcepts: normalizedCandidates.some((question) => question.concept_id)
    }
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
        chapterTargets: chapterQuotas,
        actualChapters: Object.fromEntries(chapterCounts),
        coveredChapters: new Set(selected.map((item) => item.chapter_id)).size,
        coveredLessons: lessonCounts.size,
        maxQuestionsPerLesson: lessonCounts.size > 0 ? Math.max(...lessonCounts.values()) : 0,
        coveredConcepts: conceptCounts.size,
        taggedQuestions: taggedQuestions.length,
        maxQuestionsPerConcept: conceptCounts.size > 0 ? Math.max(...conceptCounts.values()) : 0,
        nearDuplicatePairs: countNearDuplicatePairs(selected, similarityThreshold),
        similarityThreshold,
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
  const conceptCounts = new Map();
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
      if ((chapterCounts.get(question.chapter_id) || 0) >= (options.chapterQuotas[question.chapter_id] || 0)) {
        return false;
      }
      if ((lessonCounts.get(question.lesson_id) || 0) >= options.lessonCap) return false;
      if (
        question.concept_id
        && (conceptCounts.get(question.concept_id) || 0) >= options.conceptCap
      ) return false;
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
      conceptCounts,
      difficultyCounts,
      targets: options.targets,
      chapterQuotas: options.chapterQuotas,
      enforceDifficulty: options.enforceDifficulty,
      weakLessonIds: options.weakLessonIds,
      weakStillNeeded,
      selectionHistory: options.selectionHistory
    }));
    const chosen = options.enforceSimilarity
      ? eligible.find((question) => !selected.some((selectedQuestion) => (
        areQuestionsNearDuplicate(question, selectedQuestion, options.similarityThreshold)
      )))
      : eligible[0];
    if (!chosen) break;
    selected.push(chosen);
    selectedIds.add(chosen.id);
    chapterCounts.set(chosen.chapter_id, (chapterCounts.get(chosen.chapter_id) || 0) + 1);
    lessonCounts.set(chosen.lesson_id, (lessonCounts.get(chosen.lesson_id) || 0) + 1);
    if (chosen.concept_id) {
      conceptCounts.set(chosen.concept_id, (conceptCounts.get(chosen.concept_id) || 0) + 1);
    }
    difficultyCounts[chosen.difficulty] += 1;
  }

  return {
    selected: randomize(selected, options.random),
    maxLessonCount: lessonCounts.size > 0 ? Math.max(...lessonCounts.values()) : 0
  };
}

function compareCandidates(left, right, context) {
  const leftLessonHistory = getHistoryEntry(context.selectionHistory.lessons, left.lesson_id);
  const rightLessonHistory = getHistoryEntry(context.selectionHistory.lessons, right.lesson_id);
  if (leftLessonHistory.count !== rightLessonHistory.count) {
    return leftLessonHistory.count - rightLessonHistory.count;
  }
  if (leftLessonHistory.lastSelectedAt !== rightLessonHistory.lastSelectedAt) {
    return leftLessonHistory.lastSelectedAt - rightLessonHistory.lastSelectedAt;
  }

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

  const chapterDifference = (
    context.chapterQuotas[right.chapter_id] - (context.chapterCounts.get(right.chapter_id) || 0)
  ) - (
    context.chapterQuotas[left.chapter_id] - (context.chapterCounts.get(left.chapter_id) || 0)
  );
  if (chapterDifference !== 0) return chapterDifference;

  const leftConceptCount = left.concept_id
    ? context.conceptCounts.get(left.concept_id) || 0
    : Number.POSITIVE_INFINITY;
  const rightConceptCount = right.concept_id
    ? context.conceptCounts.get(right.concept_id) || 0
    : Number.POSITIVE_INFINITY;
  if (leftConceptCount !== rightConceptCount) return leftConceptCount - rightConceptCount;

  const lessonDifference = (context.lessonCounts.get(left.lesson_id) || 0)
    - (context.lessonCounts.get(right.lesson_id) || 0);
  if (lessonDifference !== 0) return lessonDifference;

  const leftQuestionHistory = getHistoryEntry(context.selectionHistory.questions, left.id);
  const rightQuestionHistory = getHistoryEntry(context.selectionHistory.questions, right.id);
  if (leftQuestionHistory.count !== rightQuestionHistory.count) {
    return leftQuestionHistory.count - rightQuestionHistory.count;
  }
  if (leftQuestionHistory.lastSelectedAt !== rightQuestionHistory.lastSelectedAt) {
    return leftQuestionHistory.lastSelectedAt - rightQuestionHistory.lastSelectedAt;
  }
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
      chapter_sort_order: normalizeSortOrder(item.chapter_sort_order, chapterId),
      lesson_sort_order: normalizeSortOrder(item.lesson_sort_order, lessonId),
      concept_id: normalizeOptionalId(item.concept_id),
      difficulty: normalizeDifficulty(item.difficulty),
      similarity_text: normalizeQuestionTextForSimilarity(
        item.content_text ?? item.content?.text ?? (typeof item.content === 'string' ? item.content : '')
      )
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

function fallbackReasonsForPhase(phaseName, { recentIds, reviewIds, hasTaggedConcepts }) {
  const reasons = [];
  const order = [
    'STRICT',
    'RECENT_REUSED',
    'REVIEW_REUSED',
    'DIFFICULTY_RELAXED',
    'CONCEPT_CAP_RELAXED',
    'LESSON_CAP_RELAXED',
    'SIMILARITY_RELAXED'
  ];
  const phasePosition = order.indexOf(phaseName);
  if (phasePosition <= 0) return reasons;
  if (phasePosition >= 1 && recentIds.size > 0) reasons.push('RECENT_REUSED');
  if (phasePosition >= 2 && reviewIds.size > 0) reasons.push('REVIEW_REUSED');
  if (phasePosition >= 3) reasons.push('DIFFICULTY_RELAXED');
  if (phasePosition >= 4 && hasTaggedConcepts) reasons.push('CONCEPT_CAP_RELAXED');
  if (phasePosition >= 5) reasons.push('LESSON_CAP_RELAXED');
  if (phasePosition >= 6) reasons.push('SIMILARITY_RELAXED');
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

function groupBy(items, field) {
  return items.reduce((result, item) => {
    const key = item[field];
    if (!result.has(key)) result.set(key, []);
    result.get(key).push(item);
    return result;
  }, new Map());
}

function normalizeSelectionHistory(value = {}) {
  return {
    questions: normalizeHistoryEntries(value.questions),
    lessons: normalizeHistoryEntries(value.lessons)
  };
}

function normalizeHistoryEntries(entries) {
  return new Map(Object.entries(entries || {}).map(([id, entry]) => [
    Number(id),
    {
      count: Math.max(0, Number(entry?.count) || 0),
      lastSelectedAt: normalizeTimestamp(entry?.lastSelectedAt)
    }
  ]).filter(([id]) => Number.isInteger(id) && id > 0));
}

function getHistoryEntry(entries, id) {
  return entries.get(Number(id)) || { count: 0, lastSelectedAt: Number.NEGATIVE_INFINITY };
}

function recentQuestionIdsFromHistory(history, limit) {
  const safeLimit = Math.max(0, Number(limit) || 0);
  if (safeLimit === 0) return [];
  return [...history.questions.entries()]
    .filter(([, entry]) => Number.isFinite(entry.lastSelectedAt))
    .sort((left, right) => right[1].lastSelectedAt - left[1].lastSelectedAt)
    .slice(0, safeLimit)
    .map(([questionId]) => questionId);
}

function normalizeTimestamp(value) {
  const timestamp = Date.parse(String(value || ''));
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
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

function normalizeSimilarityThreshold(value) {
  const threshold = Number(value);
  return Number.isFinite(threshold) && threshold >= 0.75 && threshold <= 1
    ? threshold
    : DEFAULT_SIMILARITY_THRESHOLD;
}

function normalizeOptionalId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeSortOrder(value, fallback) {
  const order = Number(value);
  return Number.isFinite(order) ? order : Number(fallback);
}

module.exports = {
  DIFFICULTY_TARGETS,
  SELECTION_VERSION,
  allocateChapterQuotas,
  buildLessonGroups,
  createSeededRandom,
  createSelectionSeed,
  selectQuestionsV2
};
