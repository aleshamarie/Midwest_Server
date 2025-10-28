#!/usr/bin/env node
/*
  CLI: Import CSV files into Midwest Grocery MongoDB
  Usage:
    node scripts/import-mongodb.js products "C:/path/to/export_items-1.csv"
*/
const fs = require('fs');
const { parse } = require('csv-parse');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config();

// Connect to MongoDB
const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI;
    const conn = await mongoose.connect(mongoURI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

// Product Schema (matching the existing Product model)
const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { type: String, required: true },
  description: { type: String, default: '' },
  price: { type: Number, required: true, min: 0 },
  stock: { type: Number, default: 0, min: 0 },
  cost: { type: Number, default: 0, min: 0 },
  sold_by_weight: { type: Boolean, default: false },
  track_stock: { type: Boolean, default: true },
  available_for_sale: { type: Boolean, default: true },
  low_stock_threshold: { type: Number, default: 5 },
  tax_rate: { type: Number, default: 0 },
  barcode: String,
  sku: String,
  handle: String,
  image: String,
  image_mime_type: String,
  dart_hash: Number
}, {
  timestamps: true
});

const Product = mongoose.model('Product', productSchema);

// Function to generate dart_hash (similar to the existing logic)
function generateDartHash(objectIdString) {
  let hash = 0;
  for (let i = 0; i < objectIdString.length; i++) {
    const char = objectIdString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

async function importProducts(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error('File not found: ' + filePath);
  }

  console.log('Starting product import from:', filePath);
  
  let imported = 0;
  let skipped = 0;
  let errors = 0;

  try {
    await new Promise((resolve, reject) => {
      const stream = fs.createReadStream(filePath)
        .pipe(parse({ columns: true, trim: true }))
        .on('data', async (row) => {
          stream.pause();
          try {
            const name = row.Name;
            if (!name || name.trim() === '') {
              skipped++;
              stream.resume();
              return;
            }

            const category = row.Category || 'Uncategorized';
            const description = row.Description || '';
            const soldByWeight = (row['Sold by weight'] || 'N').toString().toUpperCase() === 'Y';
            const cost = parseFloat(row.Cost || 0) || 0;
            const barcode = row.Barcode || null;
            const sku = row.SKU || null;
            const handle = row.Handle || null;
            const trackStock = (row['Track stock'] || 'Y').toString().toUpperCase() === 'Y';
            const availableForSale = (row['Available for sale [Midwest Grocery Store]'] || 'Y').toString().toUpperCase() === 'Y';
            const price = parseFloat(row['Price [Midwest Grocery Store]'] || 0) || 0;
            const stock = parseInt(row['In stock [Midwest Grocery Store]'] || 0) || 0;
            const lowStockThreshold = parseInt(row['Low stock [Midwest Grocery Store]'] || 5) || 5;
            const taxField = row['"Tax - ""VAT"" (12%)"'] || row['Tax - "VAT" (12%)'] || null;
            const taxRate = taxField && taxField.toString().toUpperCase() === 'Y' ? 12 : 0;

            // Create a temporary ObjectId to generate dart_hash
            const tempId = new mongoose.Types.ObjectId();
            const dartHash = generateDartHash(tempId.toString());

            const productData = {
              name: name.trim(),
              category: category.trim(),
              description: description.trim(),
              price: price,
              stock: stock,
              cost: cost,
              sold_by_weight: soldByWeight,
              track_stock: trackStock,
              available_for_sale: availableForSale,
              low_stock_threshold: lowStockThreshold,
              tax_rate: taxRate,
              barcode: barcode,
              sku: sku,
              handle: handle,
              dart_hash: dartHash
            };

            // Check if product already exists (by name and category)
            const existingProduct = await Product.findOne({ 
              name: productData.name, 
              category: productData.category 
            });

            if (existingProduct) {
              // Update existing product
              await Product.findByIdAndUpdate(existingProduct._id, productData);
              console.log(`Updated: ${productData.name}`);
            } else {
              // Create new product
              const product = new Product(productData);
              await product.save();
              console.log(`Imported: ${productData.name}`);
            }

            imported++;
          } catch (error) {
            console.error('Error processing row:', error.message);
            errors++;
          }
          stream.resume();
        })
        .on('end', resolve)
        .on('error', reject);
    });

    console.log(`\nImport completed!`);
    console.log(`- Imported/Updated: ${imported}`);
    console.log(`- Skipped: ${skipped}`);
    console.log(`- Errors: ${errors}`);

  } catch (error) {
    console.error('Import failed:', error);
    process.exit(1);
  }
}

async function main() {
  const filePath = process.argv[2];
  
  if (!filePath) {
    console.log('Usage: node scripts/import-mongodb.js "C:/path/to/export_items-1.csv"');
    process.exit(1);
  }

  try {
    await connectDB();
    await importProducts(filePath);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed.');
  }
}

main();
