const cloudinary = require('../config/cloudinary');
const Product = require('../models/Product');
const multer = require('multer');
const { Readable } = require('stream');

// Configure multer for memory storage (for Cloudinary)
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(file.originalname.toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files (jpeg, jpg, png, gif, webp) are allowed!'));
    }
  }
});

// Upload image to Cloudinary
async function uploadImage(req, res) {
  const productId = req.params.id;
  
  if (!productId) {
    return res.status(400).json({ message: 'Product ID is required' });
  }
  
  if (!req.file) {
    return res.status(400).json({ message: 'No image file provided' });
  }

  // Check file size (5MB limit)
  const maxSize = 5 * 1024 * 1024; // 5MB in bytes
  if (req.file.size > maxSize) {
    return res.status(400).json({ 
      message: `Image file too large. Maximum size is 5MB. Current size: ${Math.round(req.file.size / 1024 / 1024 * 100) / 100}MB` 
    });
  }

  try {
    // Convert buffer to stream for Cloudinary
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'midwest-grocery/products',
        public_id: `product-${productId}-${Date.now()}`,
        transformation: [
          { width: 800, height: 800, crop: 'limit', quality: 'auto' },
          { fetch_format: 'auto' }
        ]
      },
      async (error, result) => {
        if (error) {
          console.error('Cloudinary upload error:', error);
          return res.status(500).json({ message: 'Failed to upload image to Cloudinary' });
        }

        try {
          // Update product with Cloudinary URL and public ID
          const product = await Product.findByIdAndUpdate(
            productId,
            {
              image_url: result.secure_url,
              image_public_id: result.public_id
            },
            { new: true, select: 'name image_url image_public_id createdAt' }
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
              has_image: !!product.image_url
            }
          });
        } catch (dbError) {
          console.error('Database update error:', dbError);
          // If database update fails, delete the uploaded image from Cloudinary
          await cloudinary.uploader.destroy(result.public_id);
          res.status(500).json({ message: 'Failed to update product with image URL' });
        }
      }
    );

    // Pipe the file buffer to the stream
    const bufferStream = new Readable();
    bufferStream.push(req.file.buffer);
    bufferStream.push(null);
    bufferStream.pipe(stream);

  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({ message: 'Server error' });
  }
}

// Upload image from base64 (for migration purposes)
async function uploadImageFromBase64(req, res) {
  const productId = req.params.id;
  const { imageData, mimeType } = req.body;
  
  if (!productId) {
    return res.status(400).json({ message: 'Product ID is required' });
  }
  
  if (!imageData) {
    return res.status(400).json({ message: 'Image data is required' });
  }

  // Check base64 payload size (5MB limit)
  const payloadSize = Buffer.byteLength(imageData, 'utf8');
  const maxSize = 5 * 1024 * 1024; // 5MB limit
  if (payloadSize > maxSize) {
    return res.status(400).json({ 
      message: `Image too large. Maximum size is 5MB. Current size: ${Math.round(payloadSize / 1024 / 1024 * 100) / 100}MB` 
    });
  }

  try {
    // Clean base64 data
    let cleanImageData = imageData;
    if (imageData.includes(',')) {
      cleanImageData = imageData.split(',')[1];
    }

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(
      `data:${mimeType || 'image/jpeg'};base64,${cleanImageData}`,
      {
        folder: 'midwest-grocery/products',
        public_id: `product-${productId}-${Date.now()}`,
        transformation: [
          { width: 800, height: 800, crop: 'limit', quality: 'auto' },
          { fetch_format: 'auto' }
        ]
      }
    );

    // Update product with Cloudinary URL and public ID
    const product = await Product.findByIdAndUpdate(
      productId,
      {
        image_url: result.secure_url,
        image_public_id: result.public_id
      },
      { new: true, select: 'name image_url image_public_id createdAt' }
    );

    if (!product) {
      // If product not found, delete the uploaded image
      await cloudinary.uploader.destroy(result.public_id);
      return res.status(404).json({ message: 'Product not found' });
    }

    res.json({
      message: 'Image uploaded successfully',
      product: {
        id: product._id,
        name: product.name,
        image_url: product.image_url,
        has_image: !!product.image_url
      }
    });

  } catch (error) {
    console.error('Error uploading base64 image to Cloudinary:', error);
    res.status(500).json({ message: 'Server error' });
  }
}

// Delete image from Cloudinary
async function deleteImage(req, res) {
  const productId = req.params.id;
  
  if (!productId) {
    return res.status(400).json({ message: 'Product ID is required' });
  }

  try {
    // Get product to find the public_id
    const product = await Product.findById(productId).select('image_public_id name');
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    if (!product.image_public_id) {
      return res.status(404).json({ message: 'Product has no image to delete' });
    }

    // Delete from Cloudinary
    const result = await cloudinary.uploader.destroy(product.image_public_id);
    
    if (result.result === 'ok') {
      // Update product to remove image references
      await Product.findByIdAndUpdate(
        productId,
        {
          $unset: { image_url: 1, image_public_id: 1 }
        }
      );

      res.json({
        message: 'Image deleted successfully',
        product: {
          id: product._id,
          name: product.name,
          has_image: false
        }
      });
    } else {
      res.status(500).json({ message: 'Failed to delete image from Cloudinary' });
    }

  } catch (error) {
    console.error('Error deleting image:', error);
    res.status(500).json({ message: 'Server error' });
  }
}

// Get image URL (for backward compatibility)
async function getImageUrl(req, res) {
  const productId = req.params.id;
  
  if (!productId) {
    return res.status(400).json({ message: 'Product ID is required' });
  }

  try {
    const product = await Product.findById(productId).select('image_url image_public_id');
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    if (!product.image_url) {
      return res.status(404).json({ message: 'Product has no image' });
    }

    res.json({
      productId: product._id,
      image_url: product.image_url,
      public_id: product.image_public_id
    });

  } catch (error) {
    console.error('Error getting image URL:', error);
    res.status(500).json({ message: 'Server error' });
  }
}

module.exports = {
  uploadImage,
  uploadImageFromBase64,
  deleteImage,
  getImageUrl,
  upload // Export multer middleware
};
