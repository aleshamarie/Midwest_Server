const mongoose = require('mongoose');

const salesDailySummarySchema = new mongoose.Schema({
  summary_date: {
    type: Date,
    required: true
  },
  gross_sales: {
    type: Number,
    default: 0.00
  },
  refunds: {
    type: Number,
    default: 0.00
  },
  discounts: {
    type: Number,
    default: 0.00
  },
  net_sales: {
    type: Number,
    default: 0.00
  },
  online_sales: {
    type: Number,
    default: 0.00
  },
  instore_sales: {
    type: Number,
    default: 0.00
  },
  cost_of_goods: {
    type: Number,
    default: 0.00
  },
  gross_profit: {
    type: Number,
    default: 0.00
  },
  margin_percent: {
    type: Number,
    default: 0.00
  },
  taxes: {
    type: Number,
    default: 0.00
  }
}, {
  timestamps: true
});

// Index for date queries
salesDailySummarySchema.index({ summary_date: 1 }, { unique: true });

module.exports = mongoose.model('SalesDailySummary', salesDailySummarySchema);
