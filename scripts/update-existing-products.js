const mongoose = require('mongoose');
const Product = require('../src/models/Product');
const dotenv = require('dotenv');

dotenv.config();

// Connect to MongoDB
const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/midwest_grocery';
console.log('Connecting to MongoDB:', mongoURI);

mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Handle connection events
mongoose.connection.on('connected', () => {
  console.log('Connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('Disconnected from MongoDB');
});

async function updateExistingProducts() {
  try {
    console.log('Starting to update existing products with dart_hash...');
    
    // Get all products
    const products = await Product.find({});
    console.log(`Found ${products.length} products to process`);
    
    let updated = 0;
    let skipped = 0;
    
    for (const product of products) {
      // Skip if already has dart_hash
      if (product.dart_hash) {
        skipped++;
        continue;
      }
      
      // Calculate Dart's hashCode for the ObjectId string
      const objectIdString = product._id.toString();
      let hash = 0;
      for (let i = 0; i < objectIdString.length; i++) {
        const char = objectIdString.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
      }
      
      // Update the product with the calculated hash
      await Product.findByIdAndUpdate(product._id, { dart_hash: Math.abs(hash) });
      updated++;
      
      if (updated % 50 === 0) {
        console.log(`Updated ${updated} products...`);
      }
    }
    
    console.log(`Update complete:`);
    console.log(`- Updated: ${updated} products`);
    console.log(`- Skipped: ${skipped} products (already had dart_hash)`);
    
    // Verify the update
    const totalProducts = await Product.countDocuments();
    const productsWithHash = await Product.countDocuments({ dart_hash: { $exists: true } });
    console.log(`Total products: ${totalProducts}, Products with hash: ${productsWithHash}`);
    
  } catch (error) {
    console.error('Error updating products:', error);
  } finally {
    mongoose.connection.close();
  }
}

// Run the update
updateExistingProducts();
