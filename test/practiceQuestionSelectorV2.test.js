const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DIFFICULTY_TARGETS,
  allocateChapterQuotas,
  buildDifficultySelectionPlan,
  buildLessonGroups,
  createSeededRandom,
  selectQuestionsV2
} = require('../utils/practiceQuestionSelectorV2');

function buildChapterCandidates(lessonCounts, questionsPerLesson = 1) {
  let id = 1;
  return lessonCounts.flatMap((lessonCount, chapterIndex) => (
    Array.from({ length: lessonCount }, (_, lessonIndex) => (
      Array.from({ length: questionsPerLesson }, () => ({
        id: id++,
        chapter_id: chapterIndex + 1,
        chapter_sort_order: chapterIndex + 1,
        lesson_id: (chapterIndex + 1) * 100 + lessonIndex + 1,
        lesson_sort_order: lessonIndex + 1,
        difficulty: 'EASY'
      }))
    )).flat()
  ));
}

function buildCandidates({ chapters = 4, lessonsPerChapter = 8, questionsPerDifficulty = 4 } = {}) {
  let id = 1;
  const items = [];
  for (let chapter = 1; chapter <= chapters; chapter += 1) {
    for (let lesson = 1; lesson <= lessonsPerChapter; lesson += 1) {
      for (const difficulty of ['EASY', 'MEDIUM', 'HARD']) {
        for (let index = 0; index < questionsPerDifficulty; index += 1) {
          items.push({
            id: id++,
            chapter_id: chapter,
            lesson_id: chapter * 100 + lesson,
            difficulty
          });
        }
      }
    }
  }
  return items;
}

function countBy(items, field) {
  return items.reduce((result, item) => {
    result[item[field]] = (result[item[field]] || 0) + 1;
    return result;
  }, {});
}

test('quota chương lớp 5 bám số bài và vẫn giữ tối thiểu một câu mỗi chương', () => {
  const candidates = buildChapterCandidates([15, 14, 18, 3]);
  assert.deepEqual(allocateChapterQuotas(candidates, 15, {}, () => 0.5), {
    1: 5,
    2: 4,
    3: 5,
    4: 1
  });
  assert.deepEqual(allocateChapterQuotas(candidates, 20, {}, () => 0.5), {
    1: 6,
    2: 6,
    3: 7,
    4: 1
  });
});

test('quota chương ưu tiên chương có độ bao phủ lịch sử thấp hơn', () => {
  const candidates = buildChapterCandidates([4, 4], 2);
  const history = {
    lessons: Object.fromEntries([101, 102, 103, 104].map((lessonId) => [
      lessonId,
      { count: 5, lastSelectedAt: '2026-08-08T08:00:00.000Z' }
    ]))
  };
  const quotas = allocateChapterQuotas(candidates, 6, history, () => 0.5);
  assert.deepEqual(quotas, { 1: 1, 2: 5 });
});

test('bộ chọn giữ đúng quota chương đã tính trong đề hoàn chỉnh', () => {
  const candidates = buildChapterCandidates([15, 14, 18, 3], 3)
    .map((question, index) => ({
      ...question,
      difficulty: ['EASY', 'MEDIUM', 'HARD'][index % 3]
    }));
  const result = selectQuestionsV2(candidates, {
    count: 20,
    mode: 'COMPREHENSIVE',
    maxPerLesson: 3,
    seed: '0101010101010101'
  });
  assert.deepEqual(result.selection.metadata.chapterTargets, { 1: 6, 2: 6, 3: 7, 4: 1 });
  assert.deepEqual(result.selection.metadata.actualChapters, { 1: 6, 2: 6, 3: 7, 4: 1 });
});

test('chia đều bài liên tiếp từ đầu đến cuối chương', () => {
  const candidates = buildChapterCandidates([18]);
  const groups = buildLessonGroups(candidates, { 1: 6 }, {}, () => 0.5);
  assert.deepEqual(groups.map((group) => group.lessonIds), [
    [101, 102, 103],
    [104, 105, 106],
    [107, 108, 109],
    [110, 111, 112],
    [113, 114, 115],
    [116, 117, 118]
  ]);
});

