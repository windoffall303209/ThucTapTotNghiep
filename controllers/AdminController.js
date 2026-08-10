// B? ?i?u khi?n admin controller ti?p nh?n y?u c?u, ki?m tra d? li?u v? ?i?u ph?i ph?n h?i cho ng??i d?ng.
const Curriculum = require('../models/Curriculum');
const Question = require('../models/Question');
const Student = require('../models/Student');
const SystemSetting = require('../models/SystemSetting');
const AIConversationLog = require('../models/AIConversationLog');
const ImageStorageService = require('../services/ImageStorageService');
const ProviderCheckService = require('../services/ProviderCheckService');
const { setFlash } = require('../utils/flash');
const { GRADE_RANGE_LABEL, gradeOptions, isSupportedGrade } = require('../config/grades');
const { validatePassword } = require('../utils/accountValidation');
const { parseGridLayout } = require('../utils/gridLayout');
const { safeAdminReturnTo } = require('../utils/safeRedirect');
const { commitRequestUploads } = require('../middleware/upload');

const ANSWER_KEYS = ['A', 'B', 'C', 'D'];
const QUESTION_TYPES = ['MULTIPLE_CHOICE', 'FILL_IN_THE_BLANK'];
const LAYOUT_TEMPLATES = [
  'STACK_VERTICAL',
  'SPLIT_HORIZONTAL_LEFT_IMAGE',
  'SPLIT_HORIZONTAL_RIGHT_IMAGE',
  'IMAGE_IN_CHOICES'
];
const LAYOUT_VARIANTS = [
  'STACK_VERTICAL',
  'VISUAL_TOP',
  'VISUAL_BOTTOM',
  'SPLIT_HORIZONTAL_LEFT_IMAGE',
  'SPLIT_HORIZONTAL_RIGHT_IMAGE',
  'IMAGE_IN_CHOICES',
  'COMPACT'
];

// H?m contentManagerUrl d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function contentManagerUrl(section, lessonId) {
  const normalizedLessonId = Number(lessonId);
  return Number.isInteger(normalizedLessonId) && normalizedLessonId > 0
    ? `/admin/${section}?lesson=${normalizedLessonId}`
    : `/admin/${section}`;
}

// H?m dashboard d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function dashboard(req, res, next) {
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    const [questionStats, recentQuestions, studentCount, difficultyStats, allLessons, questionCounts, theoryCounts] = await Promise.all([
      Question.getAdminStats(),
      Question.getRecentQuestions(6),
      Student.countStudents(),
      Question.getDifficultyStats(),
      Curriculum.getAllLessons(),
      Question.getQuestionCountsByLesson(),
      Curriculum.getTheoryCounts()
    ]);

    // Việc tồn đọng: bài chưa có câu hỏi và bài chưa có thẻ lý thuyết. Đây là
    // hai con số người soạn nội dung cần nhìn thấy đầu tiên mỗi sáng, thay vì
    // phải tự dò từng bài trong khung chương trình.
    const lessonIdsCoCauHoi = new Set(
      questionCounts.filter((row) => Number(row.question_count) > 0).map((row) => Number(row.lesson_id))
    );
    const lessonIdsCoLyThuyet = new Set(
      theoryCounts.filter((row) => Number(row.theory_count) > 0).map((row) => Number(row.lesson_id))
    );
    const baiThieuCauHoi = allLessons.filter((lesson) => !lessonIdsCoCauHoi.has(Number(lesson.id)));
    const baiThieuLyThuyet = allLessons.filter((lesson) => !lessonIdsCoLyThuyet.has(Number(lesson.id)));

    res.render('admin/dashboard', {
      title: 'Bảng quản trị',
      stats: {
        questionCount: questionStats.questionCount,
        studentCount,
        lessonCount: questionStats.lessonCount,
        easyCount: questionStats.easyCount
      },
      difficultyStats,
      backlog: {
        thieuCauHoi: baiThieuCauHoi.length,
        thieuLyThuyet: baiThieuLyThuyet.length,
        viDuThieuCauHoi: baiThieuCauHoi.slice(0, 5),
        viDuThieuLyThuyet: baiThieuLyThuyet.slice(0, 5)
      },
      questions: recentQuestions
    });
  } catch (error) {
    next(error);
  }
}

// H?m questions d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function questions(req, res, next) {
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    const [questionCounts, lessons] = await Promise.all([
      Question.getQuestionCountsByLesson(),
      Curriculum.getAllLessons()
    ]);

    const questionBankTree = buildQuestionBankTree(lessons, questionCounts);
    const bookTree = buildBookTree(questionBankTree);
    const totalQuestionCount = questionCounts.reduce(
      (sum, row) => sum + Number(row.question_count || 0),
      0
    );

    res.render('admin/questions', {
      title: 'Quản lý câu hỏi',
      questions: [],
      lessons,
      questionBankTree,
      bookTree,
      totalQuestionCount,
      selectedLessonId: lessons.some((lesson) => Number(lesson.id) === Number(req.query.lesson))
        ? Number(req.query.lesson)
        : null
    });
  } catch (error) {
    next(error);
  }
}

// H?m theory d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function theory(req, res, next) {
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    const [lessons, theoryCounts] = await Promise.all([
      Curriculum.getAllLessons(),
      Curriculum.getTheoryCounts()
    ]);
    const theoryTree = buildTheoryTree(lessons, theoryCounts);
    const bookTree = buildTheoryBookTree(theoryTree);
    const totalTheoryCardCount = theoryCounts.reduce(
      (sum, row) => sum + Number(row.theory_count || 0),
      0
    );

    res.render('admin/theory', {
      title: 'Quản lý lý thuyết',
      lessons,
      theoryTree,
      bookTree,
      totalTheoryCardCount,
      selectedLessonId: lessons.some((lesson) => Number(lesson.id) === Number(req.query.lesson))
        ? Number(req.query.lesson)
        : null
    });
  } catch (error) {
    next(error);
  }
}

// H?m lessonTheory d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function lessonTheory(req, res, next) {
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    const lesson = await Curriculum.getLessonById(req.params.lessonId);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!lesson) {
      return res.status(404).send('<div class="empty-state compact danger">Không tìm thấy bài học cần quản lý lý thuyết.</div>');
    }

    return res.render('admin/partials/lesson-theory', {
      layout: false,
      lesson
    });
  } catch (error) {
    next(error);
  }
}

// H?m createTheoryCard d?ng ?? t?o b?n ghi ho?c t?i nguy?n m?i sau khi ki?m tra ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function createTheoryCard(req, res, next) {
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    const lesson = await Curriculum.getLessonById(req.params.lessonId);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!lesson) {
      setFlash(req, 'danger', 'Không tìm thấy bài học cần thêm thẻ lý thuyết.');
      return res.redirect(contentManagerUrl('theory', req.params.lessonId));
    }

    const cards = Array.isArray(lesson.theory_cards) ? [...lesson.theory_cards] : [];
    const newCard = await buildSingleTheoryCard(req.body, req.files || [], cards.length);

    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!hasTheoryCardContent(newCard)) {
      setFlash(req, 'danger', 'Thẻ lý thuyết cần có tiêu đề, nội dung, ví dụ hoặc ảnh minh họa.');
      return res.redirect(contentManagerUrl('theory', lesson.id));
    }

    cards.push(newCard);
    const savedCards = await Curriculum.updateLessonTheoryCards(lesson.id, cards, {
      expectedTheoryCards: lesson.theory_cards
    });
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!savedCards) {
      setFlash(req, 'danger', 'Bài học đã được xóa ở yêu cầu khác. Ảnh tải lên không được lưu.');
      return res.redirect(contentManagerUrl('theory'));
    }
    commitRequestUploads(req);

    setFlash(req, 'success', 'Đã thêm thẻ lý thuyết.');
    return res.redirect(contentManagerUrl('theory', lesson.id));
  } catch (error) {
    next(error);
  }
}

