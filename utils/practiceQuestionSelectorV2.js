// Tiện ích practice question selector v2 cung cấp các hàm dùng chung cho chuẩn hóa dữ liệu, bảo mật và xử lý lỗi.
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

// Hàm createSelectionSeed dùng để tạo bản ghi hoặc tài nguyên mới sau khi kiểm tra đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function createSelectionSeed() {
  return crypto.randomBytes(8).toString('hex');
}

// Hàm createSeededRandom dùng để tạo bản ghi hoặc tài nguyên mới sau khi kiểm tra đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function createSeededRandom(seed) {
  const normalized = normalizeSeed(seed);
  let state = (
    Number.parseInt(normalized.slice(0, 8), 16)
    ^ Number.parseInt(normalized.slice(8), 16)
  ) >>> 0;
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (state === 0) state = 0x9e3779b9;
  return function random() {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

// Hàm allocateChapterQuotas dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
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
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const chapter of chapters) {
    chapter.expectedCount = (totalHistory + targetCount) * chapter.lessonCount / Math.max(totalLessons, 1);
  }

  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (targetCount >= chapters.length) {
    // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
    for (const chapter of chapters) chapter.quota = 1;
  }

  // Phân từng câu còn lại cho chương đang thiếu bao phủ nhất so với số bài.
  let remaining = targetCount - chapters.reduce((sum, chapter) => sum + chapter.quota, 0);
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  while (remaining > 0) {
    const chapter = chapters
      .filter((item) => item.quota < item.availableCount)
      .sort(compareChapterCoverage)[0];
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!chapter) break;
    chapter.quota += 1;
    remaining -= 1;
  }

  return Object.fromEntries(chapters.map((chapter) => [chapter.id, chapter.quota]));
}

// Hàm compareChapterCoverage dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function compareChapterCoverage(left, right) {
  const leftDeficit = left.expectedCount - left.historyCount - left.quota;
  const rightDeficit = right.expectedCount - right.historyCount - right.quota;
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (leftDeficit !== rightDeficit) return rightDeficit - leftDeficit;
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (left.lessonCount !== right.lessonCount) return right.lessonCount - left.lessonCount;
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (left.lastSelectedAt !== right.lastSelectedAt) return left.lastSelectedAt - right.lastSelectedAt;
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
  return left.randomOrder - right.randomOrder;
}

// Hàm buildLessonGroups dùng để xây dựng kết quả từ các nguồn dữ liệu và quy tắc liên quan; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function buildLessonGroups(candidates, chapterQuotas, selectionHistory = {}, random = Math.random) {
  const normalizedCandidates = normalizeCandidates(candidates);
  const history = normalizeSelectionHistory(selectionHistory);
  const groups = [];
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
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

    // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
    for (const [, tierLessons] of tiers) {
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (remaining <= 0) break;
      const ordered = [...tierLessons].sort(compareLessonOrder);
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (remaining < ordered.length) {
        // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
        for (const lessonGroup of partitionContiguous(ordered, remaining)) {
          groups.push({ chapterId, lessonIds: lessonGroup.map((lesson) => lesson.id) });
          // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
          for (const lesson of lessonGroup) lesson.assignedCount += 1;
        }
        remaining = 0;
        break;
      }
      // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
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
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (!lesson) break;
      groups.push({ chapterId, lessonIds: [lesson.id] });
      lesson.assignedCount += 1;
      remaining -= 1;
    }
  }
  return groups;
}

// Hàm compareLessonOrder dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function compareLessonOrder(left, right) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (left.lastSelectedAt !== right.lastSelectedAt) return left.lastSelectedAt - right.lastSelectedAt;
  return left.randomOrder - right.randomOrder;
}

// Hàm compareAdditionalLessonSlot dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function compareAdditionalLessonSlot(left, right) {
  const leftCoverage = left.historyCount + left.assignedCount;
  const rightCoverage = right.historyCount + right.assignedCount;
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (leftCoverage !== rightCoverage) return leftCoverage - rightCoverage;
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (left.lastSelectedAt !== right.lastSelectedAt) return left.lastSelectedAt - right.lastSelectedAt;
  return left.randomOrder - right.randomOrder;
}

