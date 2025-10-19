const OrderItem = require('../models/OrderItem');
const Order = require('../models/Order');
const Product = require('../models/Product');
const mongoose = require('mongoose');

// Helper function to validate MongoDB ObjectId
function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

// Get all items for a specific order
async function getOrderItems(req, res) {
  try {
    const orderId = req.params.orderId;
    
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

// Create order items (bulk insert)
async function createOrderItems(req, res) {
  try {
    const { order_id, items } = req.body;

    if (!order_id || !isValidObjectId(order_id)) {
      return res.status(400).json({ message: 'Valid order_id is required' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Items array is required' });
    }

    // Verify order exists
    const order = await Order.findById(order_id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Prepare items for bulk insert
    const orderItems = items.map(item => ({
      order_id: new mongoose.Types.ObjectId(order_id),
      product_id: new mongoose.Types.ObjectId(item.product_id),
      quantity: item.quantity,
      unit_price: item.unit_price,
      total_price: item.quantity * item.unit_price,
      product_name: item.product_name || 'Unknown Product'
    }));

    // Bulk insert order items
    const createdItems = await OrderItem.insertMany(orderItems);

    res.status(201).json({ 
      message: 'Order items created successfully',
      items: createdItems,
      count: createdItems.length
    });
  } catch (error) {
    console.error('Error creating order items:', error);
    res.status(500).json({ message: 'Server error' });
  }
}

// Update an order item
async function updateOrderItem(req, res) {
  try {
    const { itemId } = req.params;
    const { quantity, unit_price } = req.body;

    if (!isValidObjectId(itemId)) {
      return res.status(400).json({ message: 'Invalid item ID format' });
    }

    const updateData = {};
    if (quantity !== undefined) updateData.quantity = quantity;
    if (unit_price !== undefined) updateData.unit_price = unit_price;

    // Recalculate total_price if quantity or unit_price changed
    if (updateData.quantity !== undefined || updateData.unit_price !== undefined) {
      const item = await OrderItem.findById(itemId);
      if (!item) {
        return res.status(404).json({ message: 'Order item not found' });
      }
      
      const newQuantity = updateData.quantity !== undefined ? updateData.quantity : item.quantity;
      const newUnitPrice = updateData.unit_price !== undefined ? updateData.unit_price : item.unit_price;
      updateData.total_price = newQuantity * newUnitPrice;
    }

    const updatedItem = await OrderItem.findByIdAndUpdate(
      itemId,
      updateData,
      { new: true }
    ).populate('product_id', 'name category price');

    if (!updatedItem) {
      return res.status(404).json({ message: 'Order item not found' });
    }

    res.json({ item: updatedItem });
  } catch (error) {
    console.error('Error updating order item:', error);
    res.status(500).json({ message: 'Server error' });
  }
}

// Delete an order item
async function deleteOrderItem(req, res) {
  try {
    const { itemId } = req.params;

    if (!isValidObjectId(itemId)) {
      return res.status(400).json({ message: 'Invalid item ID format' });
    }

    const deletedItem = await OrderItem.findByIdAndDelete(itemId);
    if (!deletedItem) {
      return res.status(404).json({ message: 'Order item not found' });
    }

    res.json({ message: 'Order item deleted successfully' });
  } catch (error) {
    console.error('Error deleting order item:', error);
    res.status(500).json({ message: 'Server error' });
  }
}

// Delete all items for an order
async function deleteOrderItems(req, res) {
  try {
    const { orderId } = req.params;

    if (!isValidObjectId(orderId)) {
      return res.status(400).json({ message: 'Invalid order ID format' });
    }

    const result = await OrderItem.deleteMany({ order_id: orderId });
    
    res.json({ 
      message: 'Order items deleted successfully',
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Error deleting order items:', error);
    res.status(500).json({ message: 'Server error' });
  }
}

module.exports = {
  getOrderItems,
  createOrderItems,
  updateOrderItem,
  deleteOrderItem,
  deleteOrderItems
};
