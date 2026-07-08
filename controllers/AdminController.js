const Curriculum = require('../models/Curriculum');
const Question = require('../models/Question');
const Student = require('../models/Student');
const SystemSetting = require('../models/SystemSetting');
const ImageStorageService = require('../services/ImageStorageService');
const ProviderCheckService = require('../services/ProviderCheckService');
const { setFlash } = require('../utils/flash');

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

async function dashboard(req, res, next) {
  try {
    const [questionStats, recentQuestions, students] = await Promise.all([
      Question.getAdminStats(),
      Question.getRecentQuestions(6),
      Student.listStudents()
    ]);

    res.render('admin/dashboard', {
      title: 'Bảng quản trị',
      stats: {
        questionCount: questionStats.questionCount,
        studentCount: students.length,
        lessonCount: questionStats.lessonCount,
        easyCount: questionStats.easyCount
      },
      questions: recentQuestions
    });
  } catch (error) {
    next(error);
  }
}

async function questions(req, res, next) {
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
      totalQuestionCount
    });
  } catch (error) {
    next(error);
  }
}

async function theory(req, res, next) {
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
      totalTheoryCardCount
    });
  } catch (error) {
    next(error);
  }
}

async function lessonTheory(req, res, next) {
  try {
    const lesson = await Curriculum.getLessonById(req.params.lessonId);
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

async function updateTheory(req, res, next) {
  try {
    const lesson = await Curriculum.getLessonById(req.params.lessonId);
    if (!lesson) {
      setFlash(req, 'danger', 'Không tìm thấy bài học cần cập nhật lý thuyết.');
      return res.redirect('/admin/theory');
    }

    const cards = await buildTheoryCardBody(req.body.cards, req.files || []);
    await Curriculum.updateLessonTheoryCards(lesson.id, cards);

    setFlash(req, 'success', 'Đã cập nhật lý thuyết cho bài học.');
    return res.redirect('/admin/theory');
  } catch (error) {
    next(error);
  }
}

async function createTheoryCard(req, res, next) {
  try {
    const lesson = await Curriculum.getLessonById(req.params.lessonId);
    if (!lesson) {
      setFlash(req, 'danger', 'Không tìm thấy bài học cần thêm thẻ lý thuyết.');
      return res.redirect('/admin/theory');
    }

    const cards = Array.isArray(lesson.theory_cards) ? [...lesson.theory_cards] : [];
    const newCard = await buildSingleTheoryCard(req.body, req.files || [], cards.length);

    if (!hasTheoryCardContent(newCard)) {
      setFlash(req, 'danger', 'Thẻ lý thuyết cần có tiêu đề, nội dung, ví dụ hoặc ảnh minh họa.');
      return res.redirect('/admin/theory');
    }

    cards.push(newCard);
    await Curriculum.updateLessonTheoryCards(lesson.id, cards);

    setFlash(req, 'success', 'Đã thêm thẻ lý thuyết.');
    return res.redirect('/admin/theory');
  } catch (error) {
    next(error);
  }
}

async function updateTheoryCard(req, res, next) {
  try {
    const lesson = await Curriculum.getLessonById(req.params.lessonId);
    const cardIndex = Number(req.params.cardIndex);
    if (!lesson || !Number.isInteger(cardIndex)) {
      setFlash(req, 'danger', 'Không tìm thấy thẻ lý thuyết cần cập nhật.');
      return res.redirect('/admin/theory');
    }

    const cards = Array.isArray(lesson.theory_cards) ? [...lesson.theory_cards] : [];
    if (!cards[cardIndex]) {
      setFlash(req, 'danger', 'Không tìm thấy thẻ lý thuyết cần cập nhật.');
      return res.redirect('/admin/theory');
    }

    const updatedCard = await buildSingleTheoryCard(req.body, req.files || [], cardIndex);
    if (!hasTheoryCardContent(updatedCard)) {
      setFlash(req, 'danger', 'Thẻ lý thuyết cần có tiêu đề, nội dung, ví dụ hoặc ảnh minh họa.');
      return res.redirect('/admin/theory');
    }

    cards[cardIndex] = updatedCard;
    await Curriculum.updateLessonTheoryCards(lesson.id, cards);

    setFlash(req, 'success', 'Đã cập nhật thẻ lý thuyết.');
    return res.redirect('/admin/theory');
  } catch (error) {
    next(error);
  }
}

async function deleteTheoryCard(req, res, next) {
  try {
    const lesson = await Curriculum.getLessonById(req.params.lessonId);
    const cardIndex = Number(req.params.cardIndex);
    if (!lesson || !Number.isInteger(cardIndex)) {
      setFlash(req, 'danger', 'Không tìm thấy thẻ lý thuyết cần xóa.');
      return res.redirect('/admin/theory');
    }

    const cards = Array.isArray(lesson.theory_cards) ? [...lesson.theory_cards] : [];
    if (!cards[cardIndex]) {
      setFlash(req, 'danger', 'Không tìm thấy thẻ lý thuyết cần xóa.');
      return res.redirect('/admin/theory');
    }

    cards.splice(cardIndex, 1);
    await Curriculum.updateLessonTheoryCards(lesson.id, cards);

    setFlash(req, 'success', 'Đã xóa thẻ lý thuyết.');
    return res.redirect('/admin/theory');
  } catch (error) {
    next(error);
  }
}

async function lessonQuestions(req, res, next) {
  try {
    const lesson = await Curriculum.getLessonById(req.params.lessonId);
    if (!lesson) {
      return res.status(404).json({
        ok: false,
        message: 'Không tìm thấy bài học.'
      });
    }

    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 8), 5), 20);
    const questionPage = await Question.getQuestionPageByLesson(req.params.lessonId, { page, limit });

    return res.render('admin/partials/lesson-questions', {
      layout: false,
      lesson,
      questions: questionPage.questions,
      pagination: questionPage.pagination
    });
  } catch (error) {
    next(error);
  }
}

