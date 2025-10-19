const Order = require('../models/Order');
const Product = require('../models/Product');

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
    // Last 7 days, aggregate totals by type
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const rows = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: sevenDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            type: '$type'
          },
          total: { $sum: '$net_total' }
        }
      },
      {
        $group: {
          _id: '$_id.day',
          online_total: {
            $sum: {
              $cond: [{ $eq: ['$_id.type', 'Online'] }, '$total', 0]
            }
          },
          instore_total: {
            $sum: {
              $cond: [{ $ne: ['$_id.type', 'Online'] }, '$total', 0]
            }
          }
        }
      },
      {
        $sort: { '_id': 1 }
      }
    ]);

    // Ensure 7 entries (fill missing days with zeros)
    const map = new Map(rows.map(r => [r._id, r]));
    const result = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const item = map.get(key) || { online_total: 0, instore_total: 0 };
      result.push({ 
        day: key, 
        online: Number(item.online_total || 0), 
        instore: Number(item.instore_total || 0) 
      });
    }
    res.json({ days: result });
  } catch (_e) {
    console.error('Error in getSalesOverview:', _e);
    res.status(500).json({ message: 'Server error' });
  }
}

module.exports = { getMetrics, getSalesOverview };


