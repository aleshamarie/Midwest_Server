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
  image: String, // Base64 encoded image data
  image_mime_type: String, // MIME type (image/jpeg, image/png, etc.)
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

// Pre-save hook to calculate Dart hash
productSchema.pre('save', function(next) {
  if (this.isNew || this.isModified('_id')) {
    // Calculate Dart's hashCode for the ObjectId string
    const objectIdString = this._id.toString();
    // Dart's hashCode algorithm (simplified version)
    let hash = 0;
    for (let i = 0; i < objectIdString.length; i++) {
      const char = objectIdString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    // Dart's hashCode returns the absolute value
    this.dart_hash = Math.abs(hash);
  }
  next();
});

// Virtual for image URL (base64 data URL)
productSchema.virtual('image_url').get(function() {
  return this.image ? `data:${this.image_mime_type || 'image/jpeg'};base64,${this.image}` : null;
});

// Virtual for placeholder URL
productSchema.virtual('placeholder_url').get(function() {
  return this.image ? `/api/products/${this._id}/image/placeholder` : `/assets/images/Midwest.jpg`;
});

// Virtual for thumbnail URL
productSchema.virtual('thumbnail_url').get(function() {
  return this.image ? `/api/products/${this._id}/image/thumbnail` : `/assets/images/Midwest.jpg`;
});

// Virtual for has_image
productSchema.virtual('has_image').get(function() {
  return !!this.image;
});

// Ensure virtual fields are serialized
productSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Product', productSchema);
