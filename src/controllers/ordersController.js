const Order = require('../models/Order_Standalone');
const OrderItem = require('../models/OrderItem');
const Product = require('../models/Product');
const mongoose = require('mongoose');

// Helper function to validate MongoDB ObjectId
function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

async function listOrders(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page || '1'), 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize || '20'), 1), 100);
    const deviceId = req.query.device_id;
    
    // Build query filter
    let filter = {};
    if (deviceId) {
      filter.device_id = deviceId;
    }
    
    // Get total count
    const total = await Order.countDocuments(filter);
    
    // Get paginated orders
    const orders = await Order.find(filter)
      .select('order_code name contact address status type payment ref totalPrice discount net_total device_id createdAt')
      .sort({ _id: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean();
    
    // Convert _id to id for consistency
    const ordersWithId = orders.map(order => ({
      ...order,
      id: order._id
    }));
    
    res.json({ orders: ordersWithId, page, pageSize, total });
  } catch (_e) {
    res.status(500).json({ message: 'Server error' });
  }
}

async function updateOrderPayment(req, res) {
  try {
    const id = req.params.id;
    const { payment, ref, status, device_id, fcm_token } = req.body || {};

    if (!id) return res.status(400).json({ message: 'Invalid id' });
    
    // Validate ObjectId format
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid order ID format' });
    }

    // Validate enum values
    const validPayments = ['Cash', 'GCash'];
    const validStatuses = ['Pending', 'Processing', 'Completed', 'Cancelled', 'Declined', 'Delivered'];

    if (payment && !validPayments.includes(payment)) {
      return res.status(400).json({ message: 'Invalid payment method. Must be Cash or GCash' });
    }

    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status. Must be one of: ' + validStatuses.join(', ') });
    }

    // Check if device_id matches (if provided)
    if (device_id) {
      const existingOrder = await Order.findById(id).select('device_id');
      if (!existingOrder) {
        return res.status(404).json({ message: 'Order not found' });
      }
      if (existingOrder.device_id !== device_id) {
        return res.status(403).json({ message: 'Access denied. This order belongs to a different device.' });
      }
    }

    // Build update object
    const updateFields = {};
    if (typeof payment !== 'undefined') updateFields.payment = payment;
    if (typeof ref !== 'undefined') updateFields.ref = ref;
    if (typeof status !== 'undefined') updateFields.status = status;
    if (typeof fcm_token !== 'undefined') updateFields.fcm_token = fcm_token;

    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({ message: 'No update fields' });
    }

    let updated;
    
    // If moving to Processing, adjust inventory
    if (status === 'Processing') {
      const session = await Order.startSession();
      try {
        await session.withTransaction(async () => {
          // Lock the order to prevent race conditions
          const lockedOrder = await Order.findById(id).session(session);
          if (!lockedOrder) {
            throw new Error('Order not found');
          }

          // Re-validate device_id under the same transaction if provided
          if (device_id && lockedOrder.device_id && lockedOrder.device_id !== device_id) {
            throw new Error('Access denied. This order belongs to a different device.');
          }

          const previousStatus = lockedOrder.status;

          // Update order fields
          updated = await Order.findByIdAndUpdate(
            id,
            updateFields,
            { new: true, session }
          );

          // Only decrement stock if transitioning into Processing
          if (previousStatus !== 'Processing') {
            let itemsProcessed = 0;
            let stockUpdates = 0;
            
            // Fetch order items from separate collection
            const orderItems = await OrderItem.find({ order_id: id }).session(session);
            
            for (const item of orderItems) {
              const qty = Number(item.quantity) || 0;
              if (qty <= 0) continue;
              
              await Product.findByIdAndUpdate(
                item.product_id,
                { $inc: { stock: -qty } },
                { session }
              );
              stockUpdates += 1;
            }
            itemsProcessed = orderItems.length;
            
            // Attach diagnostics
            updated.items_processed = itemsProcessed;
            updated.stock_updates = stockUpdates;
          }
        });
      } catch (error) {
        console.error('updateOrderPayment transaction error:', error.message);
        return res.status(500).json({ message: 'Server error' });
      } finally {
        await session.endSession();
      }
    } else {
      updated = await Order.findByIdAndUpdate(id, updateFields, { new: true });
      if (!updated) return res.status(404).json({ message: 'Not found' });
    }

    // Send response
    const orderResponse = {
      ...updated.toObject(),
      id: updated._id
    };
    res.json({ order: orderResponse });

    // Send FCM notification if status changed
    if (status && validStatuses.includes(status) && updated.fcm_token) {
      try {
        const { initFirebaseAdmin, admin } = require('../config/fcm');
        initFirebaseAdmin();
        if (admin.apps && admin.apps.length > 0) {
          let title, body;
          switch (status) {
            case 'Processing':
              title = 'Order Being Processed';
              body = `Your order #${updated.order_code} is now being prepared.`;
              break;
            case 'Completed':
              title = 'Order Completed';
              body = `Your order #${updated.order_code} has been completed.`;
              break;
            case 'Delivered':
              title = 'Order Delivered!';
              body = `Your order #${updated.order_code} has been delivered successfully.`;
              break;
            case 'Cancelled':
              title = 'Order Cancelled';
              body = `Your order #${updated.order_code} has been cancelled.`;
              break;
            case 'Declined':
              title = 'Order Declined';
              body = `Your order #${updated.order_code} was declined. Please contact support.`;
              break;
            default:
              title = 'Order Update';
              body = `Your order #${updated.order_code} status has been updated to ${status}.`;
          }
          await admin.messaging().send({
            token: updated.fcm_token,
            notification: { title, body },
            data: {
              orderId: String(updated._id),
              orderCode: updated.order_code,
              status,
            },
          });
        }
      } catch (e) {
        console.warn('FCM send error:', e.message);
      }
    }
  } catch (_e) {
    res.status(500).json({ message: 'Server error' });
  }
}

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
      console.log('Processing order items:', JSON.stringify(items, null, 2));
      const orderItems = [];
      
      for (const it of items) {
        console.log('Processing item:', JSON.stringify(it, null, 2));
        const productId = it.product_id || it.productId;
        const quantity = Number(it.quantity || it.qty || 0);
        if (!productId || quantity <= 0) {
          console.log('Skipping item - invalid productId or quantity:', { productId, quantity });
          continue;
        }

        // Handle Flutter app's data structure
        let validProductId;
        let unitPrice = Number(it.price || it.unit_price || 0);
        let productName = it.product_name || it.name || '';
        let itemTotalPrice = Number(it.total || it.total_price || 0);

        try {
          if (typeof productId === 'number') {
            // Flutter app sends hash of MongoDB ObjectId as integer
            console.log(`Looking for product with dart_hash: ${productId}`);
            
            // Debug: Show what dart_hash values exist in the database
            const existingHashes = await Product.find({}).select('name dart_hash').limit(10);
            console.log('Existing dart_hash values in database:', existingHashes.map(p => `${p.name}: ${p.dart_hash}`));
            
            // First try to find by dart_hash field
            let matchingProduct = await Product.findOne({ dart_hash: productId }).select('_id name price');
            
            if (matchingProduct) {
              console.log(`Found matching product by dart_hash: ${matchingProduct.name} (${matchingProduct._id})`);
            } else {
              console.warn(`Product with dart_hash ${productId} not found. Trying alternative methods...`);
              
              // Try to find by name if provided
              if (productName && productName !== 'Unknown Product') {
                matchingProduct = await Product.findOne({ name: productName }).select('_id name price');
                if (matchingProduct) {
                  console.log(`Found product by name: ${matchingProduct.name} (${matchingProduct._id})`);
                }
              }
              
              // If still not found, try to find by price match
              if (!matchingProduct && Number.isFinite(unitPrice) && unitPrice > 0) {
                matchingProduct = await Product.findOne({ price: unitPrice }).select('_id name price');
                if (matchingProduct) {
                  console.log(`Found product by price: ${matchingProduct.name} (${matchingProduct._id})`);
                }
              }
              
              // Last resort: try to find any product with similar characteristics
              if (!matchingProduct) {
                const products = await Product.find({}).select('_id name price dart_hash').limit(100);
                // Try different hash calculations
                for (const p of products) {
                  const objectIdString = p._id.toString();
                  
                  // Try different hash algorithms
                  let hash1 = 0, hash2 = 0, hash3 = 0;
                  for (let i = 0; i < objectIdString.length; i++) {
                    const char = objectIdString.charCodeAt(i);
                    hash1 = ((hash1 << 5) - hash1) + char;
                    hash1 = hash1 & hash1;
                    
                    hash2 = hash2 * 31 + char;
                    hash2 = hash2 | 0;
                    
                    hash3 += char;
                  }
                  
                  if (Math.abs(hash1) === productId || Math.abs(hash2) === productId || Math.abs(hash3) === productId) {
                    matchingProduct = p;
                    console.log(`Found product with alternative hash: ${matchingProduct.name} (${matchingProduct._id})`);
                    break;
                  }
                }
              }
            }
            
            if (matchingProduct) {
              validProductId = matchingProduct._id;
              if (!productName) productName = matchingProduct.name;
              if (!Number.isFinite(unitPrice)) unitPrice = Number(matchingProduct.price) || 0;
            } else {
              console.warn(`Product with hash ID ${productId} not found with any method`);
              continue;
            }
          } else if (typeof productId === 'string') {
            // If it's a string, validate it's a valid ObjectId
            if (mongoose.Types.ObjectId.isValid(productId)) {
              validProductId = new mongoose.Types.ObjectId(productId);
              // Fetch product details if not provided
              if (!productName || !Number.isFinite(unitPrice)) {
                const product = await Product.findById(validProductId).select('name price');
                if (product) {
                  if (!productName) productName = product.name;
                  if (!Number.isFinite(unitPrice)) unitPrice = Number(product.price) || 0;
                }
              }
            } else {
              console.warn(`Invalid ObjectId format: ${productId}`);
              continue;
            }
          } else {
            console.warn(`Invalid product_id type: ${typeof productId}`);
            continue;
          }
        } catch (e) {
          console.warn(`Error processing product_id ${productId}:`, e.message);
          continue;
        }

        // Calculate total price if not provided
        if (!Number.isFinite(itemTotalPrice)) {
          itemTotalPrice = unitPrice * quantity;
        }

        // Ensure we have a product name
        if (!productName) {
          productName = 'Unknown Product';
        }

        const orderItem = {
          order_id: order._id,
          product_id: validProductId,
          quantity,
          unit_price: unitPrice,
          total_price: itemTotalPrice,
          product_name: productName
        };
        
        console.log('Created order item:', JSON.stringify(orderItem, null, 2));
        orderItems.push(orderItem);
      }

      if (orderItems.length > 0) {
        await OrderItem.insertMany(orderItems);
        insertedItems = orderItems.length;
        console.log(`Successfully inserted ${insertedItems} order items`);
      } else {
        console.log('No valid order items to insert');
      }
    } else {
      console.log('No items provided in order');
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

    // Format items with product names
    const formattedItems = items.map(item => ({
      product_id: item.product_id._id,
      name: item.product_name,
      quantity: Number(item.quantity) || 0,
      price: Number(item.unit_price) || 0,
      total_price: Number(item.total_price) || 0,
      product_details: {
        name: item.product_id.name,
        category: item.product_id.category,
        price: item.product_id.price
      }
    }));

    const orderResponse = {
      ...order,
      id: order._id,
      items: formattedItems
    };

    res.json({ order: orderResponse });
  } catch (_e) {
    res.status(500).json({ message: 'Server error' });
  }
}

async function getOrderItems(req, res) {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ message: 'Invalid id' });
    
    // Validate ObjectId format
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid order ID format' });
    }

    // Verify order exists
    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    // Get items from separate collection
    const items = await OrderItem.find({ order_id: id })
      .populate('product_id', 'name category price')
      .lean();

    const formattedItems = items.map((item, index) => ({
      id: index + 1, // Use index as id for consistency
      product_id: item.product_id._id,
      name: item.product_name,
      quantity: Number(item.quantity) || 0,
      price: Number(item.unit_price) || 0,
      total_price: Number(item.total_price) || 0,
      product_details: {
        name: item.product_id.name,
        category: item.product_id.category,
        price: item.product_id.price
      }
    }));

    res.json({ items });
  } catch (_e) {
    res.status(500).json({ message: 'Server error' });
  }
}

module.exports = { listOrders, updateOrderPayment, createOrder, getOrder, getOrderItems };