const Product = require('../models/Product');
const path = require('path');
const mongoose = require('mongoose');
const { imageOptimization, generatePlaceholder, checkImageExists, resizeImage, progressiveLoading } = require('../middleware/imageOptimization');

// Helper function to validate MongoDB ObjectId
function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

async function listProducts(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page || '1'), 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize || '25'), 1), 100);
    const search = req.query.search || '';
    
    // Build search condition
    let searchQuery = {};
    if (search) {
      searchQuery = {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { category: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        ]
      };
    }
    
    // Get total count with search
    const total = await Product.countDocuments(searchQuery);
    
    // Get paginated products with search
    const products = await Product.find(searchQuery)
      .select('name category description price stock image createdAt')
      .sort({ name: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean();
    
    // Add lazy loading support for images
    const productsWithUrls = products.map(product => ({
      ...product,
      id: product._id,
      image_url: product.image ? `/uploads/${product.image}` : null,
      placeholder_url: product.image ? `/api/products/${product._id}/image/placeholder` : `/assets/images/Midwest.jpg`,
      has_image: !!product.image
    }));
    
    res.json({ 
      products: productsWithUrls, 
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize)
      }
    });
  } catch (_e) {
    console.error('Error in listProducts:', _e);
    res.status(500).json({ message: 'Server error' });
  }
}

async function updateProduct(req, res) {
  const id = req.params.id;
  const { name, category, description, price, stock } = req.body || {};
  if (!id) return res.status(400).json({ message: 'Invalid id' });
  
  // Validate ObjectId format
  if (!isValidObjectId(id)) {
    return res.status(400).json({ message: 'Invalid product ID format' });
  }
  
  if (!name || typeof name !== 'string') return res.status(400).json({ message: 'Name required' });
  try {
    const product = await Product.findByIdAndUpdate(
      id,
      {
        name,
        category: category || null,
        description: description || null,
        price: Number(price) || 0,
        stock: Number(stock) || 0
      },
      { new: true, select: 'name category description price stock image createdAt' }
    );
    if (!product) return res.status(404).json({ message: 'Not found' });
    const productWithUrl = {
      ...product.toObject(),
      id: product._id,
      image_url: product.image ? `/uploads/${product.image}` : `/assets/images/Midwest.jpg`
    };
    res.json({ product: productWithUrl });
  } catch (_e) {
    res.status(500).json({ message: 'Server error' });
  }
}

async function uploadProductImage(req, res) {
  const id = req.params.id;
  if (!id) return res.status(400).json({ message: 'Invalid id' });
  
  if (!req.file) {
    return res.status(400).json({ message: 'No image file provided' });
  }

  try {
    // Convert file to base64
    const fs = require('fs');
    const imageBuffer = fs.readFileSync(req.file.path);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = req.file.mimetype;
    
    // Update product with base64 image data
    const product = await Product.findByIdAndUpdate(
      id,
      { 
        image: base64Image,
        image_mime_type: mimeType
      },
      { new: true, select: 'name category price stock image image_mime_type createdAt' }
    );
    
    if (!product) return res.status(404).json({ message: 'Product not found' });
    
    // Clean up uploaded file
    fs.unlinkSync(req.file.path);
    
    const productWithUrl = {
      ...product.toObject(),
      id: product._id,
      image_url: product.image_url
    };
    
    res.json({ 
      message: 'Image uploaded successfully',
      product: productWithUrl
    });
  } catch (_e) {
    console.error('Error uploading image:', _e);
    res.status(500).json({ message: 'Server error' });
  }
}

