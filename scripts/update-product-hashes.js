const mongoose = require('mongoose');
const Product = require('../src/models/Product');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/midwest_grocery', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function updateProductHashes() {
  try {
    console.log('Starting to update product hashes...');
    
    // Get all products that don't have dart_hash
    const products = await Product.find({ dart_hash: { $exists: false } });
    console.log(`Found ${products.length} products to update`);
    
    let updated = 0;
    for (const product of products) {
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
      
      if (updated % 100 === 0) {
        console.log(`Updated ${updated} products...`);
      }
    }
    
    console.log(`Successfully updated ${updated} products with dart_hash`);
    
    // Verify the update
    const totalProducts = await Product.countDocuments();
    const productsWithHash = await Product.countDocuments({ dart_hash: { $exists: true } });
    console.log(`Total products: ${totalProducts}, Products with hash: ${productsWithHash}`);
    
  } catch (error) {
    console.error('Error updating product hashes:', error);
  } finally {
    mongoose.connection.close();
  }
}

updateProductHashes();
