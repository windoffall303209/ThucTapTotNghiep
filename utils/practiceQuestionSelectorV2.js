const crypto = require('node:crypto');
const {
  DEFAULT_SIMILARITY_THRESHOLD,
  areQuestionsNearDuplicate,
  countNearDuplicatePairs,
  normalizeQuestionTextForSimilarity
} = require('./questionSimilarity');

const SELECTION_VERSION = 'coverage-v5';
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

function buildDifficultySelectionPlan(
  candidates,
  lessonGroups,
  requestedTargets,
  selectionHistory = {},
  random = Math.random
) {
  const normalizedCandidates = normalizeCandidates(candidates).map((question) => ({
    ...question,
    selection_order: random()
  }));
  const history = normalizeSelectionHistory(selectionHistory);
  const targets = normalizeDifficultyTargets(requestedTargets, lessonGroups.length);
  const targetOptions = enumerateDifficultyTargets(targets, lessonGroups.length);
  for (const targetOption of targetOptions) {
    const result = matchQuestionsToGroups(
      normalizedCandidates,
      lessonGroups,
      targetOption,
      history
    );
    if (result.questions.length === lessonGroups.length) {
      return {
        ...result,
        difficultyTargets: targetOption,
        exact: DIFFICULTIES.every((difficulty) => targetOption[difficulty] === targets[difficulty])
      };
    }
  }
  return {
    questions: [],
    assignments: {},
    difficultyTargets: { EASY: 0, MEDIUM: 0, HARD: 0 },
    exact: false
  };
}

function matchQuestionsToGroups(candidates, lessonGroups, targets, history) {
  const graph = new Map();
  const source = 'SOURCE';
  const sink = 'SINK';
  const groupLessonSets = lessonGroups.map((group) => new Set(group.lessonIds.map(Number)));
  const hardHistoryByChapter = candidates
    .filter((question) => question.difficulty === 'HARD')
    .reduce((result, question) => {
      const count = getHistoryEntry(history.questions, question.id).count;
      result.set(question.chapter_id, (result.get(question.chapter_id) || 0) + count);
      return result;
    }, new Map());

  for (const difficulty of ['HARD', 'MEDIUM', 'EASY']) {
    addFlowEdge(graph, source, `DIFFICULTY:${difficulty}`, targets[difficulty]);
    const difficultyCandidates = orderDifficultyCandidates(
      candidates.filter((question) => question.difficulty === difficulty),
      difficulty,
      history,
      hardHistoryByChapter
    );
    for (const question of difficultyCandidates) {
      addFlowEdge(graph, `DIFFICULTY:${difficulty}`, `QUESTION:${question.id}`, 1);
    }
  }
  for (const question of candidates) {
    for (let groupIndex = 0; groupIndex < lessonGroups.length; groupIndex += 1) {
      if (!groupLessonSets[groupIndex].has(question.lesson_id)) continue;
      addFlowEdge(graph, `QUESTION:${question.id}`, `GROUP:${groupIndex}`, 1, {
        type: 'QUESTION_GROUP',
        questionId: question.id,
        groupIndex
      });
    }
  }
  for (let groupIndex = 0; groupIndex < lessonGroups.length; groupIndex += 1) {
    addFlowEdge(graph, `GROUP:${groupIndex}`, sink, 1);
  }

  const flow = calculateMaxFlow(graph, source, sink);
  if (flow !== lessonGroups.length) return { questions: [], assignments: {} };
  const questionById = new Map(candidates.map((question) => [question.id, question]));
  const selectedByGroup = {};
  const assignments = {};
  for (const edges of graph.values()) {
    for (const edge of edges) {
      if (edge.meta?.type !== 'QUESTION_GROUP' || edge.capacity !== 0) continue;
      const question = questionById.get(edge.meta.questionId);
      if (!question) continue;
      selectedByGroup[edge.meta.groupIndex] = question;
      assignments[edge.meta.groupIndex] = question.difficulty;
    }
  }
  return {
    questions: Object.keys(selectedByGroup)
      .map(Number)
      .sort((left, right) => left - right)
      .map((groupIndex) => selectedByGroup[groupIndex]),
    assignments
  };
}

function orderDifficultyCandidates(candidates, difficulty, history, hardHistoryByChapter) {
  const compareHistory = (left, right) => {
    const leftLesson = getHistoryEntry(history.lessons, left.lesson_id);
    const rightLesson = getHistoryEntry(history.lessons, right.lesson_id);
    if (leftLesson.count !== rightLesson.count) return leftLesson.count - rightLesson.count;
    if (leftLesson.lastSelectedAt !== rightLesson.lastSelectedAt) {
      return leftLesson.lastSelectedAt - rightLesson.lastSelectedAt;
    }
    const leftQuestion = getHistoryEntry(history.questions, left.id);
    const rightQuestion = getHistoryEntry(history.questions, right.id);
    if (leftQuestion.count !== rightQuestion.count) return leftQuestion.count - rightQuestion.count;
    if (leftQuestion.lastSelectedAt !== rightQuestion.lastSelectedAt) {
      return leftQuestion.lastSelectedAt - rightQuestion.lastSelectedAt;
    }
    return left.selection_order - right.selection_order;
  };
  if (difficulty !== 'HARD') return [...candidates].sort(compareHistory);

  const chapterQueues = [...groupBy(candidates, 'chapter_id').entries()]
    .map(([chapterId, questions]) => ({
      chapterId,
      historyCount: hardHistoryByChapter.get(chapterId) || 0,
      sortOrder: Math.min(...questions.map((question) => question.chapter_sort_order)),
      questions: [...questions].sort(compareHistory)
    }))
    .sort((left, right) => (
      left.historyCount - right.historyCount
      || left.sortOrder - right.sortOrder
    ));
  const ordered = [];
  while (chapterQueues.some((chapter) => chapter.questions.length > 0)) {
    for (const chapter of chapterQueues) {
      const question = chapter.questions.shift();
      if (question) ordered.push(question);
    }
  }
  return ordered;
}