async function deleteProductImage(req, res) {
  const id = req.params.id;
  if (!id) return res.status(400).json({ message: 'Invalid id' });
  
  try {
    // Get current product to check if image exists
    const product = await Product.findById(id).select('image image_mime_type');
    if (!product) return res.status(404).json({ message: 'Product not found' });
    
    const hadImage = !!product.image;
    console.log(`Deleting image for product ${id}: ${hadImage ? 'has image' : 'no image'}`);
    
    // Remove image from database
    await Product.findByIdAndUpdate(id, { 
      $unset: { image: 1, image_mime_type: 1 } 
    });
    
    res.json({ 
      message: 'Image deleted successfully',
      hadImage: hadImage
    });
  } catch (error) {
    console.error('Error deleting product image:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
}

// Cleanup function for base64 images (no longer needed for file cleanup)
async function cleanupOrphanedImages(req, res) {
  try {
    // Since images are now stored as base64 in the database,
    // there are no orphaned files to clean up
    res.json({ 
      message: 'No cleanup needed - images are stored in database',
      deletedFiles: [],
      deletedCount: 0
    });
  } catch (error) {
    console.error('Error during cleanup:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
}

async function getProduct(req, res) {
  const id = req.params.id;
  if (!id) return res.status(400).json({ message: 'Invalid id' });
  
  // Validate ObjectId format
  if (!isValidObjectId(id)) {
    return res.status(400).json({ message: 'Invalid product ID format' });
  }
  
  try {
    const product = await Product.findById(id)
      .select('name category description price stock image createdAt');
    
    if (!product) return res.status(404).json({ message: 'Product not found' });
    
    const productWithUrl = {
      ...product.toObject(),
      id: product._id,
      image_url: product.image ? `/uploads/${product.image}` : `/assets/images/Midwest.jpg`
    };
    
    res.json({ product: productWithUrl });
  } catch (_e) {
    console.error('Error in getProduct:', _e);
    res.status(500).json({ message: 'Server error' });
  }
}

// Lazy loading endpoints
async function getProductImage(req, res) {
  const id = req.params.id;
  if (!id) return res.status(400).json({ message: 'Invalid id' });
  
  try {
    const product = await Product.findById(id).select('image image_mime_type');
    if (!product || !product.image) {
      return res.status(404).json({ message: 'Product or image not found' });
    }
    
    // Convert base64 to buffer
    const imageBuffer = Buffer.from(product.image, 'base64');
    const mimeType = product.image_mime_type || 'image/jpeg';
    
    // Set appropriate headers
    res.set({
      'Content-Type': mimeType,
      'Content-Length': imageBuffer.length,
      'Cache-Control': 'public, max-age=86400' // 1 day
    });
    
    res.send(imageBuffer);
  } catch (error) {
    console.error('Error serving product image:', error);
    res.status(500).json({ message: 'Server error' });
  }
}

async function getProductImagePlaceholder(req, res) {
  const id = req.params.id;
  if (!id) return res.status(400).json({ message: 'Invalid id' });
  
  try {
    const product = await Product.findById(id).select('image');
    if (!product || !product.image) {
      // Return default placeholder
      const defaultPath = path.join(__dirname, '../../assets/images/Midwest.jpg');
      return res.sendFile(defaultPath);
    }
    
    // Set placeholder-specific headers
    res.set({
      'Cache-Control': 'public, max-age=86400', // 1 day
      'Content-Type': 'image/svg+xml',
      'X-Image-Type': 'placeholder',
      'X-Loading-Strategy': 'lazy'
    });
    
    // Generate and return SVG placeholder
    const placeholder = generatePlaceholder(48, 48);
    res.send(placeholder);
  } catch (error) {
    console.error('Error serving placeholder:', error);
    res.status(500).json({ message: 'Server error' });
  }
}

async function getProductThumbnail(req, res) {
  const id = req.params.id;
  const size = req.query.size || 'small'; // small, medium, large
  
  if (!id) return res.status(400).json({ message: 'Invalid id' });
  
  try {
    const product = await Product.findById(id).select('image image_mime_type');
    if (!product || !product.image) {
      const defaultPath = path.join(__dirname, '../../assets/images/Midwest.jpg');
      return res.sendFile(defaultPath);
    }
    
    // Convert base64 to buffer
    const imageBuffer = Buffer.from(product.image, 'base64');
    const mimeType = product.image_mime_type || 'image/jpeg';
    
    // Set thumbnail-specific headers
    res.set({
      'Cache-Control': 'public, max-age=604800', // 1 week
      'Content-Type': mimeType,
      'Content-Length': imageBuffer.length,
      'X-Image-Type': 'thumbnail',
      'X-Thumbnail-Size': size,
      'X-Loading-Strategy': 'eager'
    });
    
    res.send(imageBuffer);
  } catch (error) {
    console.error('Error serving thumbnail:', error);
    res.status(500).json({ message: 'Server error' });
  }
}

// Get all products with lazy loading support
async function getAllProductsLazy(req, res) {
  try {
    const search = req.query.search || '';
    
    // Build search condition
    let searchQuery = {};
    if (search) {
      searchQuery = {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { category: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        ]
      };
    }
    
    // Get all products (no pagination for lazy loading)
    const products = await Product.find(searchQuery)
      .select('name category description price stock image createdAt')
      .sort({ name: 1 })
      .lean();
    
    // Add lazy loading support for images
    const productsWithUrls = products.map(product => ({
      ...product,
      id: product._id,
      image_url: product.image ? `/api/products/${product._id}/image` : null,
      placeholder_url: product.image ? `/api/products/${product._id}/image/placeholder` : `/assets/images/Midwest.jpg`,
      thumbnail_url: product.image ? `/api/products/${product._id}/image/thumbnail` : `/assets/images/Midwest.jpg`,
      has_image: !!product.image
    }));
    
    res.json({ 
      products: productsWithUrls,
      total: productsWithUrls.length,
      lazy_loading: true
    });
  } catch (error) {
    console.error('Error in getAllProductsLazy:', error);
    res.status(500).json({ message: 'Server error' });
  }
}

// Get all low stock items with lazy loading support
async function getLowStockItems(req, res) {
  try {
    const lowStockThreshold = parseInt(req.query.threshold || '5');
    const search = req.query.search || '';
    
    // Build search condition for low stock items
    let searchQuery = { stock: { $lte: lowStockThreshold } };
    
    if (search) {
      searchQuery = {
        $and: [
          { stock: { $lte: lowStockThreshold } },
          {
            $or: [
              { name: { $regex: search, $options: 'i' } },
              { category: { $regex: search, $options: 'i' } },
              { description: { $regex: search, $options: 'i' } }
            ]
          }
        ]
      };
    }
    
    // Get all low stock products
    const products = await Product.find(searchQuery)
      .select('name category description price stock image createdAt')
      .sort({ stock: 1, name: 1 })
      .lean();
    
    // Add lazy loading support for images
    const productsWithUrls = products.map(product => ({
      ...product,
      id: product._id,
      image_url: product.image ? `/api/products/${product._id}/image` : null,
      placeholder_url: product.image ? `/api/products/${product._id}/image/placeholder` : `/assets/images/Midwest.jpg`,
      thumbnail_url: product.image ? `/api/products/${product._id}/image/thumbnail` : `/assets/images/Midwest.jpg`,
      has_image: !!product.image,
      is_low_stock: true,
      stock_status: product.stock === 0 ? 'out_of_stock' : 'low_stock'
    }));
    
    res.json({ 
      products: productsWithUrls,
      total: productsWithUrls.length,
      low_stock_threshold: lowStockThreshold,
      out_of_stock: productsWithUrls.filter(p => p.stock === 0).length,
      low_stock: productsWithUrls.filter(p => p.stock > 0 && p.stock <= lowStockThreshold).length,
      lazy_loading: true
    });
  } catch (error) {
    console.error('Error in getLowStockItems:', error);
    res.status(500).json({ message: 'Server error' });
  }
}

async function createProduct(req, res) {
  const { name, category, description, price, stock } = req.body || {};
  
  // Validate required fields
  if (!name || typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ message: 'Product name is required' });
  }
  
  if (price === undefined || price === null) {
    return res.status(400).json({ message: 'Price is required' });
  }
  
  if (stock === undefined || stock === null) {
    return res.status(400).json({ message: 'Stock is required' });
  }
  
  try {
    const product = new Product({
      name: name.trim(),
      category: category ? category.trim() : null,
      description: description ? description.trim() : null,
      price: Number(price) || 0,
      stock: Number(stock) || 0
    });
    
    await product.save();
    
    const productWithUrl = {
      ...product.toObject(),
      id: product._id,
      image_url: product.image ? `/uploads/${product.image}` : null,
      placeholder_url: product.image ? `/api/products/${product._id}/image/placeholder` : `/assets/images/Midwest.jpg`,
      has_image: !!product.image
    };
    
    res.status(201).json({ 
      message: 'Product created successfully',
      product: productWithUrl
    });
  } catch (error) {
    console.error('Error creating product:', error);
    if (error.code === 11000) {
      res.status(400).json({ message: 'Product with this name already exists' });
    } else {
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
}

async function deleteProduct(req, res) {
  const id = req.params.id;
  if (!id) return res.status(400).json({ message: 'Invalid id' });
  
  // Validate ObjectId format
  if (!isValidObjectId(id)) {
    return res.status(400).json({ message: 'Invalid product ID format' });
  }
  
  try {
    const product = await Product.findByIdAndDelete(id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    
    res.json({ 
      message: 'Product deleted successfully',
      deletedProduct: {
        id: product._id,
        name: product.name
      }
    });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
}

module.exports = { 
  listProducts, 
  getProduct, 
  createProduct,
  updateProduct, 
  deleteProduct,
  uploadProductImage, 
  deleteProductImage, 
  cleanupOrphanedImages,
  getProductImage,
  getProductImagePlaceholder,
  getProductThumbnail,
  getAllProductsLazy,
  getLowStockItems
};


