const Order = require('../models/Order_Standalone');
const OrderItem = require('../models/OrderItem');
const Product = require('../models/Product');
const mongoose = require('mongoose');

// Helper function to validate MongoDB ObjectId
function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

// Create order with separate items (like your MySQL structure)
async function createOrder(req, res) {
  try {
    const { name, contact, address, payment, ref, totalPrice, discount, net_total, status, type, device_id, fcm_token, items = [] } = req.body || {};

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ message: 'Name is required' });
    }

    if (!totalPrice || typeof totalPrice !== 'number') {
      return res.status(400).json({ message: 'Total price is required' });
    }

    if (!device_id || typeof device_id !== 'string') {
      return res.status(400).json({ message: 'Device ID is required' });
    }

    // Validate enum values
    const validPayments = ['Cash', 'GCash'];
    const validStatuses = ['Pending', 'Processing', 'Completed', 'Cancelled', 'Declined', 'Delivered'];
    const validTypes = ['Online', 'In-Store'];

    if (payment && !validPayments.includes(payment)) {
      return res.status(400).json({ message: 'Invalid payment method. Must be Cash or GCash' });
    }

    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status. Must be one of: ' + validStatuses.join(', ') });
    }

    if (type && !validTypes.includes(type)) {
      return res.status(400).json({ message: 'Invalid type. Must be Online or In-Store' });
    }

    // Generate order code
    const orderCode = 'ORD' + Date.now().toString().slice(-6);

    // Create order (without embedded items)
    const orderData = {
      order_code: orderCode,
      name,
      contact: contact || null,
      address: address || null,
      payment: payment || 'Cash',
      ref: ref || null,
      totalPrice,
      discount: discount || 0,
      net_total: net_total || totalPrice,
      status: status || 'Pending',
      type: type || 'Online',
      device_id,
      fcm_token: fcm_token || null
    };

    // Create the order first
    const order = new Order(orderData);
    await order.save();

    // Now create order items separately (like your MySQL structure)
    let insertedItems = 0;
    if (Array.isArray(items) && items.length > 0) {
      const orderItems = items.map(item => ({
        order_id: order._id,
        product_id: new mongoose.Types.ObjectId(item.product_id),
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.quantity * item.unit_price,
        product_name: item.product_name || 'Unknown Product'
      }));

      await OrderItem.insertMany(orderItems);
      insertedItems = orderItems.length;
    }

    // Respond with created order
    const orderResponse = {
      ...order.toObject(),
      id: order._id,
      inserted_items: insertedItems
    };
    
    res.status(201).json({ order: orderResponse });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ message: 'Server error' });
  }
}

// Get order with items (populated from separate collection)
async function getOrder(req, res) {
  try {
    const id = req.params.id;
    const deviceId = req.query.device_id;
    
    if (!id) return res.status(400).json({ message: 'Invalid id' });
    
    // Validate ObjectId format
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid order ID format' });
    }

    let filter = { _id: id };
    if (deviceId) {
      filter.device_id = deviceId;
    }

    const order = await Order.findOne(filter).lean();
    if (!order) return res.status(404).json({ message: 'Order not found' });

    // Get items from separate collection
    const items = await OrderItem.find({ order_id: id })
      .populate('product_id', 'name category price')
      .lean();

    // Format response
    const orderResponse = {
      ...order,
      id: order._id,
      items: items.map(item => ({
        id: item._id,
        product_id: item.product_id._id,
        product_name: item.product_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.total_price,
        product_details: {
          name: item.product_id.name,
          category: item.product_id.category,
          price: item.product_id.price
        }
      }))
    };

    res.json({ order: orderResponse });
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ message: 'Server error' });
  }
}

// Get order items (separate endpoint)
async function getOrderItems(req, res) {
  try {
    const orderId = req.params.id;
    
    if (!isValidObjectId(orderId)) {
      return res.status(400).json({ message: 'Invalid order ID format' });
    }

    // Verify order exists
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Get all items for this order
    const items = await OrderItem.find({ order_id: orderId })
      .populate('product_id', 'name category price')
      .lean();

    // Format response similar to your MySQL structure
    const formattedItems = items.map(item => ({
      id: item._id,
      order_id: item.order_id,
      product_id: item.product_id._id,
      product_name: item.product_name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total_price: item.total_price,
      product_details: {
        name: item.product_id.name,
        category: item.product_id.category,
        price: item.product_id.price
      }
    }));

    res.json({ items: formattedItems });
  } catch (error) {
    console.error('Error fetching order items:', error);
    res.status(500).json({ message: 'Server error' });
  }
}

// List orders with item counts
async function listOrders(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page || '1'), 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize || '25'), 1), 100);
    const deviceId = req.query.device_id;
    
    let filter = {};
    if (deviceId) {
      filter.device_id = deviceId;
    }
    
    // Get total count
    const total = await Order.countDocuments(filter);
    
    // Get paginated orders
    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean();

    // Get item counts for each order
    const ordersWithItemCounts = await Promise.all(
      orders.map(async (order) => {
        const itemCount = await OrderItem.countDocuments({ order_id: order._id });
        return {
          ...order,
          id: order._id,
          item_count: itemCount
        };
      })
    );

    res.json({
      orders: ordersWithItemCounts,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize)
      }
    });
  } catch (error) {
    console.error('Error listing orders:', error);
    res.status(500).json({ message: 'Server error' });
  }
}

module.exports = {
  createOrder,
  getOrder,
  getOrderItems,
  listOrders
};
