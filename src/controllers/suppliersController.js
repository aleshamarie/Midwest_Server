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

async function listSuppliersDataTables(req, res) {
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
      1: 'contact',
      2: 'items',
      3: 'last_delivery'
    };
    
    const sortField = columnMap[orderColumn] || 'name';
    const sortOrder = orderDir === 'desc' ? -1 : 1;
    
    // Build search condition
    let searchQuery = {};
    if (searchValue) {
      searchQuery = {
        $or: [
          { name: { $regex: searchValue, $options: 'i' } },
          { contact: { $regex: searchValue, $options: 'i' } }
        ]
      };
    }
    
    // Get total count without search
    const totalRecords = await Supplier.countDocuments({});
    
    // Get filtered count with search
    const filteredRecords = await Supplier.countDocuments(searchQuery);
    
    // Get paginated suppliers with search and sorting
    const suppliers = await Supplier.find(searchQuery)
      .populate('products', 'name')
      .sort({ [sortField]: sortOrder })
      .allowDiskUse(true)
      .skip(start)
      .limit(length)
      .lean();
    
    // Format data for DataTables
    const data = suppliers.map(supplier => {
      const formatDate = (date) => {
        if (!date) return '-';
        return new Date(date).toLocaleDateString();
      };
      
      const itemsCount = supplier.products ? supplier.products.length : 0;
      const itemsList = supplier.products ? supplier.products.map(p => p.name).join(', ') : 'No items';
      
      return {
        DT_RowId: supplier._id,
        name: supplier.name || '-',
        contact: supplier.contact || '-',
        items: `${itemsCount} items: ${itemsList}`,
        last_delivery: formatDate(supplier.last_delivery),
        actions: `<button onclick="editSupplier('${supplier._id}')" class="text-blue-600 hover:text-blue-800">Edit</button> | <button onclick="deleteSupplier('${supplier._id}')" class="text-red-600 hover:text-red-800">Delete</button>`
      };
    });
    
    res.json({
      draw: draw,
      recordsTotal: totalRecords,
      recordsFiltered: filteredRecords,
      data: data
    });
  } catch (error) {
    console.error('Error in listSuppliersDataTables:', error);
    res.status(500).json({ 
      draw: parseInt(req.query.draw) || 1,
      recordsTotal: 0,
      recordsFiltered: 0,
      data: [],
      error: 'Server error'
    });
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

module.exports = { listSuppliers, listSuppliersDataTables, createSupplier, updateSupplier, deleteSupplier, addSupplierProduct, restockSupplierProduct };


