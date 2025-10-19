const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const connectDB = require('./config/mongodb');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Serve static assets (like default images)
app.use('/assets', express.static(path.join(__dirname, '../assets')));

// Routes
const apiRouter = require('./routes');
app.use('/api', apiRouter);

app.get('/', (_req, res) => {
  res.json({ name: 'Midwest Grocery API', status: 'ok' });
});

const PORT = process.env.PORT || 4000;

// Connect to MongoDB and start server
const startServer = async () => {
  try {
    await connectDB();
    
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      
      // MongoDB daily automation: roll up yesterday into sales_daily_summary at 00:05
      try {
        const schedule = require('node-schedule');
        const Order = require('./models/Order');
        const Product = require('./models/Product');
        const SalesDailySummary = require('./models/SalesDailySummary');
        
        schedule.scheduleJob('5 0 * * *', async () => {
          try {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            yesterday.setHours(0, 0, 0, 0);
            
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            // Get orders from yesterday
            const orders = await Order.find({
              createdAt: {
                $gte: yesterday,
                $lt: today
              }
            }).populate('items.product_id');
            
            if (orders.length === 0) {
              console.log('[scheduler] No orders found for yesterday');
              return;
            }
            
            // Calculate summary data
            let grossSales = 0;
            let refunds = 0;
            let discounts = 0;
            let costOfGoods = 0;
            let taxes = 0;
            
            for (const order of orders) {
              grossSales += order.totalPrice;
              discounts += order.discount;
              
              for (const item of order.items) {
                if (item.product_id && item.product_id.cost) {
                  costOfGoods += item.quantity * item.product_id.cost;
                }
              }
            }
            
            const netSales = grossSales - discounts - refunds;
            const grossProfit = netSales - costOfGoods;
            const marginPercent = netSales === 0 ? 0 : (grossProfit / netSales) * 100;
            
            // Update or create daily summary
            await SalesDailySummary.findOneAndUpdate(
              { summary_date: yesterday },
              {
                summary_date: yesterday,
                gross_sales: grossSales,
                refunds: refunds,
                discounts: discounts,
                net_sales: netSales,
                cost_of_goods: costOfGoods,
                gross_profit: grossProfit,
                margin_percent: marginPercent,
                taxes: taxes
              },
              { upsert: true, new: true }
            );
            
            console.log('[scheduler] sales_daily_summary updated for', yesterday.toDateString());
          } catch (error) {
            console.error('[scheduler] Error updating daily summary:', error);
          }
        });
      } catch (e) {
        console.warn('Scheduler init failed:', e.message);
      }
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();


