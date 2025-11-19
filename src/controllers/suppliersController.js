const mongoose = require('mongoose');
const Supplier = require('../models/Supplier');
const Product = require('../models/Product');
const SupplierProduct = require('../models/SupplierProduct');

async function listSuppliers(_req, res) {
  try {
    const suppliers = await Supplier.find({})
      .populate('products', 'name')
      .sort({ name: 1 })
      .lean();
    
    const suppliersWithId = suppliers.map(supplier => ({
      id: supplier._id,
      name: supplier.name,
      contact: supplier.contact,
      last_delivery: supplier.last_delivery,
      created_at: supplier.createdAt,
      items: supplier.products ? supplier.products.map(p => p.name) : []
    }));
    
    res.json({ suppliers: suppliersWithId });
  } catch (_e) {
    console.error('Error in listSuppliers:', _e);
    res.status(500).json({ message: 'Server error' });
  }
}


async function createSupplier(req, res) {
  const { name, contact = null, lastDelivery = null } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ message: 'Name required' });
  try {
    const supplier = new Supplier({
      name: name.trim(),
      contact,
      last_delivery: lastDelivery ? new Date(lastDelivery) : null
    });
    await supplier.save();
    
    const supplierResponse = {
      id: supplier._id,
      name: supplier.name,
      contact: supplier.contact,
      last_delivery: supplier.last_delivery,
      created_at: supplier.createdAt
    };
    
    res.status(201).json({ supplier: supplierResponse });
  } catch (_e) {
    console.error('Error in createSupplier:', _e);
    res.status(500).json({ message: 'Server error' });
  }
}

async function updateSupplier(req, res) {
  const { id } = req.params;
  const { name, contact = null, lastDelivery = null } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ message: 'Name required' });
  try {
    const supplier = await Supplier.findByIdAndUpdate(
      id,
      {
        name: name.trim(),
        contact,
        last_delivery: lastDelivery ? new Date(lastDelivery) : null
      },
      { new: true }
    );
    
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });
    
    const supplierResponse = {
      id: supplier._id,
      name: supplier.name,
      contact: supplier.contact,
      last_delivery: supplier.last_delivery,
      created_at: supplier.createdAt
    };
    
    res.json({ supplier: supplierResponse });
  } catch (_e) {
    console.error('Error in updateSupplier:', _e);
    res.status(500).json({ message: 'Server error' });
  }
}

async function deleteSupplier(req, res) {
  const { id } = req.params;
  try {
    await Supplier.findByIdAndDelete(id);
    res.json({ success: true });
  } catch (_e) {
    console.error('Error in deleteSupplier:', _e);
    res.status(500).json({ message: 'Server error' });
  }
}

async function addSupplierProduct(req, res) {
  const supplierId = req.params.id;
  const { productId } = req.body || {};
  if (!supplierId || !productId) {
    return res.status(400).json({ message: 'Invalid ids' });
  }
  try {
    const supplier = await Supplier.findById(supplierId);
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });
    
    if (!supplier.products.includes(productId)) {
      supplier.products.push(productId);
      await supplier.save();
    }
    
    res.json({ success: true });
  } catch (_e) {
    console.error('Error in addSupplierProduct:', _e);
    res.status(500).json({ message: 'Server error' });
  }
}

async function restockSupplierProduct(req, res) {
  const supplierId = req.params.id;
  const { productId, qty, date } = req.body || {};
  
  // Validate input
  if (!supplierId || !productId) {
    return res.status(400).json({ message: 'Invalid ids: supplierId and productId are required' });
  }
  
  const quantity = Number(qty) || 0;
  if (quantity <= 0) {
    return res.status(400).json({ message: 'Quantity must be > 0' });
  }
  
  // Validate ObjectId format
  if (!mongoose.Types.ObjectId.isValid(supplierId)) {
    return res.status(400).json({ message: 'Invalid supplier ID format' });
  }
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    return res.status(400).json({ message: 'Invalid product ID format' });
  }
  
  let session;
  try {
    session = await Supplier.startSession();
    const deliveryDate = date ? new Date(date) : new Date();
    
    // Validate date
    if (isNaN(deliveryDate.getTime())) {
      return res.status(400).json({ message: 'Invalid date format' });
    }
    
    await session.withTransaction(async () => {
      // Update product stock
      const product = await Product.findByIdAndUpdate(
        productId,
        { $inc: { stock: quantity } },
        { new: true, session }
      );
      
      if (!product) {
        throw new Error(`Product not found with ID: ${productId}`);
      }
      
      // Upsert SupplierProduct relationship and track restock stats
      // Ensure price and cost have valid values (SupplierProduct schema requires them)
      const supplierPrice = product.price != null ? product.price : 0;
      const supplierCost = product.cost != null ? product.cost : 0;
      
      const supplierProduct = await SupplierProduct.findOneAndUpdate(
        { supplier_id: supplierId, product_id: productId },
        {
          $setOnInsert: {
            supplier_id: supplierId,
            product_id: productId,
            is_primary_supplier: false,
            is_active: true,
            lead_time_days: 0,
            minimum_order_quantity: 1,
            quality_rating: 3
          },
          $set: {
            last_order_date: deliveryDate,
            last_delivery_date: deliveryDate,
            supplier_name: product.name || '',
            supplier_sku: product.sku || '',
            supplier_price: supplierPrice,
            supplier_cost: supplierCost,
            updated_at: new Date(),
            is_active: true
          },
          $inc: {
            total_orders: 1,
            total_quantity_ordered: quantity
          }
        },
        { new: true, upsert: true, session, setDefaultsOnInsert: true }
      );
      
      if (!supplierProduct) {
        throw new Error('Failed to create or update SupplierProduct relationship');
      }
      
      // Update supplier last delivery and ensure relationships are linked
      const supplier = await Supplier.findByIdAndUpdate(
        supplierId,
        { 
          last_delivery: deliveryDate,
          $addToSet: { 
            products: productId,
            supplier_products: supplierProduct._id
          }
        },
        { session, new: true }
      );
      
      if (!supplier) {
        throw new Error(`Supplier not found with ID: ${supplierId}`);
      }
    });
    
    const [product, supplier, supplierProduct] = await Promise.all([
      Product.findById(productId).select('name category price stock'),
      Supplier.findById(supplierId).select('name contact last_delivery'),
      SupplierProduct.findOne({ supplier_id: supplierId, product_id: productId })
        .select('supplier_id product_id supplier_price supplier_cost total_orders total_quantity_ordered last_delivery_date last_order_date')
    ]);
    
    res.json({ success: true, product, supplier, supplier_product: supplierProduct });
  } catch (e) {
    console.error('Error in restockSupplierProduct:', e);
    const errorMessage = e.message || 'Server error';
    const statusCode = e.message && e.message.includes('not found') ? 404 : 500;
    res.status(statusCode).json({ message: errorMessage, error: process.env.NODE_ENV === 'development' ? e.stack : undefined });
  } finally {
    if (session) {
      await session.endSession();
    }
  }
}

module.exports = { listSuppliers, createSupplier, updateSupplier, deleteSupplier, addSupplierProduct, restockSupplierProduct };


