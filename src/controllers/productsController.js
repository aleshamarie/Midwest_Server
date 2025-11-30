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
    
    // Get paginated products with search and external sorting
    const products = await Product.find(searchQuery)
      .select('name category description price stock barcode image_url image_public_id variants createdAt')
      .sort({ name: 1 })
      .allowDiskUse(true) // Enable external sorting to prevent memory limit issues
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean();
    
    // Add lazy loading support for images with Cloudinary URLs
    const productsWithUrls = products.map(product => {
      return {
        ...product,
        id: product._id,
        barcode: product.barcode || null,
        image_url: product.image_url,
        placeholder_url: product.image_url || `/assets/images/Midwest.jpg`,
        has_image: !!product.image_url,
        variants: product.variants || []
      };
    });
    
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

async function listProductsDataTables(req, res) {
  try {
    // DataTables server-side processing parameters
    const draw = parseInt(req.query.draw) || 1;
    const start = parseInt(req.query.start) || 0;
    const length = parseInt(req.query.length) || 10;
    const searchValue = req.query.search?.value || '';
    const orderColumn = parseInt(req.query.order?.[0]?.column) || 0;
    const orderDir = req.query.order?.[0]?.dir || 'asc';
    
    // Column mapping for sorting
    const columnMap = {
      0: 'name',
      1: 'category', 
      2: 'description',
      3: 'price',
      4: 'stock'
    };
    
    const sortField = columnMap[orderColumn] || 'name';
    const sortOrder = orderDir === 'desc' ? -1 : 1;
    
    // Build search condition
    let searchQuery = {};
    if (searchValue) {
      searchQuery = {
        $or: [
          { name: { $regex: searchValue, $options: 'i' } },
          { category: { $regex: searchValue, $options: 'i' } },
          { description: { $regex: searchValue, $options: 'i' } }
        ]
      };
    }
    
    // Get total count without search
    const totalRecords = await Product.countDocuments({});
    
    // Get filtered count with search
    const filteredRecords = await Product.countDocuments(searchQuery);
    
    // Get paginated products with search and sorting
    const products = await Product.find(searchQuery)
      .select('name category description price stock barcode image_url image_public_id variants createdAt')
      .sort({ [sortField]: sortOrder })
      .allowDiskUse(true)
      .skip(start)
      .limit(length)
      .lean();
    
    // Format data for DataTables
    const data = products.map(product => {
      return {
        DT_RowId: product._id,
        id: product._id, // Add id field for client-side access
        name: product.name,
        barcode: product.barcode || null,
        category: product.category || '-',
        description: product.description || '-',
        price: product.price,
        stock: product.stock,
        image_url: product.image_url,
        placeholder_url: product.image_url || `/assets/images/Midwest.jpg`,
        has_image: !!product.image_url,
        variants: product.variants || [],
        actions: `<button onclick="editProductFromTable('${product._id}')" class="text-blue-600 hover:text-blue-800">Edit</button> | <button onclick="deleteProductFromTable('${product._id}')" class="text-red-600 hover:text-red-800">Delete</button>`
      };
    });
    
    res.json({
      draw: draw,
      recordsTotal: totalRecords,
      recordsFiltered: filteredRecords,
      data: data
    });
  } catch (error) {
    console.error('Error in listProductsDataTables:', error);
    res.status(500).json({ 
      draw: parseInt(req.query.draw) || 1,
      recordsTotal: 0,
      recordsFiltered: 0,
      data: [],
      error: 'Server error'
    });
  }
}

