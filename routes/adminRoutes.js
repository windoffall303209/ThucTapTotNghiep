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
  { name: 'explanation_images', maxCount: 6 }
]);

router.post('/questions', questionUploadFields, AdminController.createQuestion);
router.post('/questions/:id', questionUploadFields, AdminController.updateQuestion);
router.post('/questions/:id/delete', AdminController.deleteQuestion);
router.get('/students', requireRoles(['SYSADMIN']), AdminController.students);
router.get('/settings', requireRoles(['SYSADMIN']), AdminController.settings);
router.post('/settings/check', requireRoles(['SYSADMIN']), AdminController.checkSettings);
router.post('/settings', requireRoles(['SYSADMIN']), AdminController.updateSettings);

module.exports = router;
