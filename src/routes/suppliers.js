const express = require('express');
const { authRequired } = require('../middleware/auth');
const { listSuppliers, listSuppliersDataTables, createSupplier, updateSupplier, deleteSupplier, addSupplierProduct, restockSupplierProduct } = require('../controllers/suppliersController');

const router = express.Router();

router.get('/', authRequired, listSuppliers);
router.get('/datatables', authRequired, listSuppliersDataTables);
router.post('/', authRequired, createSupplier);
router.patch('/:id', authRequired, updateSupplier);
router.delete('/:id', authRequired, deleteSupplier);
router.post('/:id/products', authRequired, addSupplierProduct);
router.post('/:id/restock', authRequired, restockSupplierProduct);

module.exports = router;


