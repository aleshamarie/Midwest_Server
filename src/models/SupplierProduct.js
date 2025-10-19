const mongoose = require('mongoose');

/**
 * SupplierProduct Schema - Enhanced relationship between suppliers and products
 * This provides more detailed tracking of supplier-product relationships
 */
const supplierProductSchema = new mongoose.Schema({
  supplier_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
    required: true
  },
  product_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  // Supplier-specific product information
  supplier_sku: String, // Supplier's SKU for this product
  supplier_name: String, // Supplier's name for this product
  supplier_price: {
    type: Number,
    required: true,
    min: 0
  },
  supplier_cost: {
    type: Number,
    required: true,
    min: 0
  },
  // Relationship metadata
  is_primary_supplier: {
    type: Boolean,
    default: false
  },
  is_active: {
    type: Boolean,
    default: true
  },
  // Delivery and availability
  lead_time_days: {
    type: Number,
    default: 0
  },
  minimum_order_quantity: {
    type: Number,
    default: 1
  },
  maximum_order_quantity: Number,
  // Quality and compliance
  quality_rating: {
    type: Number,
    min: 1,
    max: 5,
    default: 3
  },
  compliance_certificates: [String], // e.g., ['ISO9001', 'HACCP']
  // Contact and communication
  supplier_contact: String,
  supplier_email: String,
  supplier_phone: String,
  // Historical data
  last_order_date: Date,
  last_delivery_date: Date,
  total_orders: {
    type: Number,
    default: 0
  },
  total_quantity_ordered: {
    type: Number,
    default: 0
  },
  // Notes and special instructions
  notes: String,
  special_instructions: String,
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Compound index for efficient queries
supplierProductSchema.index({ supplier_id: 1, product_id: 1 }, { unique: true });
supplierProductSchema.index({ product_id: 1, is_active: 1 });
supplierProductSchema.index({ supplier_id: 1, is_active: 1 });

// Virtual for profit margin
supplierProductSchema.virtual('profit_margin').get(function() {
  if (this.supplier_price > 0) {
    return ((this.supplier_price - this.supplier_cost) / this.supplier_price) * 100;
  }
  return 0;
});

// Virtual for profit amount
supplierProductSchema.virtual('profit_amount').get(function() {
  return this.supplier_price - this.supplier_cost;
});

// Ensure virtual fields are serialized
supplierProductSchema.set('toJSON', { virtuals: true });

// Pre-save middleware to update timestamps
supplierProductSchema.pre('save', function(next) {
  this.updated_at = new Date();
  next();
});

module.exports = mongoose.model('SupplierProduct', supplierProductSchema);