// H?m updateTheoryCard d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function updateTheoryCard(req, res, next) {
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    const lesson = await Curriculum.getLessonById(req.params.lessonId);
    const cardIndex = Number(req.params.cardIndex);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!lesson || !Number.isInteger(cardIndex)) {
      setFlash(req, 'danger', 'Không tìm thấy thẻ lý thuyết cần cập nhật.');
      return res.redirect(contentManagerUrl('theory', req.params.lessonId));
    }

    const cards = Array.isArray(lesson.theory_cards) ? [...lesson.theory_cards] : [];
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!cards[cardIndex]) {
      setFlash(req, 'danger', 'Không tìm thấy thẻ lý thuyết cần cập nhật.');
      return res.redirect(contentManagerUrl('theory', lesson.id));
    }

    const updatedCard = await buildSingleTheoryCard(
      req.body,
      req.files || [],
      cardIndex,
      cards[cardIndex]
    );
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!hasTheoryCardContent(updatedCard)) {
      setFlash(req, 'danger', 'Thẻ lý thuyết cần có tiêu đề, nội dung, ví dụ hoặc ảnh minh họa.');
      return res.redirect(contentManagerUrl('theory', lesson.id));
    }

    cards[cardIndex] = updatedCard;
    const savedCards = await Curriculum.updateLessonTheoryCards(lesson.id, cards, {
      expectedTheoryCards: lesson.theory_cards
    });
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!savedCards) {
      setFlash(req, 'danger', 'Bài học đã được xóa ở yêu cầu khác. Ảnh tải lên không được lưu.');
      return res.redirect(contentManagerUrl('theory'));
    }
    commitRequestUploads(req);
    await ImageStorageService.deleteStoredImagesIfUnreferenced(
      ImageStorageService.differenceImageDescriptors(lesson.theory_cards, savedCards)
    );

    setFlash(req, 'success', 'Đã cập nhật thẻ lý thuyết.');
    return res.redirect(contentManagerUrl('theory', lesson.id));
  } catch (error) {
    next(error);
  }
}

// H?m deleteTheoryCard d?ng ?? x?a ho?c gi?i ph?ng t?i nguy?n theo ?i?u ki?n an to?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function deleteTheoryCard(req, res, next) {
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    const lesson = await Curriculum.getLessonById(req.params.lessonId);
    const cardIndex = Number(req.params.cardIndex);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!lesson || !Number.isInteger(cardIndex)) {
      setFlash(req, 'danger', 'Không tìm thấy thẻ lý thuyết cần xóa.');
      return res.redirect(contentManagerUrl('theory', req.params.lessonId));
    }

    const cards = Array.isArray(lesson.theory_cards) ? [...lesson.theory_cards] : [];
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!cards[cardIndex]) {
      setFlash(req, 'danger', 'Không tìm thấy thẻ lý thuyết cần xóa.');
      return res.redirect(contentManagerUrl('theory', lesson.id));
    }

    cards.splice(cardIndex, 1);
    const savedCards = await Curriculum.updateLessonTheoryCards(lesson.id, cards, {
      expectedTheoryCards: lesson.theory_cards
    });
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!savedCards) {
      setFlash(req, 'danger', 'Bài học đã được xóa ở yêu cầu khác. Vui lòng tải lại.');
      return res.redirect(contentManagerUrl('theory'));
    }
    await ImageStorageService.deleteStoredImagesIfUnreferenced(
      ImageStorageService.differenceImageDescriptors(lesson.theory_cards, savedCards)
    );

    setFlash(req, 'success', 'Đã xóa thẻ lý thuyết.');
    return res.redirect(contentManagerUrl('theory', lesson.id));
  } catch (error) {
    next(error);
  }
}

// H?m lessonQuestions d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function lessonQuestions(req, res, next) {
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    const lesson = await Curriculum.getLessonById(req.params.lessonId);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!lesson) {
      return res.status(404).json({
        ok: false,
        message: 'Không tìm thấy bài học.'
      });
    }

    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 8), 5), 20);
    // Lọc theo độ khó và từ khóa ngay trong một bài: bài 30-40 câu mà chỉ có
    // lật trang tuần tự thì việc tìm một câu cụ thể rất mất thời gian.
    const difficulty = String(req.query.difficulty || '').trim().toUpperCase();
    const keyword = String(req.query.q || '').trim();
    const questionPage = await Question.getQuestionPageByLesson(req.params.lessonId, {
      page,
      limit,
      difficulty,
      keyword
    });

    return res.render('admin/partials/lesson-questions', {
      layout: false,
      lesson,
      questions: questionPage.questions,
      pagination: questionPage.pagination,
      filters: { difficulty, keyword }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Tìm kiếm xuyên toàn bộ ngân hàng câu hỏi theo lớp, độ khó, dạng câu, từ khóa
 * và cờ "chưa có lời giải". Kết quả link thẳng về trang biên soạn của bài chứa
 * câu đó.
 */
async function questionSearch(req, res, next) {
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    const filters = {
      grade: Number(req.query.grade || 0) || null,
      difficulty: String(req.query.difficulty || '').trim().toUpperCase() || null,
      questionType: String(req.query.type || '').trim().toUpperCase() || null,
      keyword: String(req.query.q || '').trim(),
      missingExplanation: req.query.missing_explanation === '1'
    };
    const daLoc = Boolean(
      filters.grade || filters.difficulty || filters.questionType
      || filters.keyword || filters.missingExplanation
    );
    const results = daLoc ? await Question.searchQuestions({ ...filters, limit: 50 }) : [];

    res.render('admin/question-search', {
      title: 'Tìm kiếm câu hỏi',
      filters,
      daLoc,
      results,
      gradeOptions: gradeOptions()
    });
  } catch (error) {
    next(error);
  }
}

// H?m questionEditForm d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function questionEditForm(req, res, next) {
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    const [question, lessons, misconceptions] = await Promise.all([
      Question.getQuestionById(req.params.id),
      Curriculum.getAllLessons(),
      Question.getMisconceptionsByQuestion(req.params.id)
    ]);

    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!question) {
      return res.status(404).send('<div class="empty-state compact danger">Không tìm thấy câu hỏi cần sửa.</div>');
    }

    return res.render('admin/partials/question-edit-form', {
      layout: false,
      question,
      lessons,
      misconceptions
    });
  } catch (error) {
    next(error);
  }
}

// H?m createQuestion d?ng ?? t?o b?n ghi ho?c t?i nguy?n m?i sau khi ki?m tra ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function createQuestion(req, res, next) {
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    normalizeQuestionBody(req.body);
    const authoringMode = normalizeAuthoringMode(req.body.authoring_mode);
    const gridLayout = authoringMode === 'canvas'
      ? parseGridLayout(req.body.grid_layout)
      : parseGridLayout({ enabled: false });
    const files = getUploadFiles(req.files);
    const validation = validateQuestionBody(req.body, files.choiceImages);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (validation) {
      setFlash(req, 'danger', validation);
      return res.redirect(contentManagerUrl('questions', req.body.lesson_id));
    }

    const choices = await buildChoices(req.body, files.choiceImages);
    const misconceptions = buildMisconceptions(choices, req.body.correct_answer, req.body);
    const uploadedQuestionImages = authoringMode === 'canvas'
      ? []
      : await buildQuestionImages(files.questionImages, req.body, {
          idPrefix: 'image',
          widthField: 'image_width_percent',
          altField: 'image_alt_text',
          defaultAlt: 'Hình minh họa'
        });
    const uploadedExplanationImages = authoringMode === 'canvas'
      ? []
      : await buildQuestionImages(files.explanationImages, req.body, {
          idPrefix: 'explanation-image',
          widthField: 'explanation_image_width_percent',
          altField: 'explanation_image_alt_text',
          defaultAlt: 'Hình minh họa lời giải'
        });
    const explanationImages = uploadedExplanationImages;
    const contentText = authoringMode === 'canvas'
      ? ''
      : ensureImagePlaceholders(req.body.content_text, uploadedQuestionImages);
    const questionImages = uploadedQuestionImages;

    await Question.createQuestion({
      lesson_id: Number(req.body.lesson_id),
      question_type: normalizeQuestionType(req.body.question_type),
      difficulty: req.body.difficulty || 'EASY',
      layout_template: normalizeLayoutTemplate(req.body.layout_template),
      content: {
        text: contentText,
        images: questionImages,
        interaction: normalizeQuestionInteraction(req.body.question_interaction),
        layout_variant: normalizeLayoutVariant(req.body.layout_variant || req.body.layout_template),
        grid_layout: gridLayout
      },
      choices,
      correct_answer: String(req.body.correct_answer || '').trim(),
      explanation: {
        text: req.body.explanation_text || 'Chưa có lời giải chi tiết.',
        images: explanationImages
      },
      misconceptions
    });
    commitRequestUploads(req);

    setFlash(req, 'success', 'Đã lưu câu hỏi mới.');
    return res.redirect(contentManagerUrl('questions', req.body.lesson_id));
  } catch (error) {
    next(error);
  }
}

