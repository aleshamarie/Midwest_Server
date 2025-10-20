const Order = require('../models/Order');
const Product = require('../models/Product');
const SalesDailySummary = require('../models/SalesDailySummary');

async function getMetrics(_req, res) {
  try {
    // Today-only metrics
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const totalSalesResult = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: today, $lt: tomorrow }
        }
      },
      {
        $group: {
          _id: null,
          total_sales: { $sum: '$net_total' }
        }
      }
    ]);
    const total_sales = totalSalesResult[0]?.total_sales || 0;

    const total_orders = await Order.countDocuments({
      createdAt: { $gte: today, $lt: tomorrow }
    });

    const customersResult = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: today, $lt: tomorrow }
        }
      },
      {
        $group: {
          _id: '$name'
        }
      },
      {
        $count: 'customers'
      }
    ]);
    const customers = customersResult[0]?.customers || 0;

    const low_stock = await Product.countDocuments({ stock: { $lt: 5 } });

    res.json({ 
      totalSales: Number(total_sales), 
      totalOrders: Number(total_orders), 
      customers: Number(customers), 
      lowStock: Number(low_stock) 
    });
  } catch (_e) {
    console.error('Error in getMetrics:', _e);
    res.status(500).json({ message: 'Server error' });
  }
}

async function getSalesOverview(_req, res) {
  try {
    // Last 7 days from SalesDailySummary collection
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    // Fetch sales data from SalesDailySummary collection
    const salesData = await SalesDailySummary.find({
      summary_date: { $gte: sevenDaysAgo }
    }).sort({ summary_date: 1 });

    // Create a map for quick lookup
    const salesMap = new Map();
    salesData.forEach(item => {
      const dateKey = item.summary_date.toISOString().slice(0, 10);
      salesMap.set(dateKey, item);
    });

    // Ensure 7 entries (fill missing days with zeros)
    const result = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const item = salesMap.get(key);
      
      if (item) {
        // Use net_sales from the summary (this represents total sales for the day)
        // For now, we'll show all sales as "online" since the summary doesn't distinguish
        // In the future, you could modify the summary to track online vs in-store separately
        result.push({ 
          day: key, 
          online: Number(item.net_sales || 0), 
          instore: 0 // Set to 0 since we don't have separate tracking in the summary
        });
      } else {
        result.push({ 
          day: key, 
          online: 0, 
          instore: 0 
        });
      }
    }
    
    res.json({ days: result });
  } catch (_e) {
    console.error('Error in getSalesOverview:', _e);
    res.status(500).json({ message: 'Server error' });
  }
}

module.exports = { getMetrics, getSalesOverview };


