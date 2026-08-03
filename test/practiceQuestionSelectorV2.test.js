const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DIFFICULTY_TARGETS,
  createSeededRandom,
  selectQuestionsV2
} = require('../utils/practiceQuestionSelectorV2');

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
  const recentIds = candidates.slice(0, 10).map((item) => item.id);
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

test('nới quota độ khó trước khi nới giới hạn hai câu mỗi bài', () => {
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
  assert.ok(capFallback.selection.metadata.fallbackReasons.includes('LESSON_CAP_RELAXED'));
  assert.ok(capFallback.selection.metadata.maxQuestionsPerLesson > 2);
});

test('khoảng ba mươi phần trăm đề ưu tiên bài yếu nhưng vẫn phủ đủ chương', () => {
  const candidates = buildCandidates();
  const weakLessonIds = [101, 202, 303, 404];
  const result = selectQuestionsV2(candidates, {
    count: 20,
    mode: 'COMPREHENSIVE',
    weakLessonIds,
    seed: '4000000000000001'
  });

  assert.ok(result.selection.metadata.weakSelected >= 6);
  assert.equal(result.selection.metadata.coveredChapters, 4);
  assert.ok(result.selection.metadata.maxQuestionsPerLesson <= 2);
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
