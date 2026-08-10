// T?p tin ??nh tuy?n student routes ?nh x? URL, middleware v? b? ?i?u khi?n cho c?c lu?ng c?a ?ng d?ng.
const express = require('express');
const StudentController = require('../controllers/StudentController');
const { requireStudent } = require('../middleware/auth');

const router = express.Router();

router.use(requireStudent);
router.get('/dashboard', StudentController.dashboard);
router.get('/history', StudentController.history);
router.get('/account', StudentController.account);
router.post('/account/password', StudentController.updatePassword);
router.get('/exams', StudentController.exams);
router.post('/exams/start', StudentController.startExam);
router.get('/sessions/:id/practice', StudentController.sessionPractice);
router.get('/sessions/:id', StudentController.reviewSession);
router.post('/sessions/:id/finish', StudentController.finishSession);
router.get('/lessons/:id', StudentController.lesson);
router.get('/lessons/:id/review', StudentController.reviewLesson);
router.get('/lessons/:id/practice', StudentController.practice);
router.post('/questions/:questionId/answer', StudentController.submitAnswer);
router.post('/theory/help', StudentController.theoryHelp);

module.exports = router;