// Hàm partitionContiguous dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function partitionContiguous(items, groupCount) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (groupCount <= 0) return [];
  return Array.from({ length: groupCount }, (_, index) => {
    const start = Math.floor(index * items.length / groupCount);
    const end = Math.floor((index + 1) * items.length / groupCount);
    return items.slice(start, end);
  }).filter((group) => group.length > 0);
}

// Hàm buildDifficultySelectionPlan dùng để xây dựng kết quả từ các nguồn dữ liệu và quy tắc liên quan; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
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
  const availableByDifficulty = countByDifficulty(normalizedCandidates);
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const targetOption of targetOptions) {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (DIFFICULTIES.some((difficulty) => (
      targetOption[difficulty] > availableByDifficulty[difficulty]
    ))) continue;
    const result = matchQuestionsToGroups(
      normalizedCandidates,
      lessonGroups,
      targetOption,
      history
    );
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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

// Hàm matchQuestionsToGroups dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
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

  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const difficulty of ['HARD', 'MEDIUM', 'EASY']) {
    addFlowEdge(graph, source, `DIFFICULTY:${difficulty}`, targets[difficulty]);
    const difficultyCandidates = orderDifficultyCandidates(
      candidates.filter((question) => question.difficulty === difficulty),
      difficulty,
      history,
      hardHistoryByChapter
    );
    // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
    for (const question of difficultyCandidates) {
      addFlowEdge(graph, `DIFFICULTY:${difficulty}`, `QUESTION:${question.id}`, 1);
    }
  }
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const question of candidates) {
    // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
    for (let groupIndex = 0; groupIndex < lessonGroups.length; groupIndex += 1) {
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (!groupLessonSets[groupIndex].has(question.lesson_id)) continue;
      addFlowEdge(graph, `QUESTION:${question.id}`, `GROUP:${groupIndex}`, 1, {
        type: 'QUESTION_GROUP',
        questionId: question.id,
        groupIndex
      });
    }
  }
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (let groupIndex = 0; groupIndex < lessonGroups.length; groupIndex += 1) {
    addFlowEdge(graph, `GROUP:${groupIndex}`, sink, 1);
  }

  const flow = calculateMaxFlow(graph, source, sink);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (flow !== lessonGroups.length) return { questions: [], assignments: {} };
  const questionById = new Map(candidates.map((question) => [question.id, question]));
  const selectedByGroup = {};
  const assignments = {};
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const edges of graph.values()) {
    // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
    for (const edge of edges) {
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (edge.meta?.type !== 'QUESTION_GROUP' || edge.capacity !== 0) continue;
      const question = questionById.get(edge.meta.questionId);
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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

// Hàm orderDifficultyCandidates dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function orderDifficultyCandidates(candidates, difficulty, history, hardHistoryByChapter) {
  // Hàm compareHistory dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  const compareHistory = (left, right) => {
    const leftLesson = getHistoryEntry(history.lessons, left.lesson_id);
    const rightLesson = getHistoryEntry(history.lessons, right.lesson_id);
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (leftLesson.count !== rightLesson.count) return leftLesson.count - rightLesson.count;
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (leftLesson.lastSelectedAt !== rightLesson.lastSelectedAt) {
      return leftLesson.lastSelectedAt - rightLesson.lastSelectedAt;
    }
    const leftQuestion = getHistoryEntry(history.questions, left.id);
    const rightQuestion = getHistoryEntry(history.questions, right.id);
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (leftQuestion.count !== rightQuestion.count) return leftQuestion.count - rightQuestion.count;
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (leftQuestion.lastSelectedAt !== rightQuestion.lastSelectedAt) {
      return leftQuestion.lastSelectedAt - rightQuestion.lastSelectedAt;
    }
    return left.selection_order - right.selection_order;
  };
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  while (chapterQueues.some((chapter) => chapter.questions.length > 0)) {
    // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
    for (const chapter of chapterQueues) {
      const question = chapter.questions.shift();
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (question) ordered.push(question);
    }
  }
  return ordered;
}

