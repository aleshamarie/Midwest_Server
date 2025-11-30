const express = require('express');
const { authRequired } = require('../middleware/auth');
const { listOrders, updateOrderPayment, createOrder, getOrder, getOrderItems, uploadPaymentProof } = require('../controllers/ordersController');
const multer = require('multer');

// Configure multer for memory storage (for Cloudinary)
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(file.originalname.toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    // Accept if either mimetype OR extension matches (more lenient)
    if (mimetype || extname) {
      return cb(null, true);
    } else {
      console.error('File rejected:', {
        originalname: file.originalname,
        mimetype: file.mimetype,
        fieldname: file.fieldname
      });
      cb(new Error(`Only image files (jpeg, jpg, png, gif, webp) are allowed! Received: ${file.mimetype || 'unknown type'}, filename: ${file.originalname || 'unknown'}`));
    }
  }
});

const router = express.Router();

router.get('/', authRequired, listOrders);
router.get('/public', listOrders);
router.get('/:id', authRequired, getOrder);
router.get('/:id/public', getOrder);
router.get('/:id/items', authRequired, getOrderItems);
router.get('/:id/items/public', getOrderItems);
// Optionally, expose items via same handler (client uses getOrder)
router.post('/', authRequired, createOrder);
router.post('/public', createOrder);
router.patch('/:id/payment', authRequired, updateOrderPayment);
router.patch('/:id/payment/public', updateOrderPayment);
// Error handling wrapper for multer
const handleMulterError = (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ message: 'File too large. Maximum size is 5MB.' });
        }
        return res.status(400).json({ message: err.message });
      } else if (err) {
        return res.status(400).json({ message: err.message });
      }
    }
    next();
  });
};

router.post('/:id/payment-proof', authRequired, handleMulterError, uploadPaymentProof);
router.post('/:id/payment-proof/public', handleMulterError, uploadPaymentProof);

module.exports = router;


