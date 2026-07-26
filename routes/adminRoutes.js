const express = require('express');
const AdminController = require('../controllers/AdminController');
const { requireAdmin, requireRoles } = require('../middleware/auth');
const { questionImageUpload } = require('../middleware/upload');

const router = express.Router();

router.use(requireAdmin);
router.get('/dashboard', AdminController.dashboard);
router.get('/theory', AdminController.theory);
router.get('/theory/lesson/:lessonId', AdminController.lessonTheory);
router.post('/theory/:lessonId/cards', questionImageUpload.any(), AdminController.createTheoryCard);
router.post('/theory/:lessonId/cards/:cardIndex', questionImageUpload.any(), AdminController.updateTheoryCard);
router.post('/theory/:lessonId/cards/:cardIndex/delete', AdminController.deleteTheoryCard);
router.get('/questions', AdminController.questions);
router.get('/questions/lesson/:lessonId', AdminController.lessonQuestions);
router.get('/questions/:id/edit', AdminController.questionEditForm);
const questionUploadFields = questionImageUpload.fields([
  { name: 'question_images', maxCount: 6 },
  { name: 'explanation_images', maxCount: 6 },
  { name: 'choice_image_A', maxCount: 3 },
  { name: 'choice_image_B', maxCount: 3 },
  { name: 'choice_image_C', maxCount: 3 },
  { name: 'choice_image_D', maxCount: 3 }
]);

router.post('/questions', questionUploadFields, AdminController.createQuestion);
router.post('/questions/:id', questionUploadFields, AdminController.updateQuestion);
router.post('/questions/:id/delete', AdminController.deleteQuestion);
router.get('/students', requireRoles(['SYSADMIN']), AdminController.students);
router.post('/students/:id/password', requireRoles(['SYSADMIN']), AdminController.resetStudentPassword);
router.post('/students/:id/grade', requireRoles(['SYSADMIN']), AdminController.updateStudentGrade);
router.get('/curriculum', AdminController.curriculum);
router.post('/curriculum/chapters', AdminController.createChapter);
router.post('/curriculum/chapters/:id', AdminController.updateChapter);
router.post('/curriculum/chapters/:id/delete', AdminController.deleteChapter);
router.post('/curriculum/lessons', AdminController.createLesson);
router.post('/curriculum/lessons/:id', AdminController.updateLesson);
router.post('/curriculum/lessons/:id/delete', AdminController.deleteLesson);
router.get('/logs/ai', AdminController.aiLogs);
router.post('/logs/ai/:id/flag', AdminController.flagAiLog);
router.get('/settings', requireRoles(['SYSADMIN']), AdminController.settings);
router.post('/settings/check', requireRoles(['SYSADMIN']), AdminController.checkSettings);
router.post('/settings', requireRoles(['SYSADMIN']), AdminController.updateSettings);

module.exports = router;
