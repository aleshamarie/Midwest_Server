const express = require('express');
const { authRequired } = require('../middleware/auth');
const {
  listSupplierProducts,
  createSupplierProduct,
  updateSupplierProduct,
  deleteSupplierProduct,
  getProductSuppliers,
  getSupplierProducts
} = require('../controllers/supplierProductController');

const router = express.Router();

// Public routes (no authentication required)
router.get('/', listSupplierProducts);
router.get('/product/:productId', getProductSuppliers);
router.get('/supplier/:supplierId', getSupplierProducts);

// Protected routes (authentication required)
router.post('/', authRequired, createSupplierProduct);
router.put('/:id', authRequired, updateSupplierProduct);
router.delete('/:id', authRequired, deleteSupplierProduct);

module.exports = router;
