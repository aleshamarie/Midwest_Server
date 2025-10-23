const express = require('express');
const { authRequired } = require('../middleware/auth');
const { getMetrics, getSalesOverview, aggregateSalesData, manualAggregateToday, syncClientOrders, getSalesByDate, getOrdersByDate } = require('../controllers/dashboardController');

const router = express.Router();

router.get('/metrics', authRequired, getMetrics);
router.get('/sales-overview', authRequired, getSalesOverview);
// Public variant for dashboards that don't carry a token (e.g., direct chart loads)
router.get('/sales-overview-public', getSalesOverview);
// Sales by specific date (daily summary)
router.get('/sales-by-date', authRequired, getSalesByDate);
// Orders table by specific date
router.get('/orders-by-date', authRequired, getOrdersByDate);
// Aggregate sales data from orders
router.post('/aggregate-sales', aggregateSalesData);
// Manual aggregation for today's sales
router.post('/aggregate-today', manualAggregateToday);
// Debug endpoint to check database orders
router.get('/sync-orders', syncClientOrders);

module.exports = router;


