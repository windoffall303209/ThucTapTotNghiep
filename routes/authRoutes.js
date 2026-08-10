// Tập tin định tuyebfn auth routes ánh xạ URL, middleware và bộ điều khiển cho các luồng của ứng dụng.
const express = require('express');
const AuthController = require('../controllers/AuthController');

const router = express.Router();

router.get('/login', AuthController.showLogin);
router.post('/login', AuthController.login);
router.get('/register', AuthController.showRegister);
router.post('/register', AuthController.register);
router.post('/logout', AuthController.logout);

module.exports = router;