test('chọn hết bài chưa xuất hiện trước rồi mới chia nhóm bài đã xuất hiện', () => {
  const candidates = buildChapterCandidates([30]);
  const history = {
    lessons: Object.fromEntries(Array.from({ length: 15 }, (_, index) => [
      101 + index,
      { count: 1, lastSelectedAt: `2026-07-${String(index + 1).padStart(2, '0')}T08:00:00.000Z` }
    ]))
  };
  const groups = buildLessonGroups(candidates, { 1: 20 }, history, () => 0.5);
  assert.deepEqual(groups.slice(0, 15).map((group) => group.lessonIds), (
    Array.from({ length: 15 }, (_, index) => [116 + index])
  ));
  assert.deepEqual(groups.slice(15).map((group) => group.lessonIds), [
    [101, 102, 103],
    [104, 105, 106],
    [107, 108, 109],
    [110, 111, 112],
    [113, 114, 115]
  ]);
});

test('phân thêm câu cân bằng khi số bài ít hơn số câu', () => {
  const candidates = buildChapterCandidates([3], 3);
  const groups = buildLessonGroups(candidates, { 1: 5 }, {}, () => 0.5);
  assert.equal(groups.length, 5);
  assert.deepEqual(
    groups.reduce((result, group) => {
      const lessonId = group.lessonIds[0];
      result[lessonId] = (result[lessonId] || 0) + 1;
      return result;
    }, {}),
    { 101: 2, 102: 2, 103: 1 }
  );
});

test('mỗi nhóm bài liên tiếp đóng góp đúng một câu vào đề', () => {
  const candidates = buildChapterCandidates([18], 3).map((question, index) => ({
    ...question,
    difficulty: ['EASY', 'MEDIUM', 'HARD'][index % 3]
  }));
  const result = selectQuestionsV2(candidates, {
    count: 6,
    mode: 'CHAPTER',
    seed: '0202020202020202'
  });
  const selectedLessons = result.questions.map((question) => question.lesson_id);
  for (let groupIndex = 0; groupIndex < 6; groupIndex += 1) {
    const firstLesson = 101 + groupIndex * 3;
    const lessonGroup = [firstLesson, firstLesson + 1, firstLesson + 2];
    assert.equal(selectedLessons.filter((lessonId) => lessonGroup.includes(lessonId)).length, 1);
  }
  assert.equal(result.selection.metadata.lessonGroupCount, 6);
});

test('hoán đổi nhóm để giữ quota độ khó toàn đề khi cách gán trực tiếp bị kẹt', () => {
  const candidates = [
    { id: 1, chapter_id: 1, lesson_id: 101, difficulty: 'EASY' },
    { id: 2, chapter_id: 1, lesson_id: 101, difficulty: 'MEDIUM' },
    { id: 3, chapter_id: 1, lesson_id: 102, difficulty: 'HARD' },
    { id: 4, chapter_id: 1, lesson_id: 103, difficulty: 'EASY' }
  ];
  const groups = [
    { chapterId: 1, lessonIds: [101] },
    { chapterId: 1, lessonIds: [102] },
    { chapterId: 1, lessonIds: [103] }
  ];
  const plan = buildDifficultySelectionPlan(
    candidates,
    groups,
    { EASY: 1, MEDIUM: 1, HARD: 1 },
    {},
    () => 0.5
  );
  assert.equal(plan.exact, true);
  assert.deepEqual(countBy(plan.questions, 'difficulty'), { EASY: 1, MEDIUM: 1, HARD: 1 });
});

test('thiếu câu khó thì ưu tiên thay bằng câu trung bình trước câu dễ', () => {
  const candidates = [
    { id: 1, chapter_id: 1, lesson_id: 101, difficulty: 'EASY' },
    { id: 2, chapter_id: 1, lesson_id: 101, difficulty: 'MEDIUM' },
    { id: 3, chapter_id: 1, lesson_id: 102, difficulty: 'MEDIUM' },
    { id: 4, chapter_id: 1, lesson_id: 103, difficulty: 'EASY' },
    { id: 5, chapter_id: 1, lesson_id: 103, difficulty: 'MEDIUM' }
  ];
  const groups = [
    { chapterId: 1, lessonIds: [101] },
    { chapterId: 1, lessonIds: [102] },
    { chapterId: 1, lessonIds: [103] }
  ];
  const plan = buildDifficultySelectionPlan(
    candidates,
    groups,
    { EASY: 1, MEDIUM: 1, HARD: 1 },
    {},
    () => 0.5
  );
  assert.equal(plan.exact, false);
  assert.deepEqual(plan.difficultyTargets, { EASY: 1, MEDIUM: 2, HARD: 0 });
});

