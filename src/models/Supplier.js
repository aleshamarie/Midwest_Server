const mongoose = require('mongoose');

const supplierSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  contact: String,
  email: String,
  phone: String,
  address: String,
  city: String,
  state: String,
  zip_code: String,
  country: String,
  // Business information
  business_type: {
    type: String,
    enum: ['Manufacturer', 'Distributor', 'Wholesaler', 'Retailer', 'Other'],
    default: 'Distributor'
  },
  tax_id: String,
  license_number: String,
  // Relationship with products (legacy - for backward compatibility)
  products: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  }],
  // Enhanced relationship tracking
  supplier_products: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SupplierProduct'
  }],
  // Performance metrics
  total_orders: {
    type: Number,
    default: 0
  },
  total_value: {
    type: Number,
    default: 0
  },
  average_rating: {
    type: Number,
    min: 1,
    max: 5,
    default: 3
  },
  // Status and availability
  is_active: {
    type: Boolean,
    default: true
  },
  is_preferred: {
    type: Boolean,
    default: false
  },
  // Delivery information
  last_delivery: Date,
  // Last order date (tracks the most recent order placed with this supplier)
  last_order_date: Date,
  delivery_lead_time: {
    type: Number,
    default: 7 // days
  },
  minimum_order_value: {
    type: Number,
    default: 0
  },
  // Payment terms
  payment_terms: {
    type: String,
    enum: ['Net 30', 'Net 15', 'Net 7', 'COD', 'Prepaid'],
    default: 'Net 30'
  },
  credit_limit: {
    type: Number,
    default: 0
  },
  // Notes and special instructions
  notes: String,
  special_instructions: String,
  // Compliance and certifications
  certifications: [String], // e.g., ['ISO9001', 'HACCP', 'Organic']
  compliance_status: {
    type: String,
    enum: ['Compliant', 'Pending', 'Non-Compliant', 'Under Review'],
    default: 'Compliant'
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
supplierSchema.index({ name: 1 });
supplierSchema.index({ is_active: 1 });
supplierSchema.index({ is_preferred: 1 });
supplierSchema.index({ business_type: 1 });

// Virtual for full address
supplierSchema.virtual('full_address').get(function() {
  const parts = [this.address, this.city, this.state, this.zip_code, this.country];
  return parts.filter(part => part && part.trim()).join(', ');
});

// Virtual for supplier performance score
supplierSchema.virtual('performance_score').get(function() {
  // Simple scoring based on rating and order count
  const ratingScore = (this.average_rating / 5) * 50;
  const orderScore = Math.min(this.total_orders / 10, 50); // Max 50 points for orders
  return Math.round(ratingScore + orderScore);
});

// Ensure virtual fields are serialized
supplierSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Supplier', supplierSchema);
