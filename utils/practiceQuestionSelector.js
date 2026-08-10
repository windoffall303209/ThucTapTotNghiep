// Ti?n ?ch practice question selector cung c?p c?c h?m d?ng chung cho chu?n h?a d? li?u, b?o m?t v? x? l? l?i.
function shuffle(items, random = Math.random) {
  const result = [...items];
  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

// H?m selectRandomQuestions d?ng ?? l?a ch?n ph??ng ?n ph? h?p d?a tr?n tr?ng th?i v? ?u ti?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function selectRandomQuestions(candidates, count, options = {}) {
  const excludedIds = new Set((options.excludeIds || []).map(Number));
  const available = candidates.filter(
    (question) => !excludedIds.has(Number(question.id))
  );
  return shuffle(available, options.random).slice(0, normalizeCount(count));
}

// H?m selectBalancedQuestions d?ng ?? l?a ch?n ph??ng ?n ph? h?p d?a tr?n tr?ng th?i v? ?u ti?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function selectBalancedQuestions(candidates, count, options = {}) {
  const requestedCount = normalizeCount(count);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (requestedCount === 0) return [];

  const excludedIds = new Set((options.excludeIds || []).map(Number));
  const uniqueCandidates = deduplicateById(candidates).filter(
    (question) => !excludedIds.has(Number(question.id))
  );
  const chapters = buildChapterBuckets(uniqueCandidates, options.random);
  const selected = [];

  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  while (selected.length < requestedCount) {
    let addedInRound = false;

    // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
    for (const chapter of chapters) {
      const lesson = nextAvailableLesson(chapter.lessons);
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (!lesson) continue;

      selected.push(lesson.questions.pop());
      lesson.selectedCount += 1;
      addedInRound = true;

      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (selected.length >= requestedCount) break;
    }

    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!addedInRound) break;
  }

  return shuffle(selected, options.random);
}

// H?m buildChapterBuckets d?ng ?? x?y d?ng k?t qu? t? c?c ngu?n d? li?u v? quy t?c li?n quan; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function buildChapterBuckets(candidates, random) {
  const chapterMap = new Map();

  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const question of candidates) {
    const chapterKey = Number(question.chapter_id || 0);
    const lessonKey = Number(question.lesson_id || 0);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!chapterMap.has(chapterKey)) {
      chapterMap.set(chapterKey, new Map());
    }
    const lessonMap = chapterMap.get(chapterKey);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!lessonMap.has(lessonKey)) {
      lessonMap.set(lessonKey, []);
    }
    lessonMap.get(lessonKey).push(question);
  }

  return shuffle(
    [...chapterMap.entries()].map(([chapterId, lessonMap]) => ({
      chapterId,
      lessons: shuffle(
        [...lessonMap.entries()].map(([lessonId, questions]) => ({
          lessonId,
          selectedCount: 0,
          questions: shuffle(questions, random)
        })),
        random
      )
    })),
    random
  );
}

// H?m nextAvailableLesson d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function nextAvailableLesson(lessons) {
  const available = lessons.filter((lesson) => lesson.questions.length > 0);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (available.length === 0) return null;

  const minimumSelected = Math.min(
    ...available.map((lesson) => lesson.selectedCount)
  );
  return available.find((lesson) => lesson.selectedCount === minimumSelected);
}

// H?m deduplicateById d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function deduplicateById(candidates) {
  const seen = new Set();
  return candidates.filter((question) => {
    const id = Number(question.id);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

// H?m normalizeCount d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function normalizeCount(value) {
  const count = Number(value);
  return Number.isInteger(count) && count > 0 ? count : 0;
}

module.exports = {
  selectRandomQuestions,
  selectBalancedQuestions,
  shuffle
};