// H?m updateQuestion d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function updateQuestion(req, res, next) {
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    normalizeQuestionBody(req.body);
    const authoringMode = normalizeAuthoringMode(req.body.authoring_mode);
    const gridLayout = authoringMode === 'canvas'
      ? parseGridLayout(req.body.grid_layout)
      : parseGridLayout({ enabled: false });
    const question = await Question.getQuestionById(req.params.id);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!question) {
      setFlash(req, 'danger', 'Không tìm thấy câu hỏi cần sửa.');
      return res.redirect(contentManagerUrl('questions', req.body.lesson_id));
    }

    const files = getUploadFiles(req.files);
    const existingChoices = new Map((question.choices || []).map((choice) => [choice.key, choice]));
    const validation = validateQuestionBody(req.body, files.choiceImages, existingChoices);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (validation) {
      setFlash(req, 'danger', validation);
      return res.redirect(contentManagerUrl('questions', req.body.lesson_id || question.lesson_id));
    }

    const choices = await buildChoices(req.body, files.choiceImages, existingChoices);
    const misconceptions = buildMisconceptions(choices, req.body.correct_answer, req.body);
    const existingImages = Array.isArray(question.content?.images) ? question.content.images : [];
    const removedQuestionImages = getRemovedImages(existingImages, req.body.remove_question_images);
    const keptQuestionImages = filterRemovedImages(existingImages, req.body.remove_question_images);
    const uploadedImages = authoringMode === 'canvas'
      ? []
      : await buildQuestionImages(files.questionImages, req.body, {
          startIndex: maxImageIndex(keptQuestionImages, 'image'),
          idPrefix: 'image',
          widthField: 'image_width_percent',
          altField: 'image_alt_text',
          defaultAlt: 'Hình minh họa'
        });
    const questionImages = authoringMode === 'canvas' ? [] : keptQuestionImages.concat(uploadedImages);
    const existingExplanationImages = Array.isArray(question.explanation?.images) ? question.explanation.images : [];
    const keptExplanationImages = filterRemovedImages(existingExplanationImages, req.body.remove_explanation_images);
    const uploadedExplanationImages = authoringMode === 'canvas'
      ? []
      : await buildQuestionImages(files.explanationImages, req.body, {
          startIndex: maxImageIndex(keptExplanationImages, 'explanation-image'),
          idPrefix: 'explanation-image',
          widthField: 'explanation_image_width_percent',
          altField: 'explanation_image_alt_text',
          defaultAlt: 'Hình minh họa lời giải'
        });
    const contentText = authoringMode === 'canvas'
      ? ''
      : ensureImagePlaceholders(
          stripImagePlaceholders(req.body.content_text, removedQuestionImages),
          uploadedImages
        );

    const payload = {
      lesson_id: Number(req.body.lesson_id),
      question_type: normalizeQuestionType(req.body.question_type),
      difficulty: req.body.difficulty || question.difficulty || 'EASY',
      layout_template: normalizeLayoutTemplate(req.body.layout_template || question.layout_template),
      content: {
        text: contentText,
        images: questionImages,
        interaction: normalizeQuestionInteraction(req.body.question_interaction),
        layout_variant: normalizeLayoutVariant(req.body.layout_variant || req.body.layout_template || question.content?.layout_variant),
        grid_layout: gridLayout
      },
      choices,
      correct_answer: String(req.body.correct_answer || '').trim(),
      explanation: {
        text: req.body.explanation_text || 'Chưa có lời giải chi tiết.',
        images: authoringMode === 'canvas' ? [] : keptExplanationImages.concat(uploadedExplanationImages)
      },
      misconceptions
    };
    const updatedQuestion = await Question.updateQuestion(Number(req.params.id), payload, {
      expectedQuestion: question
    });
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!updatedQuestion) {
      setFlash(req, 'danger', 'Câu hỏi đã được thay đổi hoặc lưu trữ ở yêu cầu khác. Vui lòng tải lại.');
      return res.redirect(contentManagerUrl('questions', req.body.lesson_id || question.lesson_id));
    }
    commitRequestUploads(req);
    await ImageStorageService.deleteStoredImagesIfUnreferenced(
      ImageStorageService.differenceImageDescriptors(question, payload)
    );

    setFlash(req, 'success', 'Đã cập nhật câu hỏi.');
    return res.redirect(contentManagerUrl('questions', req.body.lesson_id));
  } catch (error) {
    next(error);
  }
}

// H?m deleteQuestion d?ng ?? x?a ho?c gi?i ph?ng t?i nguy?n theo ?i?u ki?n an to?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function deleteQuestion(req, res, next) {
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    const question = await Question.getQuestionById(req.params.id);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!question) {
      setFlash(req, 'danger', 'Không tìm thấy câu hỏi cần xóa.');
      return res.redirect(contentManagerUrl('questions', req.body.lesson_id));
    }

    await Question.deleteQuestion(Number(req.params.id));
    setFlash(req, 'success', 'Đã xóa câu hỏi.');
    return res.redirect(contentManagerUrl('questions', req.body.lesson_id || question.lesson_id));
  } catch (error) {
    next(error);
  }
}

/**
 * Nhân bản một câu hỏi trong cùng bài học. Người soạn hay cần một loạt câu cùng
 * khuôn chỉ khác con số; trước đây phải gõ lại từ đầu cả đề, bốn phương án lẫn
 * lời giải. Bản sao được đánh dấu ngay trong đề bài để không bỏ quên hai câu
 * trùng nhau trong ngân hàng, và sao chép cả các lỗi sai thường gặp.
 */
async function duplicateQuestion(req, res, next) {
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    const duplicate = await Question.duplicateQuestion(req.params.id);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!duplicate) {
      setFlash(req, 'danger', 'Không tìm thấy câu hỏi cần nhân bản.');
      return res.redirect(contentManagerUrl('questions', req.body.lesson_id));
    }

    setFlash(req, 'success', `Đã nhân bản câu hỏi #${req.params.id} thành câu #${duplicate.id}. Nhớ sửa lại nội dung bản sao.`);
    return res.redirect(contentManagerUrl('questions', duplicate.lesson_id));
  } catch (error) {
    next(error);
  }
}

// H?m validateQuestionBody d?ng ?? ki?m tra t?nh h?p l? v? c?c ?i?u ki?n an to?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function validateQuestionBody(body, choiceFiles = {}, existingChoices = new Map()) {
  const questionType = normalizeQuestionType(body.question_type);
  const authoringMode = normalizeAuthoringMode(body.authoring_mode);
  const gridLayout = authoringMode === 'canvas' ? parseGridLayout(body.grid_layout) : parseGridLayout({ enabled: false });
  const hasGridLayout = gridLayout.enabled;
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!body.lesson_id || (!body.content_text && !hasGridLayout) || !body.correct_answer) {
    return 'Vui lòng chọn bài học, nhập đề bài và chọn đáp án đúng.';
  }

  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (questionType === 'FILL_IN_THE_BLANK') {
    return null;
  }

  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!ANSWER_KEYS.includes(body.correct_answer)) {
    return 'Đáp án đúng phải là A, B, C hoặc D.';
  }

  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (gridHasAnswerOptions(gridLayout, body.correct_answer)) {
    return null;
  }

  const choiceSummaries = ANSWER_KEYS.map((key) => {
    const existingImages = filterRemovedImages(existingChoices.get(key)?.images || [], body[`remove_choice_images_${key}`]);
    const uploadedImages = choiceFiles[key] || [];
    return {
      key,
      text: String(body[`choice_${key}`] || '').trim(),
      imageCount: existingImages.length + uploadedImages.length
    };
  });

  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (choiceSummaries.some((choice) => !choice.text && choice.imageCount === 0)) {
    return 'Mỗi phương án A, B, C, D cần có nội dung chữ hoặc ảnh minh họa.';
  }

  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (body.layout_template === 'IMAGE_IN_CHOICES' && choiceSummaries.every((choice) => choice.imageCount === 0)) {
    return 'Bố cục ảnh trong đáp án cần có ít nhất một ảnh ở các phương án.';
  }

  return null;
}

