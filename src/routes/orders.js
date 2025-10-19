const express = require('express');
const { authRequired } = require('../middleware/auth');
const { listOrders, updateOrderPayment, createOrder, getOrder, getOrderItems } = require('../controllers/ordersController');

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

module.exports = router;


