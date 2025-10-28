const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  handle: {
    type: String,
    unique: true,
    sparse: true
  },
  sku: String,
  name: {
    type: String,
    required: true,
    trim: true
  },
  category: String,
  description: String,
  image_url: String, // Cloudinary image URL
  image_public_id: String, // Cloudinary public ID for image management
  sold_by_weight: {
    type: Boolean,
    default: false
  },
  option1_name: String,
  option1_value: String,
  option2_name: String,
  option2_value: String,
  option3_name: String,
  option3_value: String,
  cost: {
    type: Number,
    default: 0.00
  },
  barcode: String,
  included_sku: String,
  included_qty: {
    type: Number,
    default: 0
  },
  track_stock: {
    type: Boolean,
    default: true
  },
  available_for_sale: {
    type: Boolean,
    default: true
  },
  price: {
    type: Number,
    required: true,
    default: 0.00
  },
  stock: {
    type: Number,
    required: true,
    default: 0
  },
  low_stock_threshold: {
    type: Number,
    default: 5
  },
  tax_label: String,
  tax_rate: {
    type: Number,
    default: 0.00
  },
  dart_hash: {
    type: Number,
    index: true
  }
}, {
  timestamps: true
});

// Index for search functionality
productSchema.index({ name: 'text', category: 'text', description: 'text' });

// Index for sorting by name (ascending)
productSchema.index({ name: 1 });

// Compound index for sorting by name with stock filtering
productSchema.index({ stock: 1, name: 1 });

// Pre-save hook to calculate Dart hash
productSchema.pre('save', function(next) {
  if (this.isNew || this.isModified('_id')) {
    // Calculate Dart's hashCode for the ObjectId string
    const objectIdString = this._id.toString();
    // Dart's hashCode algorithm (exact implementation)
    let hash = 0;
    for (let i = 0; i < objectIdString.length; i++) {
      const char = objectIdString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    // Dart's hashCode returns the absolute value
    this.dart_hash = Math.abs(hash);
    console.log(`Calculated dart_hash for ${this.name}: ${this.dart_hash} (from ObjectId: ${objectIdString})`);
  }
  next();
});

// Virtual for placeholder URL
productSchema.virtual('placeholder_url').get(function() {
  return this.image_url ? this.image_url : `/assets/images/Midwest.jpg`;
});

// Virtual for thumbnail URL
productSchema.virtual('thumbnail_url').get(function() {
  return this.image_url ? this.image_url : `/assets/images/Midwest.jpg`;
});

// Virtual for has_image
productSchema.virtual('has_image').get(function() {
  return !!this.image_url;
});

// Ensure virtual fields are serialized
productSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Product', productSchema);