// Hàm enumerateDifficultyTargets dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function enumerateDifficultyTargets(targets, count) {
  const options = [];
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (let hard = 0; hard <= count; hard += 1) {
    // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
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

// Hàm difficultyFallbackScore dùng để tính toán kết quả từ các tham số đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
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

// Hàm addFlowEdge dùng để tạo bản ghi hoặc tài nguyên mới sau khi kiểm tra đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function addFlowEdge(graph, from, to, capacity, meta = null) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!graph.has(from)) graph.set(from, []);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!graph.has(to)) graph.set(to, []);
  const forward = { to, capacity, reverseIndex: graph.get(to).length, meta };
  const reverse = { to: from, capacity: 0, reverseIndex: graph.get(from).length, meta: null };
  graph.get(from).push(forward);
  graph.get(to).push(reverse);
}

// Hàm calculateMaxFlow dùng để tính toán kết quả từ các tham số đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function calculateMaxFlow(graph, source, sink) {
  let totalFlow = 0;
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  while (true) {
    const parent = new Map([[source, null]]);
    const queue = [source];
    // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
    while (queue.length > 0 && !parent.has(sink)) {
      const node = queue.shift();
      const edges = graph.get(node) || [];
      // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
      for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex += 1) {
        const edge = edges[edgeIndex];
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (edge.capacity <= 0 || parent.has(edge.to)) continue;
        parent.set(edge.to, { node, edgeIndex });
        queue.push(edge.to);
      }
    }
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!parent.has(sink)) return totalFlow;
    let node = sink;
    // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
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

// Hàm selectQuestionsV2 dùng để lựa chọn phương án phù hợp dựa trên trạng thái và ưu tiên; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
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
  const phases = [{ name: 'STRICT', pool: freshPool }];
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (recentIds.size > 0) phases.push({ name: 'RECENT_REUSED', pool: basePool });
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (reviewIds.size > 0) phases.push({ name: 'REVIEW_REUSED', pool: normalizedCandidates });
  const plannedPhases = phases.map((phase) => ({
    ...phase,
    plan: buildDifficultySelectionPlan(
        phase.pool,
        lessonGroups,
        targets,
        options.selectionHistory,
        random
      )
  }));
  const selectedPlan = plannedPhases.find((phase) => (
    phase.plan.exact && phase.plan.questions.length === lessonGroups.length
  )) || plannedPhases.find((phase) => phase.plan.questions.length === lessonGroups.length);
  const selectedPhase = selectedPlan || plannedPhases.at(-1);
  const plan = selectedPlan?.plan || null;

  const improved = improvePlannedQuestions(plan?.questions || [], {
    assignments: plan?.assignments || {},
    lessonGroups,
    pool: selectedPhase.pool,
    selectionHistory,
    maxPerConcept,
    similarityThreshold,
    random
  });
  const orderedQuestions = orderQuestionsDiversely(improved, random);
  const selected = orderedQuestions.map(({
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
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (selected.some((question) => recentIds.has(question.id))) fallbackReasons.push('RECENT_REUSED');
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (selected.some((question) => reviewIds.has(question.id))) fallbackReasons.push('REVIEW_REUSED');
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (plan && !plan.exact) fallbackReasons.push('DIFFICULTY_RELAXED');
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (conceptCounts.size > 0 && Math.max(...conceptCounts.values()) > maxPerConcept) {
    fallbackReasons.push('CONCEPT_CAP_RELAXED');
  }
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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
        sequenceConflicts: countSequenceConflicts(selected),
        similarityThreshold,
        recentExcluded: normalizedCandidates.filter((item) => recentIds.has(item.id)).length,
        reviewExcluded: normalizedCandidates.filter((item) => reviewIds.has(item.id)).length,
        fallbackReasons
      }
    }
  };
}

// Hàm improvePlannedQuestions dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function improvePlannedQuestions(plannedQuestions, options) {
  const selected = [...plannedQuestions];
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
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

// Hàm compareReplacementCandidates dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function compareReplacementCandidates(left, right, history) {
  const leftLesson = getHistoryEntry(history.lessons, left.lesson_id);
  const rightLesson = getHistoryEntry(history.lessons, right.lesson_id);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (leftLesson.count !== rightLesson.count) return leftLesson.count - rightLesson.count;
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (leftLesson.lastSelectedAt !== rightLesson.lastSelectedAt) {
    return leftLesson.lastSelectedAt - rightLesson.lastSelectedAt;
  }
  const leftQuestion = getHistoryEntry(history.questions, left.id);
  const rightQuestion = getHistoryEntry(history.questions, right.id);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (leftQuestion.count !== rightQuestion.count) return leftQuestion.count - rightQuestion.count;
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (leftQuestion.lastSelectedAt !== rightQuestion.lastSelectedAt) {
    return leftQuestion.lastSelectedAt - rightQuestion.lastSelectedAt;
  }
  return left.selection_order - right.selection_order;
}

