const express = require('express');
const { authRequired } = require('../middleware/auth');
const { getMetrics, getSalesOverview, aggregateSalesData } = require('../controllers/dashboardController');

const router = express.Router();

router.get('/metrics', authRequired, getMetrics);
router.get('/sales-overview', authRequired, getSalesOverview);
// Public variant for dashboards that don't carry a token (e.g., direct chart loads)
router.get('/sales-overview-public', getSalesOverview);
// Aggregate sales data from orders
router.post('/aggregate-sales', aggregateSalesData);

module.exports = router;