// H?m gridHasAnswerOptions d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function gridHasAnswerOptions(gridLayout, correctAnswer = '') {
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!gridLayout?.enabled) return false;
  const keys = new Set(
    (gridLayout.cells || [])
      .filter((cell) => cell.type === 'answer')
      .map((cell) => cell.answer_key)
      .filter(Boolean)
  );
  return keys.size >= 2 && keys.has(String(correctAnswer || '').trim().toUpperCase());
}

// H?m normalizeQuestionBody d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function normalizeQuestionBody(body) {
  body.question_type = normalizeQuestionType(body.question_type);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (body.question_type === 'FILL_IN_THE_BLANK') {
    body.correct_answer = String(body.correct_answer_free || body.correct_answer || '').trim();
    body.layout_template = normalizeLayoutTemplate(body.layout_template || body.layout_variant);
    body.question_interaction = body.question_interaction || 'fill_blank';
    return body;
  }

  body.layout_template = normalizeLayoutTemplate(body.layout_template || body.layout_variant);
  return body;
}

// H?m buildChoices d?ng ?? x?y d?ng k?t qu? t? c?c ngu?n d? li?u v? quy t?c li?n quan; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function buildChoices(body, choiceFiles = {}, existingChoices = new Map()) {
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (normalizeQuestionType(body.question_type) === 'FILL_IN_THE_BLANK') {
    return [];
  }

  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (normalizeAuthoringMode(body.authoring_mode) === 'canvas' && gridHasAnswerOptions(parseGridLayout(body.grid_layout), body.correct_answer)) {
    return [];
  }

  const choices = [];

  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const key of ANSWER_KEYS) {
    const existingChoice = existingChoices.get(key) || {};
    const existingImages = Array.isArray(existingChoice.images) ? existingChoice.images : [];
    const keptImages = filterRemovedImages(existingImages, body[`remove_choice_images_${key}`]);
    const uploadedImages = await buildQuestionImages(choiceFiles[key] || [], body, {
      startIndex: maxImageIndex(keptImages, `choice-${key}-image`),
      idPrefix: `choice-${key}-image`,
      widthField: `choice_image_width_percent_${key}`,
      altField: `choice_image_alt_text_${key}`,
      defaultAlt: `Hình minh họa đáp án ${key}`,
      folder: 'math-revision/choices'
    });

    choices.push({
      key,
      text: String(body[`choice_${key}`] || '').trim(),
      images: keptImages.concat(uploadedImages)
    });
  }

  return choices;
}

// H?m buildMisconceptions d?ng ?? x?y d?ng k?t qu? t? c?c ngu?n d? li?u v? quy t?c li?n quan; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function buildMisconceptions(choices, correctAnswer, body) {
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (normalizeQuestionType(body.question_type) === 'FILL_IN_THE_BLANK') {
    return [];
  }

  return choices
    .filter((choice) => choice.key !== correctAnswer)
    .map((choice) => ({
      distractor_key: choice.key,
      misconception_name: body[`misconception_name_${choice.key}`] || `Lỗi khi chọn đáp án ${choice.key}`,
      explanation: body[`misconception_${choice.key}`] || ''
    }))
    .filter((item) => item.explanation.trim());
}

// H?m normalizeQuestionType d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function normalizeQuestionType(value) {
  const type = String(value || 'MULTIPLE_CHOICE').trim().toUpperCase();
  return QUESTION_TYPES.includes(type) ? type : 'MULTIPLE_CHOICE';
}

// H?m normalizeLayoutTemplate d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function normalizeLayoutTemplate(value) {
  const layout = String(value || 'STACK_VERTICAL').trim().toUpperCase();
  return LAYOUT_TEMPLATES.includes(layout) ? layout : 'STACK_VERTICAL';
}

// H?m normalizeLayoutVariant d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function normalizeLayoutVariant(value) {
  const layout = String(value || 'STACK_VERTICAL').trim().toUpperCase();
  return LAYOUT_VARIANTS.includes(layout) ? layout : normalizeLayoutTemplate(value);
}

// H?m normalizeQuestionInteraction d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function normalizeQuestionInteraction(value) {
  const interaction = String(value || '').trim();
  return ['none', 'choose', 'fill_blank', 'count', 'compare'].includes(interaction) ? interaction : 'none';
}

// H?m normalizeAuthoringMode d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function normalizeAuthoringMode(value) {
  return String(value || '').trim() === 'canvas' ? 'canvas' : 'fields';
}

// H?m buildQuestionBankTree d?ng ?? x?y d?ng k?t qu? t? c?c ngu?n d? li?u v? quy t?c li?n quan; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function buildQuestionBankTree(lessons, questionCounts) {
  const gradeMap = new Map();
  const lessonMap = new Map();
  const countMap = new Map(
    (questionCounts || []).map((row) => [Number(row.lesson_id), Number(row.question_count || 0)])
  );

  // H?m ensureGrade d?ng ?? ki?m tra t?nh h?p l? v? c?c ?i?u ki?n an to?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  const ensureGrade = (grade) => {
    const key = String(grade || 'Chưa phân loại');
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!gradeMap.has(key)) {
      gradeMap.set(key, {
        grade: key,
        chapters: [],
        chapterMap: new Map(),
        questionCount: 0
      });
    }
    return gradeMap.get(key);
  };

  // H?m ensureChapter d?ng ?? ki?m tra t?nh h?p l? v? c?c ?i?u ki?n an to?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  const ensureChapter = (gradeGroup, lesson) => {
    const key = String(lesson.chapter_id || lesson.chapter_name || 'Chưa có chương');
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!gradeGroup.chapterMap.has(key)) {
      const chapter = {
        id: lesson.chapter_id || key,
        chapter_name: lesson.chapter_name || 'Chưa có chương',
        chapter_sort_order: Number(lesson.chapter_sort_order || 0),
        lessons: [],
        questionCount: 0
      };
      gradeGroup.chapterMap.set(key, chapter);
      gradeGroup.chapters.push(chapter);
    }
    return gradeGroup.chapterMap.get(key);
  };

  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const lesson of lessons) {
    const gradeGroup = ensureGrade(lesson.grade);
    const chapter = ensureChapter(gradeGroup, lesson);
    const lessonNode = {
      ...lesson,
      questions: [],
      questionCount: countMap.get(Number(lesson.id)) || 0
    };
    lessonMap.set(Number(lesson.id), lessonNode);
    chapter.lessons.push(lessonNode);
  }

  const grades = Array.from(gradeMap.values()).sort((a, b) => Number(a.grade) - Number(b.grade));
  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const grade of grades) {
    grade.chapters.sort((a, b) => Number(a.chapter_sort_order) - Number(b.chapter_sort_order));
    // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
    for (const chapter of grade.chapters) {
      chapter.lessons.sort((a, b) => Number(a.lesson_sort_order) - Number(b.lesson_sort_order));
      // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
      for (const lesson of chapter.lessons) {
        lesson.questions = [];
      }
      chapter.questionCount = chapter.lessons.reduce((sum, lesson) => sum + lesson.questionCount, 0);
    }
    grade.questionCount = grade.chapters.reduce((sum, chapter) => sum + chapter.questionCount, 0);
  }

  return grades;
}

