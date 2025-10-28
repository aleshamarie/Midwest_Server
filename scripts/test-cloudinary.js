const cloudinary = require('../src/config/cloudinary');
require('dotenv').config();

async function testCloudinaryConnection() {
  try {
    console.log('Testing Cloudinary connection...');
    
    // Test basic connection by getting account details
    const result = await cloudinary.api.ping();
    console.log('✅ Cloudinary connection successful!');
    console.log('Account status:', result.status);
    
    // Test upload with a simple test image
    console.log('\nTesting image upload...');
    const uploadResult = await cloudinary.uploader.upload(
      'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iIzAwN2JmZiIvPjx0ZXh0IHg9IjUwIiB5PSI1MCIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE0IiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkNsb3VkaW5hcnkgVGVzdDwvdGV4dD48L3N2Zz4=',
      {
        folder: 'midwest-grocery/test',
        public_id: 'test-connection',
        transformation: [
          { width: 200, height: 200, crop: 'limit' }
        ]
      }
    );
    
    console.log('✅ Test image uploaded successfully!');
    console.log('Image URL:', uploadResult.secure_url);
    console.log('Public ID:', uploadResult.public_id);
    
    // Test deletion
    console.log('\nTesting image deletion...');
    const deleteResult = await cloudinary.uploader.destroy(uploadResult.public_id);
    console.log('✅ Test image deleted successfully!');
    console.log('Delete result:', deleteResult.result);
    
    console.log('\n🎉 All Cloudinary tests passed! Your setup is working correctly.');
    
  } catch (error) {
    console.error('❌ Cloudinary test failed:', error.message);
    console.error('\nPlease check:');
    console.error('1. Your Cloudinary credentials in .env file');
    console.error('2. Your internet connection');
    console.error('3. Your Cloudinary account status');
    process.exit(1);
  }
}

// Run test
if (require.main === module) {
  testCloudinaryConnection();
}

module.exports = testCloudinaryConnection;
