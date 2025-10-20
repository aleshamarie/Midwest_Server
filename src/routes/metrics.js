const express = require('express');
const { authRequired } = require('../middleware/auth');
const { getMetrics, getSalesOverview, aggregateSalesData, manualAggregateToday, syncClientOrders } = require('../controllers/dashboardController');

const router = express.Router();

router.get('/metrics', authRequired, getMetrics);
router.get('/sales-overview', authRequired, getSalesOverview);
// Public variant for dashboards that don't carry a token (e.g., direct chart loads)
router.get('/sales-overview-public', getSalesOverview);
// Aggregate sales data from orders
router.post('/aggregate-sales', aggregateSalesData);
// Manual aggregation for today's sales
router.post('/aggregate-today', manualAggregateToday);
// Debug endpoint to check database orders
router.get('/sync-orders', syncClientOrders);

module.exports = router;


