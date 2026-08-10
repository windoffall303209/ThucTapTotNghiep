// Tập tin định tuyebfn api routes ánh xạ URL, middleware và bộ điều khiển cho các luồng của ứng dụng.
const express = require('express');
const ApiController = require('../controllers/ApiController');
const { requireStudent } = require('../middleware/auth');

const router = express.Router();

router.post('/ai/exercise-help', requireStudent, ApiController.exerciseHelp);

module.exports = router;
