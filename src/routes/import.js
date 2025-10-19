const express = require('express');
const multer = require('multer');
const path = require('path');
const { authRequired } = require('../middleware/auth');
const { importProducts, importSales } = require('../controllers/importController');

const router = express.Router();
const upload = multer({ dest: path.join(__dirname, '../../uploads') });

router.post('/products', authRequired, upload.single('file'), importProducts);
router.post('/sales', authRequired, upload.single('file'), importSales);

module.exports = router;


