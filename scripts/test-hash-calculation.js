// Test script to verify hash calculation matches Dart's hashCode
const mongoose = require('mongoose');
const Product = require('../src/models/Product');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/midwest_grocery');

function calculateDartHash(objectIdString) {
  let hash = 0;
  for (let i = 0; i < objectIdString.length; i++) {
    const char = objectIdString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

async function testHashCalculation() {
  try {
    console.log('Testing hash calculation...');
    
    // Get a few products to test
    const products = await Product.find({}).limit(5);
    
    console.log('Product ID -> Hash calculation:');
    for (const product of products) {
      const objectIdString = product._id.toString();
      const calculatedHash = calculateDartHash(objectIdString);
      console.log(`${objectIdString} -> ${calculatedHash}`);
    }
    
    // Test with a known ObjectId
    const testId = '507f1f77bcf86cd799439011';
    const testHash = calculateDartHash(testId);
    console.log(`\nTest ObjectId: ${testId} -> Hash: ${testHash}`);
    
  } catch (error) {
    console.error('Error testing hash calculation:', error);
  } finally {
    mongoose.connection.close();
  }
}

// Run the test
testHashCalculation();