test('luân phiên câu khó sang chương có lịch sử nhận câu khó ít hơn', () => {
  const candidates = [];
  let id = 1;
  for (let chapterId = 1; chapterId <= 4; chapterId += 1) {
    for (const difficulty of ['EASY', 'MEDIUM', 'HARD']) {
      candidates.push({
        id: id++,
        chapter_id: chapterId,
        lesson_id: chapterId * 100 + 1,
        difficulty
      });
    }
  }
  const hardQuestions = candidates.filter((question) => question.difficulty === 'HARD');
  const history = {
    questions: {
      [hardQuestions[0].id]: { count: 10, lastSelectedAt: '2026-08-08T08:00:00.000Z' },
      [hardQuestions[1].id]: { count: 8, lastSelectedAt: '2026-08-07T08:00:00.000Z' }
    }
  };
  const groups = Array.from({ length: 4 }, (_, index) => ({
    chapterId: index + 1,
    lessonIds: [(index + 1) * 100 + 1]
  }));
  const plan = buildDifficultySelectionPlan(
    candidates,
    groups,
    { EASY: 1, MEDIUM: 1, HARD: 2 },
    history,
    () => 0.5
  );
  assert.deepEqual(
    plan.questions
      .filter((question) => question.difficulty === 'HARD')
      .map((question) => question.chapter_id)
      .sort(),
    [3, 4]
  );
});

test('cùng seed sinh cùng đề và seed khác tạo biến thể khác', () => {
  const candidates = buildCandidates();
  const first = selectQuestionsV2(candidates, { count: 20, mode: 'COMPREHENSIVE', seed: '0000000000000001' });
  const repeated = selectQuestionsV2(candidates, { count: 20, mode: 'COMPREHENSIVE', seed: '0000000000000001' });
  const different = selectQuestionsV2(candidates, { count: 20, mode: 'COMPREHENSIVE', seed: '0000000000000002' });

  assert.deepEqual(first.questions.map((item) => item.id), repeated.questions.map((item) => item.id));
  assert.notDeepEqual(first.questions.map((item) => item.id), different.questions.map((item) => item.id));
});

test('đề 15 và 20 câu đúng quota độ khó, phủ chương và không quá hai câu mỗi bài', () => {
  for (const count of [15, 20]) {
    const result = selectQuestionsV2(buildCandidates(), {
      count,
      mode: 'COMPREHENSIVE',
      seed: `10000000000000${count}`.slice(-16)
    });
    assert.equal(result.questions.length, count);
    assert.equal(new Set(result.questions.map((item) => item.id)).size, count);
    assert.deepEqual(countBy(result.questions, 'difficulty'), DIFFICULTY_TARGETS[count]);
    assert.equal(new Set(result.questions.map((item) => item.chapter_id)).size, 4);
    assert.ok(result.questions.every((item) => !Object.hasOwn(item, 'randomOrder')));
    assert.ok(Math.max(...Object.values(countBy(result.questions, 'lesson_id'))) <= 2);
    assert.deepEqual(result.selection.metadata.fallbackReasons, []);
  }
});

test('tránh câu gần đây và chỉ cho phép lại khi nguồn mới không đủ', () => {
  const candidates = buildCandidates({ chapters: 1, lessonsPerChapter: 4, questionsPerDifficulty: 2 });
  const recentIds = candidates.filter((item) => item.id % 2 === 1).slice(0, 10).map((item) => item.id);
  const enoughFresh = selectQuestionsV2(candidates, {
    count: 5,
    mode: 'LESSON',
    recentIds,
    seed: '2000000000000001'
  });
  assert.ok(enoughFresh.questions.every((item) => !recentIds.includes(item.id)));

  const scarce = selectQuestionsV2(candidates.slice(0, 6), {
    count: 5,
    mode: 'LESSON',
    recentIds: candidates.slice(0, 4).map((item) => item.id),
    seed: '2000000000000002'
  });
  assert.equal(scarce.questions.length, 5);
  assert.ok(scarce.selection.metadata.fallbackReasons.includes('RECENT_REUSED'));
});

test('nới quota độ khó khi thiếu nguồn và phân lặp bài khi số bài quá ít', () => {
  const noHard = buildCandidates({ chapters: 2, lessonsPerChapter: 10, questionsPerDifficulty: 2 })
    .filter((item) => item.difficulty !== 'HARD');
  const difficultyFallback = selectQuestionsV2(noHard, {
    count: 15,
    mode: 'COMPREHENSIVE',
    seed: '3000000000000001'
  });
  assert.equal(difficultyFallback.questions.length, 15);
  assert.deepEqual(difficultyFallback.selection.metadata.fallbackReasons, ['DIFFICULTY_RELAXED']);
  assert.ok(difficultyFallback.selection.metadata.maxQuestionsPerLesson <= 2);

  const twoLessons = buildCandidates({ chapters: 1, lessonsPerChapter: 2, questionsPerDifficulty: 10 });
  const capFallback = selectQuestionsV2(twoLessons, {
    count: 20,
    mode: 'CHAPTER',
    seed: '3000000000000002'
  });
  assert.equal(capFallback.questions.length, 20);
  assert.ok(capFallback.selection.metadata.maxQuestionsPerLesson > 2);
  assert.ok(!capFallback.selection.metadata.fallbackReasons.includes('LESSON_CAP_RELAXED'));
});