// H?m buildBookTree d?ng ?? x?y d?ng k?t qu? t? c?c ngu?n d? li?u v? quy t?c li?n quan; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function buildBookTree(questionBankTree) {
  const books = [];

  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const gradeGroup of questionBankTree) {
    const grade = Number(gradeGroup.grade);
    const chapters = gradeGroup.chapters || [];
    const parts = grade === 1 ? [chapters] : splitChaptersIntoVolumes(chapters);

    parts.forEach((partChapters, index) => {
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (partChapters.length === 0) return;
      const volume = grade === 1 ? null : index + 1;
      const questionCount = partChapters.reduce((sum, chapter) => sum + chapter.questionCount, 0);
      const lessonCount = partChapters.reduce((sum, chapter) => sum + chapter.lessons.length, 0);

      books.push({
        id: volume ? `math-${grade}-tap-${volume}` : `math-${grade}`,
        title: volume ? `Toán ${grade} tập ${volume}` : `Toán ${grade}`,
        grade,
        volume,
        chapters: partChapters,
        chapterCount: partChapters.length,
        lessonCount,
        questionCount
      });
    });
  }

  return books.sort((a, b) => (a.grade - b.grade) || ((a.volume || 0) - (b.volume || 0)));
}

// H?m buildTheoryTree d?ng ?? x?y d?ng k?t qu? t? c?c ngu?n d? li?u v? quy t?c li?n quan; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function buildTheoryTree(lessons, theoryCounts) {
  const gradeMap = new Map();
  const countMap = new Map(
    (theoryCounts || []).map((row) => [Number(row.lesson_id), Number(row.theory_count || 0)])
  );

  // H?m ensureGrade d?ng ?? ki?m tra t?nh h?p l? v? c?c ?i?u ki?n an to?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  const ensureGrade = (grade) => {
    const key = String(grade || 'Chưa phân loại');
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!gradeMap.has(key)) {
      gradeMap.set(key, {
        grade: key,
        chapters: [],
        chapterMap: new Map(),
        theoryCount: 0
      });
    }
    return gradeMap.get(key);
  };

  // H?m ensureChapter d?ng ?? ki?m tra t?nh h?p l? v? c?c ?i?u ki?n an to?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  const ensureChapter = (gradeGroup, lesson) => {
    const key = String(lesson.chapter_id || lesson.chapter_name || 'Chưa có chương');
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!gradeGroup.chapterMap.has(key)) {
      const chapter = {
        id: lesson.chapter_id || key,
        chapter_name: lesson.chapter_name || 'Chưa có chương',
        chapter_sort_order: Number(lesson.chapter_sort_order || 0),
        lessons: [],
        theoryCount: 0
      };
      gradeGroup.chapterMap.set(key, chapter);
      gradeGroup.chapters.push(chapter);
    }
    return gradeGroup.chapterMap.get(key);
  };

  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const lesson of lessons) {
    const gradeGroup = ensureGrade(lesson.grade);
    const chapter = ensureChapter(gradeGroup, lesson);
    chapter.lessons.push({
      ...lesson,
      theoryCount: countMap.get(Number(lesson.id)) || 0
    });
  }

  const grades = Array.from(gradeMap.values()).sort((a, b) => Number(a.grade) - Number(b.grade));
  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const grade of grades) {
    grade.chapters.sort((a, b) => Number(a.chapter_sort_order) - Number(b.chapter_sort_order));
    // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
    for (const chapter of grade.chapters) {
      chapter.lessons.sort((a, b) => Number(a.lesson_sort_order) - Number(b.lesson_sort_order));
      chapter.theoryCount = chapter.lessons.reduce((sum, lesson) => sum + Number(lesson.theoryCount || 0), 0);
    }
    grade.theoryCount = grade.chapters.reduce((sum, chapter) => sum + Number(chapter.theoryCount || 0), 0);
  }

  return grades;
}

// H?m buildTheoryBookTree d?ng ?? x?y d?ng k?t qu? t? c?c ngu?n d? li?u v? quy t?c li?n quan; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function buildTheoryBookTree(theoryTree) {
  const books = [];

  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const gradeGroup of theoryTree) {
    const grade = Number(gradeGroup.grade);
    const chapters = gradeGroup.chapters || [];
    const parts = grade === 1 ? [chapters] : splitChaptersIntoVolumes(chapters);

    parts.forEach((partChapters, index) => {
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (partChapters.length === 0) return;
      const volume = grade === 1 ? null : index + 1;
      books.push({
        id: volume ? `math-${grade}-tap-${volume}` : `math-${grade}`,
        title: volume ? `Toán ${grade} tập ${volume}` : `Toán ${grade}`,
        grade,
        volume,
        chapters: partChapters,
        chapterCount: partChapters.length,
        lessonCount: partChapters.reduce((sum, chapter) => sum + chapter.lessons.length, 0),
        theoryCount: partChapters.reduce((sum, chapter) => sum + Number(chapter.theoryCount || 0), 0)
      });
    });
  }

  return books.sort((a, b) => (a.grade - b.grade) || ((a.volume || 0) - (b.volume || 0)));
}

// H?m splitChaptersIntoVolumes d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function splitChaptersIntoVolumes(chapters) {
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (chapters.length <= 1) return [chapters, []];
  const midpoint = Math.ceil(chapters.length / 2);
  return [chapters.slice(0, midpoint), chapters.slice(midpoint)];
}

// H?m getUploadFiles d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function getUploadFiles(files) {
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (Array.isArray(files)) {
    return {
      questionImages: files,
      explanationImages: [],
      choiceImages: {}
    };
  }

  return {
    questionImages: files?.question_images || [],
    explanationImages: files?.explanation_images || [],
    choiceImages: ANSWER_KEYS.reduce((result, key) => {
      result[key] = files?.[`choice_image_${key}`] || [];
      return result;
    }, {})
  };
}

// H?m buildQuestionImages d?ng ?? x?y d?ng k?t qu? t? c?c ngu?n d? li?u v? quy t?c li?n quan; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function buildQuestionImages(files, body, options = {}) {
  const startIndex = Number(options.startIndex || 0);
  const idPrefix = options.idPrefix || 'image';
  const widthField = options.widthField || 'image_width_percent';
  const altField = options.altField || 'image_alt_text';
  const defaultAlt = options.defaultAlt || 'Hình minh họa';
  const widthPercent = normalizeWidthPercent(body[widthField]);
  const altTexts = Array.isArray(body[altField])
    ? body[altField]
    : files.map(() => body[altField] || '');

  const images = [];
  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const [index, file] of files.entries()) {
    const storedImage = await ImageStorageService.storeQuestionImage(file, {
      folder: options.folder || 'math-revision/questions'
    });
    const imageNumber = startIndex + index + 1;
    images.push({
      id: `${idPrefix}-${imageNumber}`,
      url: storedImage.url,
      width_percent: widthPercent,
      alt_text: altTexts[index] || `${defaultAlt} ${imageNumber}`,
      storage_provider: storedImage.storage_provider,
      public_id: storedImage.public_id,
      cloud_name: storedImage.cloud_name
    });
    file.readyToCommit = true;
  }
  return images;
}

// H?m normalizeWidthPercent d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function normalizeWidthPercent(value) {
  const width = Number(value || 70);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!Number.isFinite(width)) return 70;
  return Math.min(Math.max(Math.round(width), 20), 100);
}

// H?m normalizeRemoveIds d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function normalizeRemoveIds(value) {
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (Array.isArray(value)) return new Set(value.map(String));
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (value == null || value === '') return new Set();
  return new Set([String(value)]);
}

// H?m filterRemovedImages d?ng ?? x?a ho?c gi?i ph?ng t?i nguy?n theo ?i?u ki?n an to?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function filterRemovedImages(images, removeValue) {
  const removeIds = normalizeRemoveIds(removeValue);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (removeIds.size === 0) return images;
  return images.filter((image) => !removeIds.has(String(image.id || image.url || '')));
}

// H?m getRemovedImages d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function getRemovedImages(images, removeValue) {
  const removeIds = normalizeRemoveIds(removeValue);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (removeIds.size === 0) return [];
  return images.filter((image) => removeIds.has(String(image.id || image.url || '')));
}

// H?m maxImageIndex d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function maxImageIndex(images, idPrefix) {
  const pattern = new RegExp(`^${escapeRegExp(idPrefix)}-(\\d+)$`);
  return (images || []).reduce((max, image) => {
    const match = String(image.id || '').match(pattern);
    return match ? Math.max(max, Number(match[1]) || 0) : max;
  }, 0);
}

