const express = require('express');
const { authRequired } = require('../middleware/auth');
const { 
  listProducts, 
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
  getLowStockItems
} = require('../controllers/productsController');
const { 
  uploadImageBase64, 
  getImageBase64, 
  deleteImageBase64 
} = require('../controllers/imageUploadController');
const { handleUpload } = require('../middleware/upload');

const router = express.Router();

router.get('/', authRequired, listProducts);
router.get('/public', listProducts);
router.post('/', authRequired, createProduct);
router.get('/lazy', authRequired, getAllProductsLazy);
router.get('/lazy/public', getAllProductsLazy);
router.get('/low-stock', authRequired, getLowStockItems);
router.get('/low-stock/public', getLowStockItems);
router.get('/:id', authRequired, getProduct);
router.get('/:id/image', authRequired, getProductImage);
router.get('/:id/image/placeholder', authRequired, getProductImagePlaceholder);
router.get('/:id/image/thumbnail', authRequired, getProductThumbnail);
router.patch('/:id', authRequired, updateProduct);
router.delete('/:id', authRequired, deleteProduct);
router.post('/:id/image', authRequired, handleUpload, uploadProductImage);
router.delete('/:id/image', authRequired, deleteProductImage);
router.post('/cleanup-images', authRequired, cleanupOrphanedImages);

// Base64 image endpoints
router.post('/:id/image/base64', authRequired, uploadImageBase64);
router.get('/:id/image/base64', authRequired, getImageBase64);
router.delete('/:id/image/base64', authRequired, deleteImageBase64);

module.exports = router;


