const Product = require('../models/Product');
const Supplier = require('../models/Supplier');
const Order = require('../models/Order');

async function getAll(_req, res) {
  try {
    const products = await Product.find({}).sort({ _id: -1 }).lean();
    const suppliers = await Supplier.find({}).sort({ _id: -1 }).lean();
    const orders = await Order.find({}).sort({ _id: -1 }).lean();
    
    // Convert _id to id for consistency
    const productsWithId = products.map(p => ({ ...p, id: p._id }));
    const suppliersWithId = suppliers.map(s => ({ ...s, id: s._id }));
    const ordersWithId = orders.map(o => ({ ...o, id: o._id }));
    
    res.json({ products: productsWithId, suppliers: suppliersWithId, orders: ordersWithId });
  } catch (e) {
    res.status(500).json({ message: 'Server error' });
  }
}

async function saveAll(req, res) {
  const { products = [], suppliers = [], orders = [] } = req.body || {};
  
  try {
    // Replace-all strategy (simple and sufficient for now)
    await Order.deleteMany({});
    await Supplier.deleteMany({});
    await Product.deleteMany({});

    // Insert products
    for (const p of products) {
      const productData = {
        name: p.name,
        category: p.category || null,
        price: p.price || 0,
        stock: p.stock || 0,
        createdAt: p.created_at ? new Date(p.created_at) : new Date()
      };
      await Product.create(productData);
    }

    // Insert suppliers
    for (const s of suppliers) {
      const supplierData = {
        name: s.name,
        contact: s.contact || null,
        last_delivery: s.lastDelivery ? new Date(s.lastDelivery) : null,
        createdAt: s.created_at ? new Date(s.created_at) : new Date()
      };
      const supplier = await Supplier.create(supplierData);
      
      // Handle supplier-product relationships
      const items = Array.isArray(s.items) ? s.items : [];
      for (const itemName of items) {
        const product = await Product.findOne({ name: itemName });
        if (product) {
          supplier.products.push(product._id);
        }
      }
      await supplier.save();
    }

    // Insert orders
    for (const o of orders) {
      const orderData = {
        order_code: o.id || o.order_code || `ORD${Date.now()}`,
        name: o.customer,
        status: o.status || 'Pending',
        type: o.type || 'Online',
        payment: o.payment || 'Cash',
        ref: o.ref || null,
        totalPrice: o.total || 0,
        discount: o.discount || 0,
        net_total: o.netTotal || 0,
        createdAt: o.created_at ? new Date(o.created_at) : new Date()
      };
      await Order.create(orderData);
    }

    res.json({ message: 'Saved' });
  } catch (e) {
    console.error('Error in saveAll:', e);
    res.status(500).json({ message: 'Server error' });
  }
}

module.exports = { getAll, saveAll };


