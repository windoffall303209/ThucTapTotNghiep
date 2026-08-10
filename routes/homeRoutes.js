// Tập tin định tuyebfn home routes ánh xạ URL, middleware và bộ điều khiển cho các luồng của ứng dụng.
const express = require('express');
const HomeController = require('../controllers/HomeController');

const router = express.Router();

router.get('/', HomeController.index);

module.exports = router;