function enumerateDifficultyTargets(targets, count) {
  const options = [];
  for (let hard = 0; hard <= count; hard += 1) {
    for (let medium = 0; medium <= count - hard; medium += 1) {
      const easy = count - hard - medium;
      const value = { EASY: easy, MEDIUM: medium, HARD: hard };
      options.push({ value, score: difficultyFallbackScore(value, targets) });
    }
  }
  return options
    .sort((left, right) => left.score - right.score)
    .map((option) => option.value);
}

function difficultyFallbackScore(actual, target) {
  const shortage = {
    EASY: Math.max(0, target.EASY - actual.EASY),
    MEDIUM: Math.max(0, target.MEDIUM - actual.MEDIUM),
    HARD: Math.max(0, target.HARD - actual.HARD)
  };
  const excess = {
    EASY: Math.max(0, actual.EASY - target.EASY),
    MEDIUM: Math.max(0, actual.MEDIUM - target.MEDIUM),
    HARD: Math.max(0, actual.HARD - target.HARD)
  };
  return shortage.HARD * 1000
    + shortage.MEDIUM * 100
    + shortage.EASY * 10
    + excess.HARD * 3
    + excess.EASY * 3
    + excess.MEDIUM;
}

function addFlowEdge(graph, from, to, capacity, meta = null) {
  if (!graph.has(from)) graph.set(from, []);
  if (!graph.has(to)) graph.set(to, []);
  const forward = { to, capacity, reverseIndex: graph.get(to).length, meta };
  const reverse = { to: from, capacity: 0, reverseIndex: graph.get(from).length, meta: null };
  graph.get(from).push(forward);
  graph.get(to).push(reverse);
}