// H?m escapeRegExp d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// H?m stripImagePlaceholders d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function stripImagePlaceholders(contentText, images) {
  let text = contentText || '';
  (images || []).forEach((image) => {
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (image.id) text = text.replaceAll(`[${image.id}]`, '');
  });
  return text;
}

// H?m ensureImagePlaceholders d?ng ?? ki?m tra t?nh h?p l? v? c?c ?i?u ki?n an to?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function ensureImagePlaceholders(contentText, images) {
  let text = contentText || '';
  const missingPlaceholders = images
    .filter((image) => !text.includes(`[${image.id}]`))
    .map((image) => `[${image.id}]`);

  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (missingPlaceholders.length > 0) {
    text = `${text}\n\n${missingPlaceholders.join('\n')}`;
  }

  return text;
}

// H?m students d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function students(req, res, next) {
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    const filterGrade = isSupportedGrade(req.query.grade) ? Number(req.query.grade) : null;
    const page = Math.max(Number(req.query.page || 1), 1);
    const result = await Student.listStudentsPaged({
      search: req.query.q || '',
      grade: filterGrade,
      page,
      limit: 20
    });

    res.render('admin/students', {
      title: 'Quản lý tài khoản học sinh',
      students: result.students,
      pagination: result.pagination,
      query: req.query.q || '',
      filterGrade,
      gradeOptions: gradeOptions()
    });
  } catch (error) {
    next(error);
  }
}

// H?m studentsRedirectUrl d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function studentsRedirectUrl(req) {
  const params = new URLSearchParams();
  const query = String(req.body.q || '').trim();
  const grade = Number(req.body.grade);
  const page = Math.max(Number(req.body.page || 1), 1);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (query) params.set('q', query);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (isSupportedGrade(grade)) params.set('grade', String(grade));
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (page > 1) params.set('page', String(page));
  const queryString = params.toString();
  return queryString ? `/admin/students?${queryString}` : '/admin/students';
}

// H?m updateStudentStatus d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function updateStudentStatus(req, res, next) {
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    const student = await Student.findById(req.params.id);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!student) {
      setFlash(req, 'danger', 'Không tìm thấy tài khoản học sinh cần cập nhật.');
      return res.redirect(studentsRedirectUrl(req));
    }

    const rawStatus = String(req.body.is_active || '');
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!['0', '1'].includes(rawStatus)) {
      setFlash(req, 'danger', 'Trạng thái tài khoản không hợp lệ.');
      return res.redirect(studentsRedirectUrl(req));
    }

    const isActive = rawStatus === '1';
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (Number(student.is_active ?? 1) === Number(isActive)) {
      setFlash(req, 'warning', `Tài khoản ${student.username} đã ở trạng thái được chọn.`);
      return res.redirect(studentsRedirectUrl(req));
    }

    await Student.updateActiveStatus(student.id, isActive);
    setFlash(
      req,
      'success',
      isActive
        ? `Đã mở lại tài khoản ${student.username}.`
        : `Đã tạm khóa tài khoản ${student.username}.`
    );
    return res.redirect(studentsRedirectUrl(req));
  } catch (error) {
    return next(error);
  }
}

// H?m resetStudentPassword d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function resetStudentPassword(req, res, next) {
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    const student = await Student.findById(req.params.id);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!student) {
      setFlash(req, 'danger', 'Không tìm thấy tài khoản học sinh cần đặt mật khẩu tạm.');
      return res.redirect(studentsRedirectUrl(req));
    }

    const temporaryPassword = String(req.body.temporary_password || '');
    const confirmPassword = String(req.body.confirm_password || '');
    const passwordError = validatePassword(temporaryPassword);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (passwordError) {
      setFlash(req, 'danger', passwordError);
      return res.redirect(studentsRedirectUrl(req));
    }
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (temporaryPassword !== confirmPassword) {
      setFlash(req, 'danger', 'Mật khẩu xác nhận không khớp.');
      return res.redirect(studentsRedirectUrl(req));
    }

    // updatePassword luôn tạo bcrypt hash mới. Middleware xác thực gắn phiên JWT với
    // credential_version sinh từ hash, vì vậy mọi JWT học sinh đang giữ sẽ mất hiệu lực.
    await Student.updatePassword(student.id, temporaryPassword);
    setFlash(
      req,
      'success',
      `Đã đặt mật khẩu tạm cho ${student.username}. Hãy chuyển riêng mật khẩu này cho học sinh.`
    );
    return res.redirect(studentsRedirectUrl(req));
  } catch (error) {
    return next(error);
  }
}

// H?m updateStudentGrade d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function updateStudentGrade(req, res, next) {
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    const student = await Student.findById(req.params.id);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!student) {
      setFlash(req, 'danger', 'Không tìm thấy tài khoản học sinh cần đổi khối.');
      return res.redirect(studentsRedirectUrl(req));
    }

    const grade = Number(req.body.current_grade);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!isSupportedGrade(grade)) {
      setFlash(req, 'danger', `Khối lớp phải nằm trong phạm vi ${GRADE_RANGE_LABEL}.`);
      return res.redirect(studentsRedirectUrl(req));
    }
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (Number(student.current_grade) === grade) {
      setFlash(req, 'warning', `${student.username} đang ở lớp ${grade}, không có gì thay đổi.`);
      return res.redirect(studentsRedirectUrl(req));
    }

    const updateResult = await Student.updateCurrentGrade(student.id, grade);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!updateResult) {
      setFlash(req, 'danger', 'Tài khoản học sinh không còn tồn tại.');
      return res.redirect(studentsRedirectUrl(req));
    }
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!updateResult.changed) {
      setFlash(req, 'warning', `${student.username} đang ở lớp ${grade}, không có gì thay đổi.`);
      return res.redirect(studentsRedirectUrl(req));
    }

    const completedCount = Number(updateResult.completedSessionCount || 0);
    setFlash(
      req,
      'success',
      `Đã chuyển ${student.username} từ lớp ${updateResult.previousGrade} sang lớp ${grade}. `
      + (completedCount > 0
        ? `Đã kết thúc ${completedCount} bài đang làm của lớp cũ; lịch sử học tập vẫn được giữ nguyên.`
        : 'Lịch sử học tập trước đây vẫn được giữ nguyên.')
    );
    return res.redirect(studentsRedirectUrl(req));
  } catch (error) {
    return next(error);
  }
}

/* ---------------------------------------------------------------------------
   Chức năng AD-01: quản lý khung chương trình
   ------------------------------------------------------------------------- */

/**
 * Địa chỉ quay về trang khung chương trình. openChapterId là chương cần mở sẵn
 * sau khi tải lại: mọi thao tác lưu ở trang này đều là full POST rồi redirect,
 * không kèm tham số này thì mọi <details> đóng sập lại và admin sửa 10 bài học
 * phải tự tìm lại vị trí 10 lần.
 */
function curriculumUrl(grade, openChapterId = null) {
  const base = `/admin/curriculum?grade=${Number(grade)}`;
  return openChapterId ? `${base}&open=${Number(openChapterId)}#chapter-${Number(openChapterId)}` : base;
}

// H?m curriculum d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function curriculum(req, res, next) {
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    const grade = isSupportedGrade(req.query.grade) ? Number(req.query.grade) : 1;
    // Một truy vấn cho tất cả bài học của khối rồi gom theo chương, thay vì
    // mỗi chương một truy vấn riêng.
    const [chapters, lessons, nextChapterOrder] = await Promise.all([
      Curriculum.listChaptersForAdmin(grade),
      Curriculum.listLessonsForAdminByGrade(grade),
      Curriculum.nextChapterSortOrder(grade)
    ]);
    const lessonsByChapter = {};
    chapters.forEach((chapter) => {
      lessonsByChapter[chapter.id] = [];
    });
    lessons.forEach((lesson) => {
      (lessonsByChapter[lesson.chapter_id] = lessonsByChapter[lesson.chapter_id] || []).push(lesson);
    });

    res.render('admin/curriculum', {
      title: 'Khung chương trình',
      grade,
      gradeOptions: gradeOptions(),
      chapters,
      lessonsByChapter,
      // Chương cần mở sẵn sau một thao tác lưu, đọc từ ?open= do curriculumUrl gắn.
      openChapterId: Number(req.query.open || 0) || null,
      nextChapterOrder
    });
  } catch (error) {
    next(error);
  }
}

