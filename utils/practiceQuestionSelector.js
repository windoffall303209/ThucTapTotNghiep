// Tiện ích practice question selector cung cấp các hàm dùng chung cho chuẩn hóa dữ liệu, bảo mật và xử lý lỗi.
function shuffle(items, random = Math.random) {
  const result = [...items];
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

// Hàm selectRandomQuestions dùng để lựa chọn phương án phù hợp dựa trên trạng thái và ưu tiên; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function selectRandomQuestions(candidates, count, options = {}) {
  const excludedIds = new Set((options.excludeIds || []).map(Number));
  const available = candidates.filter(
    (question) => !excludedIds.has(Number(question.id))
  );
  return shuffle(available, options.random).slice(0, normalizeCount(count));
}

// Hàm selectBalancedQuestions dùng để lựa chọn phương án phù hợp dựa trên trạng thái và ưu tiên; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function selectBalancedQuestions(candidates, count, options = {}) {
  const requestedCount = normalizeCount(count);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (requestedCount === 0) return [];

  const excludedIds = new Set((options.excludeIds || []).map(Number));
  const uniqueCandidates = deduplicateById(candidates).filter(
    (question) => !excludedIds.has(Number(question.id))
  );
  const chapters = buildChapterBuckets(uniqueCandidates, options.random);
  const selected = [];

  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  while (selected.length < requestedCount) {
    let addedInRound = false;

    // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
    for (const chapter of chapters) {
      const lesson = nextAvailableLesson(chapter.lessons);
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (!lesson) continue;

      selected.push(lesson.questions.pop());
      lesson.selectedCount += 1;
      addedInRound = true;

      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (selected.length >= requestedCount) break;
    }

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!addedInRound) break;
  }

  return shuffle(selected, options.random);
}

// Hàm buildChapterBuckets dùng để xây dựng kết quả từ các nguồn dữ liệu và quy tắc liên quan; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function buildChapterBuckets(candidates, random) {
  const chapterMap = new Map();

  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const question of candidates) {
    const chapterKey = Number(question.chapter_id || 0);
    const lessonKey = Number(question.lesson_id || 0);
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!chapterMap.has(chapterKey)) {
      chapterMap.set(chapterKey, new Map());
    }
    const lessonMap = chapterMap.get(chapterKey);
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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

// Hàm nextAvailableLesson dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function nextAvailableLesson(lessons) {
  const available = lessons.filter((lesson) => lesson.questions.length > 0);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (available.length === 0) return null;

  const minimumSelected = Math.min(
    ...available.map((lesson) => lesson.selectedCount)
  );
  return available.find((lesson) => lesson.selectedCount === minimumSelected);
}

// Hàm deduplicateById dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function deduplicateById(candidates) {
  const seen = new Set();
  return candidates.filter((question) => {
    const id = Number(question.id);
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

// Hàm normalizeCount dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function normalizeCount(value) {
  const count = Number(value);
  return Number.isInteger(count) && count > 0 ? count : 0;
}

module.exports = {
  selectRandomQuestions,
  selectBalancedQuestions,
  shuffle
};
