const Supplier = require('../models/Supplier');
const Product = require('../models/Product');

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
  if (!supplierId || !productId) {
    return res.status(400).json({ message: 'Invalid ids' });
  }
  const quantity = Number(qty) || 0;
  if (quantity <= 0) return res.status(400).json({ message: 'Quantity must be > 0' });
  
  try {
    const session = await Supplier.startSession();
    await session.withTransaction(async () => {
      // Update product stock
      const product = await Product.findByIdAndUpdate(
        productId,
        { $inc: { stock: quantity } },
        { new: true, session }
      );
      
      if (!product) throw new Error('Product not found');
      
      // Update supplier last delivery
      await Supplier.findByIdAndUpdate(
        supplierId,
        { 
          last_delivery: date ? new Date(date) : new Date(),
          $addToSet: { products: productId }
        },
        { session }
      );
      
      return { product, supplierId };
    });
    
    const product = await Product.findById(productId).select('name category price stock');
    const supplier = await Supplier.findById(supplierId).select('name contact last_delivery');
    
    res.json({ success: true, product, supplier });
  } catch (e) {
    console.error('Error in restockSupplierProduct:', e);
    res.status(500).json({ message: 'Server error' });
  }
}

module.exports = { listSuppliers, createSupplier, updateSupplier, deleteSupplier, addSupplierProduct, restockSupplierProduct };