// H?m createChapter d?ng ?? t?o b?n ghi ho?c t?i nguy?n m?i sau khi ki?m tra ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function createChapter(req, res, next) {
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    const grade = isSupportedGrade(req.body.grade) ? Number(req.body.grade) : null;
    const chapterName = String(req.body.chapter_name || '').trim();

    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!grade) {
      setFlash(req, 'danger', `Khối lớp phải nằm trong phạm vi ${GRADE_RANGE_LABEL}.`);
      return res.redirect(curriculumUrl(req.body.grade || 1));
    }
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!chapterName) {
      setFlash(req, 'danger', 'Vui lòng nhập tên chương.');
      return res.redirect(curriculumUrl(grade));
    }

    const newChapterId = await Curriculum.createChapter({
      grade,
      semester: req.body.semester,
      chapterName,
      sortOrder: req.body.sort_order
    });
    setFlash(req, 'success', `Đã thêm chương "${chapterName}" vào lớp ${grade}.`);
    return res.redirect(curriculumUrl(grade, newChapterId));
  } catch (error) {
    next(error);
  }
}

// H?m updateChapter d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function updateChapter(req, res, next) {
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    const chapter = await Curriculum.getChapterById(req.params.id);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!chapter) {
      setFlash(req, 'danger', 'Không tìm thấy chương cần cập nhật.');
      return res.redirect(curriculumUrl(req.body.grade || 1));
    }

    const chapterName = String(req.body.chapter_name || '').trim();
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!chapterName) {
      setFlash(req, 'danger', 'Tên chương không được để trống.');
      return res.redirect(curriculumUrl(chapter.grade, chapter.id));
    }

    await Curriculum.updateChapter(chapter.id, {
      semester: req.body.semester,
      chapterName,
      sortOrder: req.body.sort_order
    });
    setFlash(req, 'success', `Đã cập nhật chương "${chapterName}".`);
    return res.redirect(curriculumUrl(chapter.grade, chapter.id));
  } catch (error) {
    next(error);
  }
}

// H?m deleteChapter d?ng ?? x?a ho?c gi?i ph?ng t?i nguy?n theo ?i?u ki?n an to?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function deleteChapter(req, res, next) {
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    const chapter = await Curriculum.getChapterById(req.params.id);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!chapter) {
      setFlash(req, 'danger', 'Không tìm thấy chương cần xóa.');
      return res.redirect(curriculumUrl(req.body.grade || 1));
    }

    // Một câu lệnh DELETE có điều kiện vừa kiểm tra vừa xóa, nên bài học mới
    // được tạo đồng thời không thể lọt vào giữa hai thao tác và bị cascade.
    const deleted = await Curriculum.deleteChapterIfEmpty(chapter.id);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!deleted) {
      const lessonCount = await Curriculum.countLessonsInChapter(chapter.id);
      setFlash(
        req,
        'danger',
        lessonCount > 0
          ? `Không thể xóa chương đang chứa ${lessonCount} bài học. Vui lòng xóa hết bài học con trước.`
          : 'Chương đã được thay đổi hoặc xóa ở yêu cầu khác. Vui lòng tải lại.'
      );
      return res.redirect(curriculumUrl(chapter.grade, chapter.id));
    }

    setFlash(req, 'success', `Đã xóa chương "${chapter.chapter_name}".`);
    return res.redirect(curriculumUrl(chapter.grade));
  } catch (error) {
    next(error);
  }
}

// H?m createLesson d?ng ?? t?o b?n ghi ho?c t?i nguy?n m?i sau khi ki?m tra ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function createLesson(req, res, next) {
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    const chapter = await Curriculum.getChapterById(req.body.chapter_id);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!chapter) {
      setFlash(req, 'danger', 'Không tìm thấy chương để thêm bài học.');
      return res.redirect(curriculumUrl(req.body.grade || 1));
    }

    const lessonName = String(req.body.lesson_name || '').trim();
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!lessonName) {
      setFlash(req, 'danger', 'Vui lòng nhập tên bài học.');
      return res.redirect(curriculumUrl(chapter.grade, chapter.id));
    }

    await Curriculum.createLesson({
      chapterId: chapter.id,
      lessonName,
      sortOrder: req.body.sort_order
    });
    setFlash(req, 'success', `Đã thêm bài học "${lessonName}" vào chương "${chapter.chapter_name}".`);
    return res.redirect(curriculumUrl(chapter.grade, chapter.id));
  } catch (error) {
    next(error);
  }
}

// H?m updateLesson d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function updateLesson(req, res, next) {
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    const lesson = await Curriculum.getLessonById(req.params.id);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!lesson) {
      setFlash(req, 'danger', 'Không tìm thấy bài học cần cập nhật.');
      return res.redirect(curriculumUrl(req.body.grade || 1));
    }

    const lessonName = String(req.body.lesson_name || '').trim();
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!lessonName) {
      setFlash(req, 'danger', 'Tên bài học không được để trống.');
      return res.redirect(curriculumUrl(lesson.grade, lesson.chapter_id));
    }

    await Curriculum.updateLesson(lesson.id, {
      lessonName,
      sortOrder: req.body.sort_order
    });
    setFlash(req, 'success', `Đã cập nhật bài học "${lessonName}".`);
    return res.redirect(curriculumUrl(lesson.grade, lesson.chapter_id));
  } catch (error) {
    next(error);
  }
}

// H?m deleteLesson d?ng ?? x?a ho?c gi?i ph?ng t?i nguy?n theo ?i?u ki?n an to?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function deleteLesson(req, res, next) {
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    const lesson = await Curriculum.getLessonById(req.params.id);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!lesson) {
      setFlash(req, 'danger', 'Không tìm thấy bài học cần xóa.');
      return res.redirect(curriculumUrl(req.body.grade || 1));
    }

    // Khóa hàng bài học, kiểm tra câu hỏi và xóa trong cùng transaction. Ảnh
    // trả về là ảnh thực tế ở thời điểm xóa, không phải snapshot cũ của form.
    const deletion = await Curriculum.deleteLessonIfEmpty(lesson.id);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!deletion.deleted) {
      const questionCount = await Curriculum.countQuestionsInLesson(lesson.id);
      setFlash(
        req,
        'danger',
        questionCount > 0
          ? `Không thể xóa bài học vì còn ${questionCount} câu hỏi, kể cả câu hỏi đã lưu trữ. Hệ thống giữ bài học để bảo toàn lịch sử làm bài.`
          : 'Bài học đã được thay đổi hoặc xóa ở yêu cầu khác. Vui lòng tải lại.'
      );
      return res.redirect(curriculumUrl(lesson.grade, lesson.chapter_id));
    }

    await ImageStorageService.deleteStoredImagesIfUnreferenced(deletion.theoryCards);
    setFlash(req, 'success', `Đã xóa bài học "${lesson.lesson_name}".`);
    return res.redirect(curriculumUrl(lesson.grade, lesson.chapter_id));
  } catch (error) {
    next(error);
  }
}

// Chức năng AD-08: giám sát nội dung hội thoại giữa học sinh và AI.
async function aiLogs(req, res, next) {
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    const filters = AIConversationLog.normalizeLogFilters({
      sessionType: req.query.type,
      studentId: req.query.student_id,
      lessonId: req.query.lesson_id,
      from: req.query.from,
      to: req.query.to,
      onlyFlagged: req.query.flagged
    });

    const [result, stats, studentList, lessons] = await Promise.all([
      AIConversationLog.listLogs({
        page: req.query.page,
        limit: 20,
        ...filters
      }),
      AIConversationLog.getLogStats(filters),
      Student.listStudents(''),
      Curriculum.getAllLessons()
    ]);

    res.render('admin/ai-logs', {
      title: 'Nhật ký hội thoại AI',
      logs: result.logs,
      pagination: result.pagination,
      stats,
      students: studentList,
      lessons,
      filters
    });
  } catch (error) {
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (error.code === 'INVALID_AI_LOG_FILTER') {
      setFlash(req, 'danger', error.message);
      return res.redirect('/admin/logs/ai');
    }
    next(error);
  }
}