async function questionEditForm(req, res, next) {
  try {
    const [question, lessons, misconceptions] = await Promise.all([
      Question.getQuestionById(req.params.id),
      Curriculum.getAllLessons(),
      Question.getMisconceptionsByQuestion(req.params.id)
    ]);

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

async function createQuestion(req, res, next) {
  try {
    normalizeQuestionBody(req.body);
    const files = getUploadFiles(req.files);
    const validation = validateQuestionBody(req.body, files.choiceImages);
    if (validation) {
      setFlash(req, 'danger', validation);
      return res.redirect('/admin/questions');
    }

    const choices = await buildChoices(req.body, files.choiceImages);
    const misconceptions = buildMisconceptions(choices, req.body.correct_answer, req.body);
    const questionImages = await buildQuestionImages(files.questionImages, req.body, {
      idPrefix: 'image',
      widthField: 'image_width_percent',
      altField: 'image_alt_text',
      defaultAlt: 'Hình minh họa'
    });
    const explanationImages = await buildQuestionImages(files.explanationImages, req.body, {
      idPrefix: 'explanation-image',
      widthField: 'explanation_image_width_percent',
      altField: 'explanation_image_alt_text',
      defaultAlt: 'Hình minh họa lời giải'
    });
    const contentText = ensureImagePlaceholders(req.body.content_text, questionImages);

    await Question.createQuestion({
      lesson_id: Number(req.body.lesson_id),
      question_type: normalizeQuestionType(req.body.question_type),
      difficulty: req.body.difficulty || 'EASY',
      layout_template: normalizeLayoutTemplate(req.body.layout_template),
      content: {
        text: contentText,
        images: questionImages,
        interaction: normalizeQuestionInteraction(req.body.question_interaction),
        layout_variant: normalizeLayoutVariant(req.body.layout_variant || req.body.layout_template)
      },
      choices,
      correct_answer: String(req.body.correct_answer || '').trim(),
      explanation: {
        text: req.body.explanation_text || 'Chưa có lời giải chi tiết.',
        images: explanationImages
      },
      misconceptions
    });

    setFlash(req, 'success', 'Đã lưu câu hỏi mới.');
    return res.redirect('/admin/questions');
  } catch (error) {
    next(error);
  }
}

async function updateQuestion(req, res, next) {
  try {
    normalizeQuestionBody(req.body);
    const question = await Question.getQuestionById(req.params.id);
    if (!question) {
      setFlash(req, 'danger', 'Không tìm thấy câu hỏi cần sửa.');
      return res.redirect('/admin/questions');
    }

    const files = getUploadFiles(req.files);
    const existingChoices = new Map((question.choices || []).map((choice) => [choice.key, choice]));
    const validation = validateQuestionBody(req.body, files.choiceImages, existingChoices);
    if (validation) {
      setFlash(req, 'danger', validation);
      return res.redirect('/admin/questions');
    }

    const choices = await buildChoices(req.body, files.choiceImages, existingChoices);
    const misconceptions = buildMisconceptions(choices, req.body.correct_answer, req.body);
    const existingImages = Array.isArray(question.content?.images) ? question.content.images : [];
    const removedQuestionImages = getRemovedImages(existingImages, req.body.remove_question_images);
    const keptQuestionImages = filterRemovedImages(existingImages, req.body.remove_question_images);
    const uploadedImages = await buildQuestionImages(files.questionImages, req.body, {
      startIndex: maxImageIndex(keptQuestionImages, 'image'),
      idPrefix: 'image',
      widthField: 'image_width_percent',
      altField: 'image_alt_text',
      defaultAlt: 'Hình minh họa'
    });
    const questionImages = keptQuestionImages.concat(uploadedImages);
    const existingExplanationImages = Array.isArray(question.explanation?.images) ? question.explanation.images : [];
    const keptExplanationImages = filterRemovedImages(existingExplanationImages, req.body.remove_explanation_images);
    const uploadedExplanationImages = await buildQuestionImages(files.explanationImages, req.body, {
      startIndex: maxImageIndex(keptExplanationImages, 'explanation-image'),
      idPrefix: 'explanation-image',
      widthField: 'explanation_image_width_percent',
      altField: 'explanation_image_alt_text',
      defaultAlt: 'Hình minh họa lời giải'
    });
    const contentText = ensureImagePlaceholders(
      stripImagePlaceholders(req.body.content_text, removedQuestionImages),
      uploadedImages
    );

    await Question.updateQuestion(Number(req.params.id), {
      lesson_id: Number(req.body.lesson_id),
      question_type: normalizeQuestionType(req.body.question_type),
      difficulty: req.body.difficulty || question.difficulty || 'EASY',
      layout_template: normalizeLayoutTemplate(req.body.layout_template || question.layout_template),
      content: {
        text: contentText,
        images: questionImages,
        interaction: normalizeQuestionInteraction(req.body.question_interaction),
        layout_variant: normalizeLayoutVariant(req.body.layout_variant || req.body.layout_template || question.content?.layout_variant)
      },
      choices,
      correct_answer: String(req.body.correct_answer || '').trim(),
      explanation: {
        text: req.body.explanation_text || 'Chưa có lời giải chi tiết.',
        images: keptExplanationImages.concat(uploadedExplanationImages)
      },
      misconceptions
    });

    setFlash(req, 'success', 'Đã cập nhật câu hỏi.');
    return res.redirect('/admin/questions');
  } catch (error) {
    next(error);
  }
}

async function deleteQuestion(req, res, next) {
  try {
    await Question.deleteQuestion(Number(req.params.id));
    setFlash(req, 'success', 'Đã xóa câu hỏi.');
    return res.redirect('/admin/questions');
  } catch (error) {
    next(error);
  }
}

function validateQuestionBody(body, choiceFiles = {}, existingChoices = new Map()) {
  const questionType = normalizeQuestionType(body.question_type);
  if (!body.lesson_id || !body.content_text || !body.correct_answer) {
    return 'Vui lòng chọn bài học, nhập đề bài và chọn đáp án đúng.';
  }

  if (questionType === 'FILL_IN_THE_BLANK') {
    return null;
  }

  if (!ANSWER_KEYS.includes(body.correct_answer)) {
    return 'Đáp án đúng phải là A, B, C hoặc D.';
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

  if (choiceSummaries.some((choice) => !choice.text && choice.imageCount === 0)) {
    return 'Mỗi phương án A, B, C, D cần có nội dung chữ hoặc ảnh minh họa.';
  }

  if (body.layout_template === 'IMAGE_IN_CHOICES' && choiceSummaries.every((choice) => choice.imageCount === 0)) {
    return 'Bố cục ảnh trong đáp án cần có ít nhất một ảnh ở các phương án.';
  }

  return null;
}

function normalizeQuestionBody(body) {
  body.question_type = normalizeQuestionType(body.question_type);
  if (body.question_type === 'FILL_IN_THE_BLANK') {
    body.correct_answer = String(body.correct_answer_free || body.correct_answer || '').trim();
    body.layout_template = normalizeLayoutTemplate(body.layout_template || body.layout_variant);
    body.question_interaction = body.question_interaction || 'fill_blank';
    return body;
  }

  body.layout_template = normalizeLayoutTemplate(body.layout_template || body.layout_variant);
  return body;
}

async function buildChoices(body, choiceFiles = {}, existingChoices = new Map()) {
  if (normalizeQuestionType(body.question_type) === 'FILL_IN_THE_BLANK') {
    return [];
  }

  const choices = [];

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

function buildMisconceptions(choices, correctAnswer, body) {
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

function normalizeQuestionType(value) {
  const type = String(value || 'MULTIPLE_CHOICE').trim().toUpperCase();
  return QUESTION_TYPES.includes(type) ? type : 'MULTIPLE_CHOICE';
}

function normalizeLayoutTemplate(value) {
  const layout = String(value || 'STACK_VERTICAL').trim().toUpperCase();
  return LAYOUT_TEMPLATES.includes(layout) ? layout : 'STACK_VERTICAL';
}

function normalizeLayoutVariant(value) {
  const layout = String(value || 'STACK_VERTICAL').trim().toUpperCase();
  return LAYOUT_VARIANTS.includes(layout) ? layout : normalizeLayoutTemplate(value);
}

function normalizeQuestionInteraction(value) {
  const interaction = String(value || '').trim();
  return ['none', 'choose', 'fill_blank', 'count', 'compare'].includes(interaction) ? interaction : 'none';
}

function buildQuestionBankTree(lessons, questionCounts) {
  const gradeMap = new Map();
  const lessonMap = new Map();
  const countMap = new Map(
    (questionCounts || []).map((row) => [Number(row.lesson_id), Number(row.question_count || 0)])
  );

  const ensureGrade = (grade) => {
    const key = String(grade || 'Chưa phân loại');
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

  const ensureChapter = (gradeGroup, lesson) => {
    const key = String(lesson.chapter_id || lesson.chapter_name || 'Chưa có chương');
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
  for (const grade of grades) {
    grade.chapters.sort((a, b) => Number(a.chapter_sort_order) - Number(b.chapter_sort_order));
    for (const chapter of grade.chapters) {
      chapter.lessons.sort((a, b) => Number(a.lesson_sort_order) - Number(b.lesson_sort_order));
      for (const lesson of chapter.lessons) {
        lesson.questions = [];
      }
      chapter.questionCount = chapter.lessons.reduce((sum, lesson) => sum + lesson.questionCount, 0);
    }
    grade.questionCount = grade.chapters.reduce((sum, chapter) => sum + chapter.questionCount, 0);
  }

  return grades;
}

function buildBookTree(questionBankTree) {
  const books = [];

  for (const gradeGroup of questionBankTree) {
    const grade = Number(gradeGroup.grade);
    const chapters = gradeGroup.chapters || [];
    const parts = grade === 1 ? [chapters] : splitChaptersIntoVolumes(chapters);

    parts.forEach((partChapters, index) => {
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

function buildTheoryTree(lessons, theoryCounts) {
  const gradeMap = new Map();
  const countMap = new Map(
    (theoryCounts || []).map((row) => [Number(row.lesson_id), Number(row.theory_count || 0)])
  );

  const ensureGrade = (grade) => {
    const key = String(grade || 'Chưa phân loại');
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

  const ensureChapter = (gradeGroup, lesson) => {
    const key = String(lesson.chapter_id || lesson.chapter_name || 'Chưa có chương');
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

  for (const lesson of lessons) {
    const gradeGroup = ensureGrade(lesson.grade);
    const chapter = ensureChapter(gradeGroup, lesson);
    chapter.lessons.push({
      ...lesson,
      theoryCount: countMap.get(Number(lesson.id)) || 0
    });
  }

  const grades = Array.from(gradeMap.values()).sort((a, b) => Number(a.grade) - Number(b.grade));
  for (const grade of grades) {
    grade.chapters.sort((a, b) => Number(a.chapter_sort_order) - Number(b.chapter_sort_order));
    for (const chapter of grade.chapters) {
      chapter.lessons.sort((a, b) => Number(a.lesson_sort_order) - Number(b.lesson_sort_order));
      chapter.theoryCount = chapter.lessons.reduce((sum, lesson) => sum + Number(lesson.theoryCount || 0), 0);
    }
    grade.theoryCount = grade.chapters.reduce((sum, chapter) => sum + Number(chapter.theoryCount || 0), 0);
  }

  return grades;
}

function buildTheoryBookTree(theoryTree) {
  const books = [];

  for (const gradeGroup of theoryTree) {
    const grade = Number(gradeGroup.grade);
    const chapters = gradeGroup.chapters || [];
    const parts = grade === 1 ? [chapters] : splitChaptersIntoVolumes(chapters);

    parts.forEach((partChapters, index) => {
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

function splitChaptersIntoVolumes(chapters) {
  if (chapters.length <= 1) return [chapters, []];
  const midpoint = Math.ceil(chapters.length / 2);
  return [chapters.slice(0, midpoint), chapters.slice(midpoint)];
}

function getUploadFiles(files) {
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
      public_id: storedImage.public_id
    });
  }
  return images;
}

function normalizeWidthPercent(value) {
  const width = Number(value || 70);
  if (!Number.isFinite(width)) return 70;
  return Math.min(Math.max(Math.round(width), 20), 100);
}

function normalizeRemoveIds(value) {
  if (Array.isArray(value)) return new Set(value.map(String));
  if (value == null || value === '') return new Set();
  return new Set([String(value)]);
}

function filterRemovedImages(images, removeValue) {
  const removeIds = normalizeRemoveIds(removeValue);
  if (removeIds.size === 0) return images;
  return images.filter((image) => !removeIds.has(String(image.id || image.url || '')));
}

function getRemovedImages(images, removeValue) {
  const removeIds = normalizeRemoveIds(removeValue);
  if (removeIds.size === 0) return [];
  return images.filter((image) => removeIds.has(String(image.id || image.url || '')));
}

function maxImageIndex(images, idPrefix) {
  const pattern = new RegExp(`^${escapeRegExp(idPrefix)}-(\\d+)$`);
  return (images || []).reduce((max, image) => {
    const match = String(image.id || '').match(pattern);
    return match ? Math.max(max, Number(match[1]) || 0) : max;
  }, 0);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripImagePlaceholders(contentText, images) {
  let text = contentText || '';
  (images || []).forEach((image) => {
    if (image.id) text = text.replaceAll(`[${image.id}]`, '');
  });
  return text;
}

function ensureImagePlaceholders(contentText, images) {
  let text = contentText || '';
  const missingPlaceholders = images
    .filter((image) => !text.includes(`[${image.id}]`))
    .map((image) => `[${image.id}]`);

  if (missingPlaceholders.length > 0) {
    text = `${text}\n\n${missingPlaceholders.join('\n')}`;
  }

  return text;
}

async function students(req, res, next) {
  try {
    const studentList = await Student.listStudents(req.query.q || '');
    res.render('admin/students', {
      title: 'Quản lý học sinh',
      students: studentList,
      query: req.query.q || ''
    });
  } catch (error) {
    next(error);
  }
}

async function settings(req, res, next) {
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

async function updateSettings(req, res, next) {
  try {
    await SystemSetting.updateSettings({
      ai_provider: req.body.ai_provider,
      ai_automation_enabled: req.body.ai_automation_enabled,
      ai_json_timeout_ms: req.body.ai_json_timeout_ms,
      ai_enabled_grades: req.body.ai_enabled_grades,
      ai_max_hints_per_question: req.body.ai_max_hints_per_question,
      ai_max_hints_per_session: req.body.ai_max_hints_per_session,
      ai_require_answer_before_help: req.body.ai_require_answer_before_help,
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
    next(error);
  }
}

async function checkSettings(req, res, next) {
  try {
    const result = await ProviderCheckService.checkProvider(req.body.provider, req.body);
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (error) {
    next(error);
  }
}

async function buildTheoryCardBody(cards, files) {
  const items = Array.isArray(cards)
    ? cards
    : cards && typeof cards === 'object'
      ? Object.keys(cards).sort((a, b) => Number(a) - Number(b)).map((key) => cards[key])
      : [];

  const uploadedFilesByIndex = groupTheoryImageFiles(files);
  const result = [];

  for (const [index, card] of items.entries()) {
    const existingImages = parseExistingImages(card?.existing_images);
    const uploadedImages = await buildTheoryImages(uploadedFilesByIndex.get(index) || [], index, existingImages.length);
    const normalizedCard = {
      title: card?.title || '',
      type: normalizeTheoryType(card?.type),
      layout: normalizeTheoryLayout(card?.layout),
      display_text: card?.display_text || '',
      body: card?.body || '',
      example: card?.example || '',
      student_task: card?.student_task || '',
      remember: card?.remember || '',
      interaction: normalizeTheoryInteraction(card?.interaction),
      images: [...existingImages, ...uploadedImages]
    };

    if (
      normalizedCard.title.trim()
      || normalizedCard.display_text.trim()
      || normalizedCard.body.trim()
      || normalizedCard.example.trim()
      || normalizedCard.student_task.trim()
      || normalizedCard.remember.trim()
      || normalizedCard.images.length > 0
    ) {
      result.push(normalizedCard);
    }
  }

  return result;
}

async function buildSingleTheoryCard(body, files, cardIndex = 0) {
  const existingImages = filterRemovedImages(parseExistingImages(body.existing_images), body.remove_theory_images);
  const uploadedImages = await buildTheoryImages(files || [], cardIndex, maxImageIndex(existingImages, `theory-${cardIndex + 1}-image`));

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
    images: [...existingImages, ...uploadedImages]
  };
}

function hasTheoryCardContent(card) {
  return Boolean(
    String(card?.title || '').trim()
    || String(card?.display_text || '').trim()
    || String(card?.body || '').trim()
    || String(card?.example || '').trim()
    || String(card?.student_task || '').trim()
    || String(card?.remember || '').trim()
    || (Array.isArray(card?.images) && card.images.length > 0)
  );
}

function normalizeTheoryType(value) {
  const type = String(value || '').trim();
  return ['observe', 'concept', 'model', 'quick_try', 'remember'].includes(type) ? type : 'concept';
}

function normalizeTheoryLayout(value) {
  const layout = String(value || '').trim();
  return ['text_first', 'visual_top', 'visual_left', 'visual_right', 'step_focus', 'compact'].includes(layout)
    ? layout
    : 'text_first';
}

function normalizeTheoryInteraction(value) {
  const interaction = String(value || '').trim();
  return ['none', 'choose', 'count', 'fill_blank', 'compare', 'match'].includes(interaction) ? interaction : 'none';
}

function groupTheoryImageFiles(files) {
  const map = new Map();
  for (const file of files || []) {
    const match = String(file.fieldname || '').match(/^theory_images_(\d+)$/);
    if (!match) continue;
    const index = Number(match[1]);
    if (!map.has(index)) map.set(index, []);
    map.get(index).push(file);
  }
  return map;
}

async function buildTheoryImages(files, cardIndex, startIndex = 0) {
  const images = [];
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
      public_id: storedImage.public_id
    });
  }
  return images;
}

function parseExistingImages(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return (Array.isArray(parsed) ? parsed : [])
      .map((image, index) => ({
        id: String(image.id || `theory-image-${index + 1}`),
        url: String(image.url || '').trim(),
        width_percent: Number(image.width_percent || 100),
        alt_text: String(image.alt_text || image.alt || 'Hình minh họa lý thuyết'),
        storage_provider: image.storage_provider || '',
        public_id: image.public_id || null
      }))
      .filter((image) => image.url);
  } catch (error) {
    return [];
  }
}

module.exports = {
  dashboard,
  theory,
  lessonTheory,
  updateTheory,
  createTheoryCard,
  updateTheoryCard,
  deleteTheoryCard,
  questions,
  lessonQuestions,
  questionEditForm,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  students,
  settings,
  updateSettings,
  checkSettings
};
