const Product = require('../models/Product');

// Upload image as base64 directly
async function uploadImageBase64(req, res) {
  // Handle both JSON and FormData requests
  const productId = req.body.productId || req.params.id;
  const imageData = req.body.imageData;
  const mimeType = req.body.mimeType;
  
  if (!productId) {
    return res.status(400).json({ message: 'Product ID is required' });
  }
  
  if (!imageData) {
    return res.status(400).json({ message: 'Image data is required' });
  }
  
  console.log('Received image upload request:', {
    productId,
    imageDataLength: imageData ? imageData.length : 0,
    contentType: req.headers['content-type'],
    bodyKeys: Object.keys(req.body)
  });
  
  // Check payload size (base64 images are ~33% larger than original)
  const payloadSize = Buffer.byteLength(imageData, 'utf8');
  // Reduced limit for deployed servers (Render.com, Heroku, etc. have ~1MB limits)
  const maxSize = 1024 * 1024; // 1MB limit for base64 payload on deployed servers
  
  if (payloadSize > maxSize) {
    return res.status(400).json({ 
      message: `Image too large. Maximum size is 1MB for deployed server. Current size: ${Math.round(payloadSize / 1024)}KB. Please compress your image or use a smaller file.` 
    });
  }
  
  try {
    // Validate base64 data
    const base64Regex = /^data:image\/(jpeg|jpg|png|gif|webp);base64,/;
    let cleanImageData = imageData;
    let detectedMimeType = mimeType || 'image/jpeg';
    
    if (base64Regex.test(imageData)) {
      // Extract base64 part from data URL
      cleanImageData = imageData.split(',')[1];
      const match = imageData.match(/^data:image\/([a-zA-Z]+);base64,/);
      if (match) {
        detectedMimeType = `image/${match[1]}`;
      }
    }
    
    // Validate base64 format
    try {
      const imageBuffer = Buffer.from(cleanImageData, 'base64');
      // Additional check: ensure the decoded image isn't too large
      if (imageBuffer.length > 750 * 1024) { // 750KB decoded limit for deployed servers
        return res.status(400).json({ message: 'Decoded image too large. Maximum size is 750KB for deployed server.' });
      }
    } catch (error) {
      return res.status(400).json({ message: 'Invalid base64 image data' });
    }
    
    // Update product with base64 image
    const product = await Product.findByIdAndUpdate(
      productId,
      {
        image: cleanImageData,
        image_mime_type: detectedMimeType
      },
      { new: true, select: 'name image image_mime_type image_url' }
    );
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    
    res.json({
      message: 'Image uploaded successfully',
      product: {
        id: product._id,
        name: product.name,
        image_url: product.image_url,
        has_image: !!product.image
      }
    });
    
  } catch (error) {
    console.error('Error uploading base64 image:', error);
    res.status(500).json({ message: 'Server error' });
  }
}

// Get image as base64
async function getImageBase64(req, res) {
  const { productId } = req.params;
  
  if (!productId) {
    return res.status(400).json({ message: 'Product ID is required' });
  }
  
  try {
    const product = await Product.findById(productId).select('image image_mime_type');
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    
    if (!product.image) {
      return res.status(404).json({ message: 'Product has no image' });
    }
    
    res.json({
      productId: product._id,
      imageData: product.image,
      mimeType: product.image_mime_type,
      dataUrl: `data:${product.image_mime_type || 'image/jpeg'};base64,${product.image}`
    });
    
  } catch (error) {
    console.error('Error getting base64 image:', error);
    res.status(500).json({ message: 'Server error' });
  }
}

// Delete image
async function deleteImageBase64(req, res) {
  const { productId } = req.params;
  
  if (!productId) {
    return res.status(400).json({ message: 'Product ID is required' });
  }
  
  try {
    const product = await Product.findByIdAndUpdate(
      productId,
      {
        $unset: { image: 1, image_mime_type: 1 }
      },
      { new: true, select: 'name' }
    );
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    
    res.json({
      message: 'Image deleted successfully',
      product: {
        id: product._id,
        name: product.name,
        has_image: false
      }
    });
    
  } catch (error) {
    console.error('Error deleting image:', error);
    res.status(500).json({ message: 'Server error' });
  }
}

module.exports = {
  uploadImageBase64,
  getImageBase64,
  deleteImageBase64
};