// Hàm orderQuestionsDiversely dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function orderQuestionsDiversely(questions, random) {
  const remaining = questions.map((question) => ({ ...question, sequence_order: random() }));
  const ordered = [];
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  while (remaining.length > 0) {
    const previous = ordered.at(-1);
    const previousSecond = ordered.at(-2);
    remaining.sort((left, right) => (
      sequencePenalty(left, previous, previousSecond)
      - sequencePenalty(right, previous, previousSecond)
      || left.sequence_order - right.sequence_order
    ));
    ordered.push(remaining.shift());
  }
  const optimized = improveSequenceBySwaps(ordered);
  return optimized.map(({ sequence_order: sequenceOrder, ...question }) => question);
}

// Hàm improveSequenceBySwaps dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function improveSequenceBySwaps(questions) {
  const ordered = [...questions];
  let currentScore = sequenceConflictScore(ordered);
  let improved = true;
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  while (improved && currentScore > 0) {
    improved = false;
    // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
    for (let left = 0; left < ordered.length - 1 && !improved; left += 1) {
      // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
      for (let right = left + 1; right < ordered.length; right += 1) {
        [ordered[left], ordered[right]] = [ordered[right], ordered[left]];
        const score = sequenceConflictScore(ordered);
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (score < currentScore) {
          currentScore = score;
          improved = true;
          break;
        }
        [ordered[left], ordered[right]] = [ordered[right], ordered[left]];
      }
    }
  }
  return ordered;
}

// Hàm sequenceConflictScore dùng để tính toán kết quả từ các tham số đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function sequenceConflictScore(questions) {
  const conflicts = countSequenceConflicts(questions);
  return conflicts.chapter + conflicts.lesson + conflicts.difficulty;
}

// Hàm sequencePenalty dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function sequencePenalty(question, previous, previousSecond) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!previous) return 0;
  let penalty = 0;
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (question.lesson_id === previous.lesson_id) penalty += 8;
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (question.chapter_id === previous.chapter_id) penalty += 4;
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (question.difficulty === previous.difficulty) penalty += 2;
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (previousSecond) {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (question.lesson_id === previousSecond.lesson_id) penalty += 2;
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (question.chapter_id === previousSecond.chapter_id) penalty += 1;
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (question.difficulty === previousSecond.difficulty) penalty += 0.5;
  }
  return penalty;
}

// Hàm countSequenceConflicts dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function countSequenceConflicts(questions) {
  return questions.slice(1).reduce((result, question, index) => {
    const previous = questions[index];
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (question.chapter_id === previous.chapter_id) result.chapter += 1;
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (question.lesson_id === previous.lesson_id) result.lesson += 1;
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (question.difficulty === previous.difficulty) result.difficulty += 1;
    return result;
  }, { chapter: 0, lesson: 0, difficulty: 0 });
}

// Hàm normalizeCandidates dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function normalizeCandidates(candidates) {
  const seen = new Set();
  return (Array.isArray(candidates) ? candidates : []).reduce((result, item) => {
    const id = Number(item?.id);
    const lessonId = Number(item?.lesson_id);
    const chapterId = Number(item?.chapter_id);
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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

// Hàm normalizeDifficulty dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function normalizeDifficulty(value) {
  const difficulty = String(value || 'EASY').trim().toUpperCase();
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  return DIFFICULTIES.includes(difficulty) ? difficulty : 'EASY';
}

// Hàm normalizeDifficultyTargets dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function normalizeDifficultyTargets(targets, count) {
  const normalized = Object.fromEntries(
    DIFFICULTIES.map((difficulty) => [difficulty, Math.max(0, Math.floor(Number(targets?.[difficulty]) || 0))])
  );
  let remaining = count - Object.values(normalized).reduce((sum, value) => sum + value, 0);
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const difficulty of DIFFICULTIES) {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (remaining <= 0) break;
    normalized[difficulty] += 1;
    remaining -= 1;
  }
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  while (remaining < 0) {
    const difficulty = [...DIFFICULTIES].reverse().find((item) => normalized[item] > 0);
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!difficulty) break;
    normalized[difficulty] -= 1;
    remaining += 1;
  }
  return normalized;
}