test('PRNG có seed luôn trả chuỗi số xác định trong khoảng hợp lệ', () => {
  const left = createSeededRandom('abcdef0123456789');
  const right = createSeededRandom('abcdef0123456789');
  const leftValues = Array.from({ length: 8 }, () => left());
  const rightValues = Array.from({ length: 8 }, () => right());
  assert.deepEqual(leftValues, rightValues);
  assert.ok(leftValues.every((value) => value >= 0 && value < 1));
});

test('giữ đúng quota khi mỗi bài chỉ có một câu của từng độ khó', () => {
  const candidates = buildCandidates({
    chapters: 1,
    lessonsPerChapter: 8,
    questionsPerDifficulty: 1
  });
  const result = selectQuestionsV2(candidates, {
    count: 15,
    mode: 'CHAPTER',
    maxPerLesson: 2,
    seed: '6000000000000001'
  });

  assert.deepEqual(countBy(result.questions, 'difficulty'), DIFFICULTY_TARGETS[15]);
  assert.deepEqual(result.selection.metadata.fallbackReasons, []);
  assert.ok(Math.max(...Object.values(countBy(result.questions, 'lesson_id'))) <= 2);
});

test('theo dõi độ phủ khái niệm và ghi fallback khi ràng buộc bài không cho phép giữ trần', () => {
  const candidates = buildCandidates({ chapters: 1, lessonsPerChapter: 6, questionsPerDifficulty: 2 })
    .map((question, index) => ({ ...question, concept_id: (index % 8) + 1 }));
  const result = selectQuestionsV2(candidates, {
    count: 15,
    mode: 'CHAPTER',
    maxPerLesson: 3,
    seed: '7300000000000001'
  });
  const conceptCounts = countBy(result.questions, 'concept_id');

  assert.equal(result.questions.length, 15);
  assert.equal(Object.keys(conceptCounts).length, 8);
  assert.equal(result.selection.metadata.coveredConcepts, 8);
  assert.equal(result.selection.metadata.taggedQuestions, 15);
  if (result.selection.metadata.maxQuestionsPerConcept > 2) {
    assert.ok(result.selection.metadata.fallbackReasons.includes('CONCEPT_CAP_RELAXED'));
  }
});

test('chỉ nới giới hạn khái niệm khi nguồn gắn nhãn không đủ đa dạng', () => {
  const candidates = buildCandidates({ chapters: 1, lessonsPerChapter: 5, questionsPerDifficulty: 2 })
    .map((question) => ({ ...question, concept_id: 99 }));
  const result = selectQuestionsV2(candidates, {
    count: 5,
    mode: 'CHAPTER',
    maxPerConcept: 2,
    seed: '7400000000000001'
  });

  assert.equal(result.questions.length, 5);
  assert.ok(result.selection.metadata.fallbackReasons.includes('CONCEPT_CAP_RELAXED'));
  assert.equal(result.selection.metadata.maxQuestionsPerConcept, 5);
});

test('câu chưa có concept_id không làm phát sinh fallback khái niệm', () => {
  const result = selectQuestionsV2(buildCandidates(), {
    count: 15,
    mode: 'COMPREHENSIVE',
    seed: '7500000000000001'
  });
  assert.equal(result.selection.metadata.coveredConcepts, 0);
  assert.equal(result.selection.metadata.taggedQuestions, 0);
  assert.ok(!result.selection.metadata.fallbackReasons.includes('CONCEPT_CAP_RELAXED'));
});

test('không ghi nới khái niệm khi nguồn không có concept_id', () => {
  const candidates = buildCandidates({ chapters: 1, lessonsPerChapter: 2, questionsPerDifficulty: 5 });
  const result = selectQuestionsV2(candidates, {
    count: 15,
    mode: 'CHAPTER',
    maxPerLesson: 2,
    seed: '7600000000000001'
  });
  assert.equal(result.questions.length, 15);
  assert.ok(result.selection.metadata.maxQuestionsPerLesson > 2);
  assert.ok(!result.selection.metadata.fallbackReasons.includes('CONCEPT_CAP_RELAXED'));
});
