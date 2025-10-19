const express = require('express');
const { authRequired } = require('../middleware/auth');
const { getAll, saveAll } = require('../controllers/syncController');
const router = express.Router();

router.get('/all', authRequired, getAll);
router.post('/save', authRequired, saveAll);

module.exports = router;