async function updateProduct(req, res) {
  const id = req.params.id;
  const { name, category, description, price, stock, barcode, variants } = req.body || {};
  if (!id) return res.status(400).json({ message: 'Invalid id' });
  
  // Validate ObjectId format
  if (!isValidObjectId(id)) {
    return res.status(400).json({ message: 'Invalid product ID format' });
  }
  
  if (!name || typeof name !== 'string') return res.status(400).json({ message: 'Name required' });
  try {
    const updateData = {
      name,
      category: category || null,
      description: description || null
    };
    const unsetData = {}; // Fields to unset (for sparse index compatibility)

    // If variants are provided, use them; otherwise use legacy fields
    if (variants && Array.isArray(variants) && variants.length > 0) {
      // Validate variants
      try {
        const validatedVariants = variants.map((variant, index) => {
          // Allow 0 as a valid value, but require the field to be present
          const price = variant.price !== undefined && variant.price !== null ? Number(variant.price) : null;
          const stock = variant.stock !== undefined && variant.stock !== null ? Number(variant.stock) : null;
          
          if (price === null) {
            throw new Error(`Variant ${index + 1} (${variant.name || 'unnamed'}): price is required`);
          }
          if (stock === null) {
            throw new Error(`Variant ${index + 1} (${variant.name || 'unnamed'}): stock is required`);
          }
          
          return {
            _id: variant._id || new mongoose.Types.ObjectId(),
            name: variant.name ? variant.name.trim() : null,
            sku: variant.sku ? variant.sku.trim() : null,
            price: price,
            cost: variant.cost !== undefined && variant.cost !== null ? Number(variant.cost) : 0,
            stock: stock,
            barcodes: Array.isArray(variant.barcodes) 
              ? variant.barcodes.map(b => b ? b.trim() : '').filter(b => b)
              : [],
            option1_name: variant.option1_name ? variant.option1_name.trim() : null,
            option1_value: variant.option1_value ? variant.option1_value.trim() : null,
            option2_name: variant.option2_name ? variant.option2_name.trim() : null,
            option2_value: variant.option2_value ? variant.option2_value.trim() : null,
            option3_name: variant.option3_name ? variant.option3_name.trim() : null,
            option3_value: variant.option3_value ? variant.option3_value.trim() : null,
            track_stock: variant.track_stock !== undefined ? variant.track_stock : true,
            available_for_sale: variant.available_for_sale !== undefined ? variant.available_for_sale : true,
            low_stock_threshold: Number(variant.low_stock_threshold) || 5
          };
        });
        updateData.variants = validatedVariants;
        // Calculate aggregate price and stock from variants
        updateData.price = validatedVariants.reduce((sum, v) => sum + (v.price || 0), 0) / validatedVariants.length;
        updateData.stock = validatedVariants.reduce((sum, v) => sum + (v.stock || 0), 0);
        // Unset barcode field instead of setting to null (for sparse index compatibility)
        unsetData.barcode = '';
      } catch (validationError) {
        console.error('Variant validation error:', validationError);
        return res.status(400).json({ 
          message: validationError.message || 'Invalid variant data',
          error: validationError.message 
        });
      }
    } else {
      // Legacy mode - single product without variants
      updateData.price = Number(price) || 0;
      updateData.stock = Number(stock) || 0;
      // Only set barcode if it has a value; otherwise unset it (for sparse index compatibility)
      const trimmedBarcode = barcode ? barcode.trim() : '';
      if (trimmedBarcode) {
        updateData.barcode = trimmedBarcode;
      } else {
        unsetData.barcode = '';
      }
      updateData.variants = []; // Clear variants if not provided
    }

    // Build the update query with $set for regular fields and $unset for fields to remove
    const updateQuery = { $set: updateData };
    if (Object.keys(unsetData).length > 0) {
      updateQuery.$unset = unsetData;
    }

    console.log('Update query:', JSON.stringify(updateQuery, null, 2));
    
    const product = await Product.findByIdAndUpdate(
      id,
      updateQuery,
      { new: true, runValidators: true }
    );
    if (!product) return res.status(404).json({ message: 'Not found' });
    const productWithUrl = {
      ...product.toObject(),
      id: product._id,
      barcode: product.barcode || null,
      image_url: product.image_url || `/assets/images/Midwest.jpg`,
      variants: product.variants || []
    };
    res.json({ product: productWithUrl });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
}

async function uploadProductImage(req, res) {
  const id = req.params.id;
  if (!id) return res.status(400).json({ message: 'Invalid id' });
  
  if (!req.file) {
    return res.status(400).json({ message: 'No image file provided' });
  }

  try {
    // Import Cloudinary controller
    const { uploadImage } = require('./cloudinaryController');
    
    // Use Cloudinary upload function
    req.params.id = id;
    return await uploadImage(req, res);
    
  } catch (_e) {
    console.error('Error uploading image:', _e);
    res.status(500).json({ message: 'Server error' });
  }
}

async function deleteProductImage(req, res) {
  const id = req.params.id;
  if (!id) return res.status(400).json({ message: 'Invalid id' });
  
  try {
    // Import Cloudinary controller
    const { deleteImage } = require('./cloudinaryController');
    
    // Use Cloudinary delete function
    req.params.id = id;
    return await deleteImage(req, res);
    
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
      .select('name category description price stock barcode image_url image_public_id variants createdAt');
    
    if (!product) return res.status(404).json({ message: 'Product not found' });
    
    const productWithUrl = {
      ...product.toObject(),
      id: product._id,
      barcode: product.barcode || null,
      image_url: product.image_url || `/assets/images/Midwest.jpg`,
      variants: product.variants || []
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
    // Import Cloudinary controller
    const { getImageUrl } = require('./cloudinaryController');
    
    // Use Cloudinary get image URL function
    req.params.id = id;
    return await getImageUrl(req, res);
    
  } catch (error) {
    console.error('Error serving product image:', error);
    res.status(500).json({ message: 'Server error' });
  }
}

async function getProductImagePlaceholder(req, res) {
  const id = req.params.id;
  if (!id) return res.status(400).json({ message: 'Invalid id' });
  
  try {
    const product = await Product.findById(id).select('image_url');
    if (!product || !product.image_url) {
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
    const product = await Product.findById(id).select('image_url');
    if (!product || !product.image_url) {
      const defaultPath = path.join(__dirname, '../../assets/images/Midwest.jpg');
      return res.sendFile(defaultPath);
    }
    
    // Redirect to Cloudinary URL
    return res.redirect(product.image_url);
  } catch (error) {
    console.error('Error serving thumbnail:', error);
    res.status(500).json({ message: 'Server error' });
  }
}

// Get all products with lazy loading support
async function getAllProductsLazy(req, res) {
  try {
    const search = req.query.search || '';
    const page = Math.max(parseInt(req.query.page || '1'), 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize || '100'), 1), 1000); // Max 1000 per page
    
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
    
    // Get total count for pagination
    const total = await Product.countDocuments(searchQuery);
    
    // Get products with pagination and external sorting
    const products = await Product.find(searchQuery)
      .select('name category description price stock barcode image_url image_public_id variants createdAt')
      .sort({ name: 1 })
      .allowDiskUse(true) // Enable external sorting to prevent memory limit issues
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean();
    
    // Add lazy loading support for images with Cloudinary URLs
    const productsWithUrls = products.map(product => {
      return {
        ...product,
        id: product._id,
        barcode: product.barcode || null,
        image_url: product.image_url,
        placeholder_url: product.image_url || `/assets/images/Midwest.jpg`,
        thumbnail_url: product.image_url || `/assets/images/Midwest.jpg`,
        has_image: !!product.image_url,
        variants: product.variants || []
      };
    });
    
    res.json({ 
      products: productsWithUrls,
      total: total,
      page: page,
      pageSize: pageSize,
      totalPages: Math.ceil(total / pageSize),
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
    
    // Get all low stock products with external sorting
    const products = await Product.find(searchQuery)
      .select('name category description price stock barcode image_url image_public_id variants createdAt')
      .sort({ stock: 1, name: 1 })
      .allowDiskUse(true) // Enable external sorting to prevent memory limit issues
      .lean();
    
    // Add lazy loading support for images
    const productsWithUrls = products.map(product => ({
      ...product,
      id: product._id,
        barcode: product.barcode || null,
        image_url: product.image_url,
        placeholder_url: product.image_url || `/assets/images/Midwest.jpg`,
        thumbnail_url: product.image_url || `/assets/images/Midwest.jpg`,
        has_image: !!product.image_url,
        variants: product.variants || [],
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
  const { name, category, description, price, stock, barcode, variants } = req.body || {};
  
  // Validate required fields
  if (!name || typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ message: 'Product name is required' });
  }
  
  try {
    const productData = {
      name: name.trim(),
      category: category ? category.trim() : null,
      description: description ? description.trim() : null
    };

    // If variants are provided, use them; otherwise use legacy fields
    if (variants && Array.isArray(variants) && variants.length > 0) {
      // Validate variants
      const validatedVariants = variants.map(variant => {
        if (variant.price === undefined || variant.price === null) {
          throw new Error('Variant price is required');
        }
        if (variant.stock === undefined || variant.stock === null) {
          throw new Error('Variant stock is required');
        }
        return {
          name: variant.name ? variant.name.trim() : null,
          sku: variant.sku ? variant.sku.trim() : null,
          price: Number(variant.price) || 0,
          cost: Number(variant.cost) || 0,
          stock: Number(variant.stock) || 0,
          barcodes: Array.isArray(variant.barcodes) 
            ? variant.barcodes.map(b => b ? b.trim() : '').filter(b => b)
            : [],
          option1_name: variant.option1_name ? variant.option1_name.trim() : null,
          option1_value: variant.option1_value ? variant.option1_value.trim() : null,
          option2_name: variant.option2_name ? variant.option2_name.trim() : null,
          option2_value: variant.option2_value ? variant.option2_value.trim() : null,
          option3_name: variant.option3_name ? variant.option3_name.trim() : null,
          option3_value: variant.option3_value ? variant.option3_value.trim() : null,
          track_stock: variant.track_stock !== undefined ? variant.track_stock : true,
          available_for_sale: variant.available_for_sale !== undefined ? variant.available_for_sale : true,
          low_stock_threshold: Number(variant.low_stock_threshold) || 5
        };
      });
      productData.variants = validatedVariants;
      // Calculate aggregate price and stock from variants
      productData.price = validatedVariants.reduce((sum, v) => sum + (v.price || 0), 0) / validatedVariants.length;
      productData.stock = validatedVariants.reduce((sum, v) => sum + (v.stock || 0), 0);
    } else {
      // Legacy mode - single product without variants
      if (price === undefined || price === null) {
        return res.status(400).json({ message: 'Price is required' });
      }
      if (stock === undefined || stock === null) {
        return res.status(400).json({ message: 'Stock is required' });
      }
      productData.price = Number(price) || 0;
      productData.stock = Number(stock) || 0;
      // Only set barcode if it has a value (for sparse index compatibility)
      // Don't set to null - leave undefined so sparse index ignores it
      const trimmedBarcode = barcode ? barcode.trim() : '';
      if (trimmedBarcode) {
        productData.barcode = trimmedBarcode;
      }
      // If barcode is empty, don't set it at all (undefined) so sparse index ignores it
    }
    
    const product = new Product(productData);
    await product.save();
    
    const productWithUrl = {
      ...product.toObject(),
      id: product._id,
      barcode: product.barcode || null,
      image_url: product.image_url,
      placeholder_url: product.image_url || `/assets/images/Midwest.jpg`,
      has_image: !!product.image_url,
      variants: product.variants || []
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

// Search product by barcode without decreasing stock
async function searchProductByBarcode(req, res) {
  try {
    const { barcode } = req.body || {};
    if (!barcode || !barcode.trim()) {
      return res.status(400).json({ message: 'Barcode is required' });
    }

    const normalizedBarcode = barcode.trim();
    
    // First try to find by legacy barcode field
    let product = await Product.findOne({ barcode: normalizedBarcode })
      .select('name category description price stock barcode track_stock image_url variants');

    // If not found, search in variants
    if (!product) {
      product = await Product.findOne({ 'variants.barcodes': normalizedBarcode })
        .select('name category description price stock barcode track_stock image_url variants');
      
      if (product) {
        // Find the specific variant that matches the barcode
        const matchingVariant = product.variants.find(v => 
          v.barcodes && v.barcodes.includes(normalizedBarcode)
        );
        
        if (matchingVariant) {
          return res.json({
            product: {
              ...product.toObject(),
              id: product._id,
              image_url: product.image_url || `/assets/images/Midwest.jpg`,
              variant: matchingVariant,
              variantId: matchingVariant._id.toString(),
              price: matchingVariant.price,
              stock: matchingVariant.stock,
              currentStock: matchingVariant.stock
            }
          });
        }
      }
    }

    if (!product) {
      return res.status(404).json({ message: 'Product not found for this barcode' });
    }

    // Handle legacy product (no variants)
    res.json({
      product: {
        ...product.toObject(),
        id: product._id,
        image_url: product.image_url || `/assets/images/Midwest.jpg`,
        currentStock: product.stock
      }
    });
  } catch (error) {
    console.error('Error searching product by barcode:', error);
    res.status(500).json({ message: 'Failed to search product by barcode' });
  }
}

// Batch process multiple scans
async function batchProcessScans(req, res) {
  try {
    const { items } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Items array is required' });
    }

    const results = [];
    const errors = [];

    for (const item of items) {
      const { barcode, quantity = 1, variantId } = item;
      if (!barcode || !barcode.trim()) {
        errors.push({ barcode, error: 'Barcode is required' });
        continue;
      }

      const qty = Number(quantity) || 1;
      if (!Number.isFinite(qty) || qty <= 0) {
        errors.push({ barcode, error: 'Quantity must be greater than zero' });
        continue;
      }

      try {
        const normalizedBarcode = barcode.trim();
        
        // First try to find by legacy barcode field
        let product = await Product.findOne({ barcode: normalizedBarcode })
          .select('name category description price stock barcode track_stock image_url variants');

        // If not found, search in variants
        if (!product) {
          product = await Product.findOne({ 'variants.barcodes': normalizedBarcode })
            .select('name category description price stock barcode track_stock image_url variants');
          
          if (product) {
            // Find the specific variant that matches the barcode
            const matchingVariant = product.variants.find(v => 
              v.barcodes && v.barcodes.includes(normalizedBarcode)
            );
            
            if (matchingVariant) {
              // Check variant stock
              if (matchingVariant.track_stock !== false && matchingVariant.stock < qty) {
                errors.push({ barcode, error: 'Insufficient stock available for this variant' });
                continue;
              }

              // Update variant stock
              if (matchingVariant.track_stock !== false) {
                matchingVariant.stock = Math.max(0, matchingVariant.stock - qty);
                // Recalculate product aggregate stock
                product.stock = product.variants.reduce((sum, v) => sum + (v.stock || 0), 0);
                await product.save();
              }

              results.push({
                barcode,
                success: true,
                product: {
                  id: product._id,
                  name: product.name,
                  variant: matchingVariant,
                  price: matchingVariant.price,
                  stock: matchingVariant.stock
                }
              });
              continue;
            }
          }
        }

        if (!product) {
          errors.push({ barcode, error: 'Product not found for this barcode' });
          continue;
        }

        // Handle legacy product (no variants)
        if (product.track_stock !== false && product.stock < qty) {
          errors.push({ barcode, error: 'Insufficient stock available' });
          continue;
        }

        if (product.track_stock !== false) {
          product.stock = Math.max(0, product.stock - qty);
          await product.save();
        }

        results.push({
          barcode,
          success: true,
          product: {
            id: product._id,
            name: product.name,
            price: product.price,
            stock: product.stock
          }
        });
      } catch (error) {
        errors.push({ barcode, error: error.message || 'Failed to process' });
      }
    }

    res.json({
      success: errors.length === 0,
      processed: results.length,
      errorCount: errors.length,
      results,
      errorDetails: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error batch processing scans:', error);
    res.status(500).json({ message: 'Failed to batch process scans' });
  }
}

async function scanProduct(req, res) {
  try {
    const { barcode, quantity = 1 } = req.body || {};
    if (!barcode || !barcode.trim()) {
      return res.status(400).json({ message: 'Barcode is required' });
    }

    const qty = Number(quantity) || 1;
    if (!Number.isFinite(qty) || qty <= 0) {
      return res.status(400).json({ message: 'Quantity must be greater than zero' });
    }

    const normalizedBarcode = barcode.trim();
    
    // First try to find by legacy barcode field
    let product = await Product.findOne({ barcode: normalizedBarcode })
      .select('name category description price stock barcode track_stock image_url variants');

    // If not found, search in variants
    if (!product) {
      product = await Product.findOne({ 'variants.barcodes': normalizedBarcode })
        .select('name category description price stock barcode track_stock image_url variants');
      
      if (product) {
        // Find the specific variant that matches the barcode
        const matchingVariant = product.variants.find(v => 
          v.barcodes && v.barcodes.includes(normalizedBarcode)
        );
        
        if (matchingVariant) {
          // Check variant stock
          if (matchingVariant.track_stock !== false && matchingVariant.stock < qty) {
            return res.status(400).json({ message: 'Insufficient stock available for this variant' });
          }

          // Update variant stock
          if (matchingVariant.track_stock !== false) {
            matchingVariant.stock = Math.max(0, matchingVariant.stock - qty);
            // Recalculate product aggregate stock
            product.stock = product.variants.reduce((sum, v) => sum + (v.stock || 0), 0);
            await product.save();
          }

          return res.json({
            product: {
              ...product.toObject(),
              id: product._id,
              image_url: product.image_url || `/assets/images/Midwest.jpg`,
              variant: matchingVariant,
              price: matchingVariant.price,
              stock: matchingVariant.stock
            }
          });
        }
      }
    }

    if (!product) {
      return res.status(404).json({ message: 'Product not found for this barcode' });
    }

    // Handle legacy product (no variants)
    if (product.track_stock !== false && product.stock < qty) {
      return res.status(400).json({ message: 'Insufficient stock available' });
    }

    if (product.track_stock !== false) {
      product.stock = Math.max(0, product.stock - qty);
      await product.save();
    }

    res.json({
      product: {
        ...product.toObject(),
        id: product._id,
        image_url: product.image_url || `/assets/images/Midwest.jpg`
      }
    });
  } catch (error) {
    console.error('Error processing barcode scan:', error);
    res.status(500).json({ message: 'Failed to process barcode scan' });
  }
}

async function uploadVariantImage(req, res) {
  const productId = req.params.id;
  const variantId = req.params.variantId;
  
  if (!productId || !variantId) {
    return res.status(400).json({ message: 'Product ID and Variant ID are required' });
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
    // Validate ObjectId format
    if (!isValidObjectId(productId)) {
      return res.status(400).json({ message: 'Invalid product ID format' });
    }

    // Find the product
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Find the variant
    const variant = product.variants.id(variantId);
    if (!variant) {
      return res.status(404).json({ message: 'Variant not found' });
    }

    // Import Cloudinary
    const cloudinary = require('../config/cloudinary');
    const { Readable } = require('stream');
    
    // Delete old image if exists
    if (variant.image_public_id) {
      try {
        await cloudinary.uploader.destroy(variant.image_public_id);
      } catch (err) {
        console.warn('Failed to delete old variant image:', err);
      }
    }
    
    // Upload new image to Cloudinary
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `midwest-grocery/products/${productId}/variants`,
        public_id: `variant-${variantId}-${Date.now()}`,
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
          // Update variant with new image URL
          variant.image_url = result.secure_url;
          variant.image_public_id = result.public_id;
          
          await product.save();
          
          res.json({
            message: 'Variant image uploaded successfully',
            variant: {
              _id: variant._id,
              name: variant.name,
              image_url: variant.image_url,
              image_public_id: variant.image_public_id
            }
          });
        } catch (dbError) {
          console.error('Database update error:', dbError);
          // If database update fails, delete the uploaded image from Cloudinary
          await cloudinary.uploader.destroy(result.public_id);
          res.status(500).json({ message: 'Failed to update variant with image URL' });
        }
      }
    );

    // Pipe the file buffer to the stream
    const bufferStream = new Readable();
    bufferStream.push(req.file.buffer);
    bufferStream.push(null);
    bufferStream.pipe(stream);
    
  } catch (error) {
    console.error('Error uploading variant image:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
}

module.exports = { 
  listProducts, 
  listProductsDataTables,
  getProduct, 
  createProduct,
  updateProduct, 
  deleteProduct,
  uploadProductImage, 
  deleteProductImage, 
  cleanupOrphanedImages,
  getProductImage,
  searchProductByBarcode,
  batchProcessScans,
  getProductImagePlaceholder,
  getProductThumbnail,
  getAllProductsLazy,
  getLowStockItems,
  scanProduct,
  searchProductByBarcode,
  batchProcessScans,
  uploadVariantImage
};


