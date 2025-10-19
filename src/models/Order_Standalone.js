const mongoose = require('mongoose');

/**
 * Order Schema - Without embedded items (for separate collection approach)
 * This mirrors your MySQL orders table structure
 */
const orderSchema = new mongoose.Schema({
  order_code: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  contact: String,
  address: String,
  status: {
    type: String,
    enum: ['Pending', 'Processing', 'Completed', 'Cancelled', 'Declined', 'Delivered'],
    default: 'Pending'
  },
  type: {
    type: String,
    enum: ['Online', 'In-Store'],
    default: 'Online'
  },
  payment: {
    type: String,
    enum: ['Cash', 'GCash'],
    default: 'Cash'
  },
  ref: String,
  totalPrice: {
    type: Number,
    required: true,
    min: 0
  },
  discount: {
    type: Number,
    default: 0.00,
    min: 0
  },
  net_total: {
    type: Number,
    required: true,
    min: 0
  },
  device_id: String,
  fcm_token: String
}, {
  timestamps: true
});

// Index for device_id queries
orderSchema.index({ device_id: 1 });

module.exports = mongoose.model('Order_Standalone', orderSchema);
