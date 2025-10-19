const SupplierProduct = require('../models/SupplierProduct');
const Supplier = require('../models/Supplier');
const Product = require('../models/Product');
const mongoose = require('mongoose');

// Helper function to validate MongoDB ObjectId
function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

/**
 * Get all supplier-product relationships
 */
async function listSupplierProducts(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page || '1'), 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize || '25'), 1), 100);
    const supplierId = req.query.supplier_id;
    const productId = req.query.product_id;
    const isActive = req.query.is_active;

    // Build filter
    let filter = {};
    if (supplierId && isValidObjectId(supplierId)) {
      filter.supplier_id = supplierId;
    }
    if (productId && isValidObjectId(productId)) {
      filter.product_id = productId;
    }
    if (isActive !== undefined) {
      filter.is_active = isActive === 'true';
    }

    // Get total count
    const total = await SupplierProduct.countDocuments(filter);

    // Get paginated results
    const supplierProducts = await SupplierProduct.find(filter)
      .populate('supplier_id', 'name contact email phone business_type')
      .populate('product_id', 'name category sku price cost')
      .sort({ created_at: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean();

    res.json({ 
      supplier_products: supplierProducts, 
      page, 
      pageSize, 
      total 
    });
  } catch (error) {
    console.error('Error in listSupplierProducts:', error);
    res.status(500).json({ message: 'Server error' });
  }
}

/**
 * Create a new supplier-product relationship
 */
async function createSupplierProduct(req, res) {
  try {
    const {
      supplier_id,
      product_id,
      supplier_sku,
      supplier_name,
      supplier_price,
      supplier_cost,
      is_primary_supplier = false,
      lead_time_days = 7,
      minimum_order_quantity = 1,
      quality_rating = 3,
      notes
    } = req.body;

    // Validate required fields
    if (!supplier_id || !product_id) {
      return res.status(400).json({ message: 'supplier_id and product_id are required' });
    }

    if (!isValidObjectId(supplier_id) || !isValidObjectId(product_id)) {
      return res.status(400).json({ message: 'Invalid supplier_id or product_id format' });
    }

    // Check if relationship already exists
    const existing = await SupplierProduct.findOne({
      supplier_id,
      product_id
    });

    if (existing) {
      return res.status(400).json({ message: 'Supplier-product relationship already exists' });
    }

    // Verify supplier and product exist
    const supplier = await Supplier.findById(supplier_id);
    const product = await Product.findById(product_id);

    if (!supplier) {
      return res.status(404).json({ message: 'Supplier not found' });
    }
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Create new relationship
    const supplierProduct = new SupplierProduct({
      supplier_id,
      product_id,
      supplier_sku: supplier_sku || product.sku,
      supplier_name: supplier_name || product.name,
      supplier_price: supplier_price || product.price,
      supplier_cost: supplier_cost || product.cost,
      is_primary_supplier,
      is_active: true,
      lead_time_days,
      minimum_order_quantity,
      quality_rating,
      notes
    });

    await supplierProduct.save();

    // Add to supplier's supplier_products array
    await Supplier.findByIdAndUpdate(supplier_id, {
      $addToSet: { supplier_products: supplierProduct._id }
    });

    // Populate the response
    const populated = await SupplierProduct.findById(supplierProduct._id)
      .populate('supplier_id', 'name contact email phone business_type')
      .populate('product_id', 'name category sku price cost');

    res.status(201).json({ 
      message: 'Supplier-product relationship created successfully',
      supplier_product: populated
    });
  } catch (error) {
    console.error('Error in createSupplierProduct:', error);
    res.status(500).json({ message: 'Server error' });
  }
}

/**
 * Update a supplier-product relationship
 */
async function updateSupplierProduct(req, res) {
  try {
    const id = req.params.id;
    const updateData = req.body;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid supplier-product ID format' });
    }

    // Remove fields that shouldn't be updated directly
    delete updateData.supplier_id;
    delete updateData.product_id;
    delete updateData.created_at;

    const supplierProduct = await SupplierProduct.findByIdAndUpdate(
      id,
      { ...updateData, updated_at: new Date() },
      { new: true }
    ).populate('supplier_id', 'name contact email phone business_type')
     .populate('product_id', 'name category sku price cost');

    if (!supplierProduct) {
      return res.status(404).json({ message: 'Supplier-product relationship not found' });
    }

    res.json({ 
      message: 'Supplier-product relationship updated successfully',
      supplier_product: supplierProduct
    });
  } catch (error) {
    console.error('Error in updateSupplierProduct:', error);
    res.status(500).json({ message: 'Server error' });
  }
}

/**
 * Delete a supplier-product relationship
 */
async function deleteSupplierProduct(req, res) {
  try {
    const id = req.params.id;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid supplier-product ID format' });
    }

    const supplierProduct = await SupplierProduct.findById(id);
    if (!supplierProduct) {
      return res.status(404).json({ message: 'Supplier-product relationship not found' });
    }

    // Remove from supplier's supplier_products array
    await Supplier.findByIdAndUpdate(supplierProduct.supplier_id, {
      $pull: { supplier_products: id }
    });

    // Delete the relationship
    await SupplierProduct.findByIdAndDelete(id);

    res.json({ message: 'Supplier-product relationship deleted successfully' });
  } catch (error) {
    console.error('Error in deleteSupplierProduct:', error);
    res.status(500).json({ message: 'Server error' });
  }
}

/**
 * Get suppliers for a specific product
 */
async function getProductSuppliers(req, res) {
  try {
    const productId = req.params.productId;

    if (!isValidObjectId(productId)) {
      return res.status(400).json({ message: 'Invalid product ID format' });
    }

    const supplierProducts = await SupplierProduct.find({
      product_id: productId,
      is_active: true
    })
    .populate('supplier_id', 'name contact email phone business_type average_rating')
    .populate('product_id', 'name category sku')
    .sort({ is_primary_supplier: -1, quality_rating: -1 })
    .lean();

    res.json({ 
      product_suppliers: supplierProducts,
      total: supplierProducts.length
    });
  } catch (error) {
    console.error('Error in getProductSuppliers:', error);
    res.status(500).json({ message: 'Server error' });
  }
}

/**
 * Get products for a specific supplier
 */
async function getSupplierProducts(req, res) {
  try {
    const supplierId = req.params.supplierId;

    if (!isValidObjectId(supplierId)) {
      return res.status(400).json({ message: 'Invalid supplier ID format' });
    }

    const supplierProducts = await SupplierProduct.find({
      supplier_id: supplierId,
      is_active: true
    })
    .populate('supplier_id', 'name contact email phone business_type')
    .populate('product_id', 'name category sku price cost stock')
    .sort({ supplier_name: 1 })
    .lean();

    res.json({ 
      supplier_products: supplierProducts,
      total: supplierProducts.length
    });
  } catch (error) {
    console.error('Error in getSupplierProducts:', error);
    res.status(500).json({ message: 'Server error' });
  }
}

module.exports = {
  listSupplierProducts,
  createSupplierProduct,
  updateSupplierProduct,
  deleteSupplierProduct,
  getProductSuppliers,
  getSupplierProducts
};
