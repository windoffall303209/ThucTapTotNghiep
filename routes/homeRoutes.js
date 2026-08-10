// T?p tin ??nh tuy?n home routes ?nh x? URL, middleware v? b? ?i?u khi?n cho c?c lu?ng c?a ?ng d?ng.
const express = require('express');
const HomeController = require('../controllers/HomeController');

const router = express.Router();

router.get('/', HomeController.index);

module.exports = router;
