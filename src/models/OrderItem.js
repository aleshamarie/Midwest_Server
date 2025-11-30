const mongoose = require('mongoose');

/**
 * OrderItem Schema - Standalone collection (like MySQL order_items table)
 * This mirrors your MySQL order_items table structure
 */
const orderItemSchema = new mongoose.Schema({
  order_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order_Standalone',
    required: true,
    index: true // For efficient queries
  },
  product_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
    index: true // For efficient queries
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  unit_price: {
    type: Number,
    required: true,
    min: 0
  },
  total_price: {
    type: Number,
    required: true,
    min: 0
  },
  // Additional fields for better tracking
  product_name: {
    type: String,
    required: true,
    trim: true
  },
  product_sku: String,
  product_category: String,
  variant_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product.variants',
    required: false,
    index: true
  },
  variant_name: {
    type: String,
    trim: true,
    required: false
  },
  created_at: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for efficient queries
orderItemSchema.index({ order_id: 1, product_id: 1 });

// Pre-save middleware to calculate total_price
orderItemSchema.pre('save', function(next) {
  if (this.isModified('quantity') || this.isModified('unit_price')) {
    this.total_price = this.quantity * this.unit_price;
  }
  next();
});

module.exports = mongoose.model('OrderItem', orderItemSchema);