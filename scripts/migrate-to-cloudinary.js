const mongoose = require('mongoose');
const cloudinary = require('../src/config/cloudinary');
const Product = require('../src/models/Product');
require('dotenv').config();

async function migrateImagesToCloudinary() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/midwestgrocery');
    console.log('Connected to MongoDB');

    // Find all products with base64 images
    const productsWithImages = await Product.find({
      image: { $exists: true, $ne: null },
      image_url: { $exists: false } // Only products without Cloudinary URLs
    }).select('_id name image image_mime_type');

    console.log(`Found ${productsWithImages.length} products with base64 images to migrate`);

    let successCount = 0;
    let errorCount = 0;

    for (const product of productsWithImages) {
      try {
        console.log(`Migrating image for product: ${product.name} (${product._id})`);

        // Upload to Cloudinary
        const result = await cloudinary.uploader.upload(
          `data:${product.image_mime_type || 'image/jpeg'};base64,${product.image}`,
          {
            folder: 'midwest-grocery/products',
            public_id: `product-${product._id}-${Date.now()}`,
            transformation: [
              { width: 800, height: 800, crop: 'limit', quality: 'auto' },
              { fetch_format: 'auto' }
            ]
          }
        );

        // Update product with Cloudinary URL and public ID
        await Product.findByIdAndUpdate(product._id, {
          image_url: result.secure_url,
          image_public_id: result.public_id
        });

        console.log(`✅ Successfully migrated image for ${product.name}`);
        successCount++;

        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error(`❌ Error migrating image for ${product.name}:`, error.message);
        errorCount++;
      }
    }

    console.log(`\nMigration completed:`);
    console.log(`✅ Successfully migrated: ${successCount} images`);
    console.log(`❌ Errors: ${errorCount} images`);

    // Optional: Remove base64 data after successful migration
    if (successCount > 0) {
      const removeBase64 = process.argv.includes('--remove-base64');
      if (removeBase64) {
        console.log('\nRemoving base64 image data from database...');
        await Product.updateMany(
          { image_url: { $exists: true } },
          { $unset: { image: 1, image_mime_type: 1 } }
        );
        console.log('✅ Base64 image data removed from database');
      } else {
        console.log('\nTo remove base64 data after verification, run with --remove-base64 flag');
      }
    }

  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run migration
if (require.main === module) {
  migrateImagesToCloudinary();
}

module.exports = migrateImagesToCloudinary;
