const express = require('express');
const { authRequired } = require('../middleware/auth');
const { 
  getOrderItems, 
  createOrderItems, 
  updateOrderItem, 
  deleteOrderItem, 
  deleteOrderItems 
} = require('../controllers/orderItemsController');

const router = express.Router();

// Get all items for a specific order
router.get('/order/:orderId', authRequired, getOrderItems);
router.get('/order/:orderId/public', getOrderItems);

// Create order items (bulk)
router.post('/', authRequired, createOrderItems);
router.post('/public', createOrderItems);

// Update a specific order item
router.patch('/:itemId', authRequired, updateOrderItem);
router.patch('/:itemId/public', updateOrderItem);

// Delete a specific order item
router.delete('/:itemId', authRequired, deleteOrderItem);
router.delete('/:itemId/public', deleteOrderItem);

// Delete all items for an order
router.delete('/order/:orderId', authRequired, deleteOrderItems);
router.delete('/order/:orderId/public', deleteOrderItems);

module.exports = router;
