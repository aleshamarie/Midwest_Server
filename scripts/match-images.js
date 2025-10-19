#!/usr/bin/env node
/*
  Script to match product images with database products
  Usage: node scripts/match-images.js
*/
const fs = require('fs');
const path = require('path');
const db = require('../src/config/db');

async function matchImagesToProducts() {
  try {
    console.log('🔄 Starting image matching process...');
    
    // Get all products from database
    const [products] = await db.query('SELECT id, name, sku, handle FROM products ORDER BY id');
    console.log(`📦 Found ${products.length} products in database`);
    
    // Get all image files from uploads directory
    const uploadsDir = path.join(__dirname, '../uploads');
    const imageFiles = fs.readdirSync(uploadsDir)
      .filter(file => /\.(jpg|jpeg|png|gif|webp)$/i.test(file))
      .map(file => ({
        filename: file,
        nameWithoutExt: path.parse(file).name.toLowerCase()
      }));
    
    console.log(`🖼️  Found ${imageFiles.length} image files`);
    
    let matched = 0;
    let updated = 0;
    
    // Match images to products
    for (const product of products) {
      const productName = product.name.toLowerCase();
      const productSku = (product.sku || '').toLowerCase();
      const productHandle = (product.handle || '').toLowerCase();
      
      // Try to find matching image
      let bestMatch = null;
      let bestScore = 0;
      
      for (const image of imageFiles) {
        let score = 0;
        const imageName = image.nameWithoutExt;
        
        // Exact match
        if (imageName === productName) {
          score = 100;
        }
        // Handle match
        else if (productHandle && imageName === productHandle) {
          score = 95;
        }
        // SKU match
        else if (productSku && imageName === productSku) {
          score = 90;
        }
        // Partial name match
        else if (imageName.includes(productName) || productName.includes(imageName)) {
          score = 70;
        }
        // Brand/prefix match (e.g., "555_adobo" matches "555 Adobo")
        else {
          const words = productName.split(' ');
          for (const word of words) {
            if (word.length > 2 && imageName.includes(word)) {
              score = Math.max(score, 50);
            }
          }
        }
        
        if (score > bestScore && score >= 50) {
          bestMatch = image;
          bestScore = score;
        }
      }
      
      if (bestMatch) {
        console.log(`✅ Matched: ${product.name} -> ${bestMatch.filename} (score: ${bestScore})`);
        
        // Update database with image filename
        await db.query(
          'UPDATE products SET image = ? WHERE id = ?',
          [bestMatch.filename, product.id]
        );
        
        matched++;
        updated++;
        
        // Remove matched image from list to avoid duplicates
        imageFiles.splice(imageFiles.indexOf(bestMatch), 1);
      } else {
        console.log(`❌ No match found for: ${product.name}`);
      }
    }
    
    console.log(`\n📊 Results:`);
    console.log(`✅ Products matched: ${matched}`);
    console.log(`🖼️  Images updated: ${updated}`);
    console.log(`📁 Unmatched images: ${imageFiles.length}`);
    
    if (imageFiles.length > 0) {
      console.log(`\n🔍 Unmatched images:`);
      imageFiles.slice(0, 10).forEach(img => console.log(`   - ${img.filename}`));
      if (imageFiles.length > 10) {
        console.log(`   ... and ${imageFiles.length - 10} more`);
      }
    }
    
    console.log('\n🎉 Image matching completed!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

// Run the script
matchImagesToProducts();