function calculateMaxFlow(graph, source, sink) {
  let totalFlow = 0;
  while (true) {
    const parent = new Map([[source, null]]);
    const queue = [source];
    while (queue.length > 0 && !parent.has(sink)) {
      const node = queue.shift();
      const edges = graph.get(node) || [];
      for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex += 1) {
        const edge = edges[edgeIndex];
        if (edge.capacity <= 0 || parent.has(edge.to)) continue;
        parent.set(edge.to, { node, edgeIndex });
        queue.push(edge.to);
      }
    }
    if (!parent.has(sink)) return totalFlow;
    let node = sink;
    while (node !== source) {
      const step = parent.get(node);
      const edge = graph.get(step.node)[step.edgeIndex];
      edge.capacity -= 1;
      graph.get(node)[edge.reverseIndex].capacity += 1;
      node = step.node;
    }
    totalFlow += 1;
  }
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
  const normalizedCandidates = normalizeCandidates(candidates);
  const targetCount = Math.min(count, normalizedCandidates.length);
  const targets = normalizeDifficultyTargets(
    options.difficultyTargets || DIFFICULTY_TARGETS[targetCount] || buildRatioTargets(targetCount),
    targetCount
  );
  const maxPerConcept = normalizePositiveInteger(options.maxPerConcept, 2);
  const similarityThreshold = normalizeSimilarityThreshold(options.similarityThreshold);
  const chapterQuotas = allocateChapterQuotas(
    normalizedCandidates,
    targetCount,
    options.selectionHistory,
    random
  );
  const lessonGroups = buildLessonGroups(
    normalizedCandidates,
    chapterQuotas,
    options.selectionHistory,
    random
  );
  const basePool = normalizedCandidates.filter((question) => !reviewIds.has(question.id));
  const freshPool = basePool.filter((question) => !recentIds.has(question.id));
  const phases = [
    { name: 'STRICT', pool: freshPool },
    { name: 'RECENT_REUSED', pool: basePool },
    { name: 'REVIEW_REUSED', pool: normalizedCandidates }
  ];
  let selectedPhase = phases.at(-1);
  let plan = null;
  for (const requireExactDifficulty of [true, false]) {
    for (const phase of phases) {
      const candidatePlan = buildDifficultySelectionPlan(
        phase.pool,
        lessonGroups,
        targets,
        options.selectionHistory,
        random
      );
      if (candidatePlan.questions.length !== lessonGroups.length) continue;
      if (requireExactDifficulty && !candidatePlan.exact) continue;
      plan = candidatePlan;
      selectedPhase = phase;
      break;
    }
    if (plan) break;
  }

  const improved = improvePlannedQuestions(plan?.questions || [], {
    assignments: plan?.assignments || {},
    lessonGroups,
    pool: selectedPhase.pool,
    selectionHistory,
    maxPerConcept,
    similarityThreshold,
    random
  });
  const selected = improved.map(({
    randomOrder,
    selection_order: selectionOrder,
    similarity_text: similarityText,
    ...question
  }) => question);
  const actualDifficulty = countByDifficulty(selected);
  const chapterCounts = countBy(selected, 'chapter_id');
  const lessonCounts = countBy(selected, 'lesson_id');
  const taggedQuestions = selected.filter((question) => question.concept_id);
  const conceptCounts = countBy(taggedQuestions, 'concept_id');
  const fallbackReasons = [];
  if (selected.some((question) => recentIds.has(question.id))) fallbackReasons.push('RECENT_REUSED');
  if (selected.some((question) => reviewIds.has(question.id))) fallbackReasons.push('REVIEW_REUSED');
  if (plan && !plan.exact) fallbackReasons.push('DIFFICULTY_RELAXED');
  if (conceptCounts.size > 0 && Math.max(...conceptCounts.values()) > maxPerConcept) {
    fallbackReasons.push('CONCEPT_CAP_RELAXED');
  }
  if (countNearDuplicatePairs(selected, similarityThreshold) > 0) {
    fallbackReasons.push('SIMILARITY_RELAXED');
  }

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
        difficultyQuotaMet: Boolean(plan?.exact),
        hardChapterCounts: Object.fromEntries(countBy(
          selected.filter((question) => question.difficulty === 'HARD'),
          'chapter_id'
        )),
        chapterTargets: chapterQuotas,
        actualChapters: Object.fromEntries(chapterCounts),
        lessonGroupCount: lessonGroups.length,
        coveredChapters: new Set(selected.map((item) => item.chapter_id)).size,
        coveredLessons: lessonCounts.size,
        maxQuestionsPerLesson: lessonCounts.size > 0 ? Math.max(...lessonCounts.values()) : 0,
        coveredConcepts: conceptCounts.size,
        taggedQuestions: taggedQuestions.length,
        maxQuestionsPerConcept: conceptCounts.size > 0 ? Math.max(...conceptCounts.values()) : 0,
        nearDuplicatePairs: countNearDuplicatePairs(selected, similarityThreshold),
        similarityThreshold,
        recentExcluded: normalizedCandidates.filter((item) => recentIds.has(item.id)).length,
        reviewExcluded: normalizedCandidates.filter((item) => reviewIds.has(item.id)).length,
        fallbackReasons
      }
    }
  };
}

function improvePlannedQuestions(plannedQuestions, options) {
  const selected = [...plannedQuestions];
  for (let groupIndex = 0; groupIndex < selected.length; groupIndex += 1) {
    const current = selected[groupIndex];
    const lessonIds = new Set(options.lessonGroups[groupIndex]?.lessonIds || []);
    const usedIds = new Set(selected.filter((_, index) => index !== groupIndex).map((question) => question.id));
    const otherQuestions = selected.filter((_, index) => index !== groupIndex);
    const conceptCounts = countBy(otherQuestions.filter((question) => question.concept_id), 'concept_id');
    const alternatives = options.pool
      .filter((question) => (
        question.difficulty === options.assignments[groupIndex]
        && lessonIds.has(question.lesson_id)
        && !usedIds.has(question.id)
      ))
      .map((question) => ({ ...question, selection_order: options.random() }))
      .sort((left, right) => compareReplacementCandidates(left, right, options.selectionHistory));
    const replacement = alternatives.find((question) => (
      (!question.concept_id || (conceptCounts.get(question.concept_id) || 0) < options.maxPerConcept)
      && !otherQuestions.some((other) => areQuestionsNearDuplicate(
        question,
        other,
        options.similarityThreshold
      ))
    ));
    selected[groupIndex] = replacement || current;
  }
  return selected;
}

function compareReplacementCandidates(left, right, history) {
  const leftLesson = getHistoryEntry(history.lessons, left.lesson_id);
  const rightLesson = getHistoryEntry(history.lessons, right.lesson_id);
  if (leftLesson.count !== rightLesson.count) return leftLesson.count - rightLesson.count;
  if (leftLesson.lastSelectedAt !== rightLesson.lastSelectedAt) {
    return leftLesson.lastSelectedAt - rightLesson.lastSelectedAt;
  }
  const leftQuestion = getHistoryEntry(history.questions, left.id);
  const rightQuestion = getHistoryEntry(history.questions, right.id);
  if (leftQuestion.count !== rightQuestion.count) return leftQuestion.count - rightQuestion.count;
  if (leftQuestion.lastSelectedAt !== rightQuestion.lastSelectedAt) {
    return leftQuestion.lastSelectedAt - rightQuestion.lastSelectedAt;
  }
  return left.selection_order - right.selection_order;
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
  buildDifficultySelectionPlan,
  buildLessonGroups,
  createSeededRandom,
  createSelectionSeed,
  selectQuestionsV2
};
