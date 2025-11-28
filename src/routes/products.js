const express = require('express');
const { authRequired } = require('../middleware/auth');
const { 
  listProducts, 
  listProductsDataTables,
  getProduct, 
  createProduct,
  updateProduct, 
  deleteProduct,
  uploadProductImage, 
  deleteProductImage, 
  cleanupOrphanedImages,
  getProductImage,
  getProductImagePlaceholder,
  getProductThumbnail,
  getAllProductsLazy,
  getLowStockItems,
  scanProduct
} = require('../controllers/productsController');
const { 
  uploadImage,
  uploadImageFromBase64,
  deleteImage,
  getImageUrl,
  upload
} = require('../controllers/cloudinaryController');
const { handleUpload } = require('../middleware/upload');

const router = express.Router();

router.get('/', authRequired, listProducts);
router.get('/public', listProducts);
router.get('/datatables', authRequired, listProductsDataTables);
router.get('/datatables/public', listProductsDataTables);
router.post('/', authRequired, createProduct);
router.get('/lazy', authRequired, getAllProductsLazy);
router.get('/lazy/public', getAllProductsLazy);
router.get('/low-stock', authRequired, getLowStockItems);
router.get('/low-stock/public', getLowStockItems);
router.post('/scan', authRequired, scanProduct);
router.get('/:id', authRequired, getProduct);
router.get('/:id/image', authRequired, getProductImage);
router.get('/:id/image/placeholder', authRequired, getProductImagePlaceholder);
router.get('/:id/image/thumbnail', authRequired, getProductThumbnail);
router.patch('/:id', authRequired, updateProduct);
router.delete('/:id', authRequired, deleteProduct);
router.post('/:id/image', authRequired, upload.single('image'), uploadImage);
router.delete('/:id/image', authRequired, deleteImage);
router.post('/cleanup-images', authRequired, cleanupOrphanedImages);

// Migration endpoint for base64 images
router.post('/:id/image/migrate', authRequired, uploadImageFromBase64);

module.exports = router;


