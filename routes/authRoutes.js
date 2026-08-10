// T?p tin ??nh tuy?n auth routes ?nh x? URL, middleware v? b? ?i?u khi?n cho c?c lu?ng c?a ?ng d?ng.
const express = require('express');
const AuthController = require('../controllers/AuthController');

const router = express.Router();

router.get('/login', AuthController.showLogin);
router.post('/login', AuthController.login);
router.get('/register', AuthController.showRegister);
router.post('/register', AuthController.register);
router.post('/logout', AuthController.logout);

module.exports = router;
