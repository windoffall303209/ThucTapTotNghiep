// Tập tin định tuyebfn auth routes ánh xạ URL, middleware và bộ điều khiển cho các luồng của ứng dụng.
const express = require('express');
const AuthController = require('../controllers/AuthController');

const router = express.Router();

router.get('/login', AuthController.redirectLegacyLogin);
router.post('/login', AuthController.login);
router.get('/student/login', AuthController.showStudentLogin);
router.post('/student/login', AuthController.studentLogin);
router.get('/admin/login', AuthController.showAdminLogin);
router.post('/admin/login', AuthController.adminLogin);
router.get('/register', AuthController.showRegister);
router.post('/register', AuthController.register);
router.post('/logout', AuthController.logout);

module.exports = router;
