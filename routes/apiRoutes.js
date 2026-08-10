// T?p tin ??nh tuy?n api routes ?nh x? URL, middleware v? b? ?i?u khi?n cho c?c lu?ng c?a ?ng d?ng.
const express = require('express');
const ApiController = require('../controllers/ApiController');
const { requireStudent } = require('../middleware/auth');

const router = express.Router();

router.post('/ai/exercise-help', requireStudent, ApiController.exerciseHelp);

module.exports = router;