// Hàm buildRatioTargets dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function buildRatioTargets(count) {
  const easy = Math.round(count * 0.45);
  const medium = Math.round(count * 0.4);
  return { EASY: easy, MEDIUM: medium, HARD: Math.max(0, count - easy - medium) };
}

// Hàm countBy dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function countBy(items, field) {
  return items.reduce((result, item) => {
    result.set(item[field], (result.get(item[field]) || 0) + 1);
    return result;
  }, new Map());
}

// Hàm groupBy dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function groupBy(items, field) {
  return items.reduce((result, item) => {
    const key = item[field];
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!result.has(key)) result.set(key, []);
    result.get(key).push(item);
    return result;
  }, new Map());
}

// Hàm normalizeSelectionHistory dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function normalizeSelectionHistory(value = {}) {
  return {
    questions: normalizeHistoryEntries(value.questions),
    lessons: normalizeHistoryEntries(value.lessons)
  };
}

// Hàm normalizeHistoryEntries dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function normalizeHistoryEntries(entries) {
  return new Map(Object.entries(entries || {}).map(([id, entry]) => [
    Number(id),
    {
      count: Math.max(0, Number(entry?.count) || 0),
      lastSelectedAt: normalizeTimestamp(entry?.lastSelectedAt)
    }
  ]).filter(([id]) => Number.isInteger(id) && id > 0));
}

// Hàm getHistoryEntry dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function getHistoryEntry(entries, id) {
  return entries.get(Number(id)) || { count: 0, lastSelectedAt: Number.NEGATIVE_INFINITY };
}

// Hàm recentQuestionIdsFromHistory dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function recentQuestionIdsFromHistory(history, limit) {
  const safeLimit = Math.max(0, Number(limit) || 0);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (safeLimit === 0) return [];
  return [...history.questions.entries()]
    .filter(([, entry]) => Number.isFinite(entry.lastSelectedAt))
    .sort((left, right) => right[1].lastSelectedAt - left[1].lastSelectedAt)
    .slice(0, safeLimit)
    .map(([questionId]) => questionId);
}

// Hàm normalizeTimestamp dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function normalizeTimestamp(value) {
  const timestamp = Date.parse(String(value || ''));
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

// Hàm countByDifficulty dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function countByDifficulty(items) {
  return items.reduce((result, item) => {
    result[item.difficulty] = (result[item.difficulty] || 0) + 1;
    return result;
  }, { EASY: 0, MEDIUM: 0, HARD: 0 });
}

// Hàm toIdSet dùng để cập nhật trạng thái hoặc dữ liệu theo quy tắc nghiệp vụ; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function toIdSet(values) {
  return new Set((Array.isArray(values) ? values : []).map(Number).filter(Boolean));
}

// Hàm normalizeSeed dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function normalizeSeed(value) {
  const seed = String(value || '').trim().toLowerCase();
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (/^[a-f0-9]{16}$/.test(seed)) return seed;
  return crypto.createHash('sha256').update(seed || 'balanced-v2').digest('hex').slice(0, 16);
}

// Hàm normalizeMode dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function normalizeMode(value) {
  const mode = String(value || 'COMPREHENSIVE').trim().toUpperCase();
  return ['REVIEW', 'LESSON', 'CHAPTER', 'COMPREHENSIVE'].includes(mode)
    ? mode
    : 'COMPREHENSIVE';
}

// Hàm normalizeCount dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function normalizeCount(value) {
  const count = Number(value);
  return Number.isInteger(count) && count > 0 ? count : 0;
}

// Hàm normalizePositiveInteger dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function normalizePositiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

// Hàm normalizeSimilarityThreshold dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function normalizeSimilarityThreshold(value) {
  const threshold = Number(value);
  return Number.isFinite(threshold) && threshold >= 0.75 && threshold <= 1
    ? threshold
    : DEFAULT_SIMILARITY_THRESHOLD;
}

// Hàm normalizeOptionalId dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function normalizeOptionalId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Hàm normalizeSortOrder dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
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