// H?m flagAiLog d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function flagAiLog(req, res, next) {
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    const flagged = String(req.body.flagged || '1') === '1';
    const updated = await AIConversationLog.setFlagged(req.params.id, flagged);

    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!updated) {
      setFlash(req, 'danger', 'Không tìm thấy hội thoại cần đánh dấu.');
    } else {
      setFlash(
        req,
        'success',
        flagged
          ? 'Đã đánh dấu hội thoại này là AI trả lời chưa đúng kiến thức.'
          : 'Đã bỏ đánh dấu cho hội thoại này.'
      );
    }

    return res.redirect(safeAdminReturnTo(req.body.return_to, '/admin/logs/ai'));
  } catch (error) {
    next(error);
  }
}

// H?m settings d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function settings(req, res, next) {
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    const settings = await SystemSetting.getSettings();
    res.render('admin/settings', {
      title: 'Cài đặt hệ thống',
      settings: SystemSetting.publicSettings(settings)
    });
  } catch (error) {
    next(error);
  }
}

// H?m updateSettings d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function updateSettings(req, res, next) {
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    await SystemSetting.updateSettings({
      practice_duration_5_minutes: req.body.practice_duration_5_minutes,
      practice_duration_15_minutes: req.body.practice_duration_15_minutes,
      practice_duration_20_minutes: req.body.practice_duration_20_minutes,
      ai_provider: req.body.ai_provider,
      ai_automation_enabled: req.body.ai_automation_enabled,
      ai_json_timeout_ms: req.body.ai_json_timeout_ms,
      ai_enabled_grades: req.body.ai_enabled_grades,
      ai_max_hints_per_question: req.body.ai_max_hints_per_question,
      ai_max_hints_per_session: req.body.ai_max_hints_per_session,
      ai_max_requests_per_student_per_day: req.body.ai_max_requests_per_student_per_day,
      ai_require_answer_before_help: req.body.ai_require_answer_before_help,
      ai_log_retention_days: req.body.ai_log_retention_days,
      openai_api_key: req.body.openai_api_key,
      openai_base_url: req.body.openai_base_url,
      openai_model: req.body.openai_model,
      openai_vision_model: req.body.openai_vision_model,
      openai_embedding_model: req.body.openai_embedding_model,
      gemini_api_key: req.body.gemini_api_key,
      gemini_model: req.body.gemini_model,
      gemini_cli_model: req.body.gemini_cli_model,
      gemini_cli_timeout_ms: req.body.gemini_cli_timeout_ms,
      nvidia_nim_api_key: req.body.nvidia_nim_api_key,
      nvidia_nim_base_url: req.body.nvidia_nim_base_url,
      nvidia_nim_model: req.body.nvidia_nim_model,
      nvidia_nim_vision_model: req.body.nvidia_nim_vision_model,
      nvidia_nim_embedding_model: req.body.nvidia_nim_embedding_model,
      openrouter_api_key: req.body.openrouter_api_key,
      openrouter_base_url: req.body.openrouter_base_url,
      openrouter_model: req.body.openrouter_model,
      cloudinary_cloud_name: req.body.cloudinary_cloud_name,
      cloudinary_api_key: req.body.cloudinary_api_key,
      cloudinary_api_secret: req.body.cloudinary_api_secret
    });
    setFlash(req, 'success', 'Đã cập nhật cấu hình hệ thống.');
    return res.redirect('/admin/settings');
  } catch (error) {
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (['INVALID_PRACTICE_DURATION', 'INVALID_SYSTEM_SETTING'].includes(error.code)) {
      setFlash(req, 'danger', error.message, { modal: true });
      return res.redirect('/admin/settings');
    }
    next(error);
  }
}

// H?m checkSettings d?ng ?? ki?m tra t?nh h?p l? v? c?c ?i?u ki?n an to?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function checkSettings(req, res, next) {
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    const result = await ProviderCheckService.checkProvider(req.body.provider, req.body);
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (error) {
    next(error);
  }
}

// H?m buildSingleTheoryCard d?ng ?? x?y d?ng k?t qu? t? c?c ngu?n d? li?u v? quy t?c li?n quan; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function buildSingleTheoryCard(body, files, cardIndex = 0, existingCard = null) {
  const authoringMode = normalizeAuthoringMode(body.authoring_mode);
  const existingImages = filterRemovedImages(
    Array.isArray(existingCard?.images) ? existingCard.images : [],
    body.remove_theory_images
  );
  const uploadedImages = authoringMode === 'canvas'
    ? []
    : await buildTheoryImages(
        files || [],
        cardIndex,
        maxImageIndex(existingImages, `theory-${cardIndex + 1}-image`)
      );
  const gridLayout = authoringMode === 'canvas'
    ? parseGridLayout(body.grid_layout)
    : parseGridLayout({ enabled: false });

  return {
    title: body.title || '',
    type: normalizeTheoryType(body.type),
    layout: normalizeTheoryLayout(body.layout),
    display_text: body.display_text || '',
    body: body.body || '',
    example: body.example || '',
    student_task: body.student_task || '',
    remember: body.remember || '',
    interaction: normalizeTheoryInteraction(body.interaction),
    grid_layout: gridLayout,
    images: authoringMode === 'canvas' ? [] : [...existingImages, ...uploadedImages]
  };
}

// H?m hasTheoryCardContent d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function hasTheoryCardContent(card) {
  return Boolean(
    String(card?.title || '').trim()
    || String(card?.display_text || '').trim()
    || String(card?.body || '').trim()
    || String(card?.example || '').trim()
    || String(card?.student_task || '').trim()
    || String(card?.remember || '').trim()
    || card?.grid_layout?.enabled
    || (Array.isArray(card?.images) && card.images.length > 0)
  );
}

// H?m normalizeTheoryType d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function normalizeTheoryType(value) {
  const type = String(value || '').trim();
  return ['observe', 'concept', 'model', 'quick_try', 'remember'].includes(type) ? type : 'concept';
}

// H?m normalizeTheoryLayout d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function normalizeTheoryLayout(value) {
  const layout = String(value || '').trim();
  return ['text_first', 'visual_top', 'visual_left', 'visual_right', 'step_focus', 'compact'].includes(layout)
    ? layout
    : 'text_first';
}

// H?m normalizeTheoryInteraction d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function normalizeTheoryInteraction(value) {
  const interaction = String(value || '').trim();
  return ['none', 'choose', 'count', 'fill_blank', 'compare', 'match'].includes(interaction) ? interaction : 'none';
}

// H?m buildTheoryImages d?ng ?? x?y d?ng k?t qu? t? c?c ngu?n d? li?u v? quy t?c li?n quan; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function buildTheoryImages(files, cardIndex, startIndex = 0) {
  const images = [];
  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const [index, file] of files.entries()) {
    const storedImage = await ImageStorageService.storeQuestionImage(file, {
      folder: 'math-revision/theory'
    });
    const imageNumber = startIndex + index + 1;
    images.push({
      id: `theory-${cardIndex + 1}-image-${imageNumber}`,
      url: storedImage.url,
      width_percent: 100,
      alt_text: file.originalname || `Hình minh họa lý thuyết ${imageNumber}`,
      storage_provider: storedImage.storage_provider,
      public_id: storedImage.public_id,
      cloud_name: storedImage.cloud_name
    });
    file.readyToCommit = true;
  }
  return images;
}

module.exports = {
  dashboard,
  theory,
  lessonTheory,
  createTheoryCard,
  updateTheoryCard,
  deleteTheoryCard,
  questions,
  lessonQuestions,
  questionEditForm,
  createQuestion,
  duplicateQuestion,
  questionSearch,
  updateQuestion,
  deleteQuestion,
  students,
  resetStudentPassword,
  updateStudentGrade,
  updateStudentStatus,
  curriculum,
  createChapter,
  updateChapter,
  deleteChapter,
  createLesson,
  updateLesson,
  deleteLesson,
  aiLogs,
  flagAiLog,
  settings,
  updateSettings,
  checkSettings
};
