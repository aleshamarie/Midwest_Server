const Order = require('../models/Order_Standalone');
const OrderItem = require('../models/OrderItem');
const Product = require('../models/Product');
const mongoose = require('mongoose');
const cloudinary = require('../config/cloudinary');
const { Readable } = require('stream');
const multer = require('multer');

// Configure multer for memory storage (for Cloudinary)
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(file.originalname.toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files (jpeg, jpg, png, gif, webp) are allowed!'));
    }
  }
});

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
      .select('order_code name contact address status type payment ref totalPrice discount net_total device_id createdAt payment_proof_image_url payment_proof_public_id')
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
    const { payment, ref, status, device_id, fcm_token, payment_proof_image_url, payment_proof_public_id } = req.body || {};

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
    if (typeof payment_proof_image_url !== 'undefined') updateFields.payment_proof_image_url = payment_proof_image_url;
    if (typeof payment_proof_public_id !== 'undefined') updateFields.payment_proof_public_id = payment_proof_public_id;

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
    const { name, contact, address, payment, ref, totalPrice, discount, net_total, status, type, device_id, fcm_token, items = [], payment_proof_image_url, payment_proof_public_id } = req.body || {};

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
      fcm_token: fcm_token || null,
      payment_proof_image_url: payment_proof_image_url || null,
      payment_proof_public_id: payment_proof_public_id || null
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

        // Extract variant information if provided
        const variantId = it.variant_id || it.variantId || null;
        const variantName = it.variant_name || it.variantName || null;
        
        // If variant_id is provided, validate it
        let validVariantId = null;
        if (variantId) {
          if (mongoose.Types.ObjectId.isValid(variantId)) {
            validVariantId = new mongoose.Types.ObjectId(variantId);
          } else {
            console.warn(`Invalid variant_id format: ${variantId}`);
          }
        }

        const orderItem = {
          order_id: order._id,
          product_id: validProductId,
          quantity,
          unit_price: unitPrice,
          total_price: itemTotalPrice,
          product_name: productName,
          variant_id: validVariantId,
          variant_name: variantName
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
      _id: order._id.toString(), // Ensure _id is included as string for mobile app
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

    const formattedItems = items.map((item, index) => {
      // Handle case where product_id might be null or not populated
      const productId = item.product_id ? (item.product_id._id || item.product_id) : null;
      const productName = item.product_id?.name || item.product_name || 'Unknown Product';
      const productCategory = item.product_id?.category || null;
      const productPrice = item.product_id?.price || item.unit_price || 0;

      return {
        id: index + 1, // Use index as id for consistency
        product_id: productId,
        name: item.product_name || productName,
        quantity: Number(item.quantity) || 0,
        price: Number(item.unit_price) || 0,
        total_price: Number(item.total_price) || 0,
        product_details: {
          name: productName,
          category: productCategory,
          price: productPrice
        }
      };
    });

    res.json({ items: formattedItems });
  } catch (_e) {
    res.status(500).json({ message: 'Server error' });
  }
}

async function uploadPaymentProof(req, res) {
  try {
    const orderId = req.params.id;
    
    if (!orderId) {
      return res.status(400).json({ message: 'Order ID is required' });
    }
    
    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      console.error('Invalid order ID format:', orderId, 'Type:', typeof orderId);
      return res.status(400).json({ message: 'Invalid order ID format', receivedId: orderId });
    }
    
    if (!req.file) {
      console.error('No file in request. Request body keys:', Object.keys(req.body || {}));
      return res.status(400).json({ message: 'No image file provided' });
    }
    
    console.log('File received:', {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      bufferLength: req.file.buffer ? req.file.buffer.length : 0
    });

    const maxSize = 5 * 1024 * 1024; // 5MB in bytes
    if (req.file.size > maxSize) {
      return res.status(400).json({
        message: `Image file too large. Maximum size is 5MB. Current size: ${Math.round(req.file.size / 1024 / 1024 * 100) / 100}MB`
      });
    }

    console.log('Uploading payment proof for order ID:', orderId);
    // Check if order exists
    const order = await Order.findById(orderId);
    if (!order) {
      console.error('Order not found with ID:', orderId);
      return res.status(404).json({ message: 'Order not found', orderId: orderId });
    }
    console.log('Order found:', order.order_code);

    // Delete old payment proof if exists
    if (order.payment_proof_public_id) {
      try {
        await cloudinary.uploader.destroy(order.payment_proof_public_id);
      } catch (deleteError) {
        console.warn('Failed to delete old payment proof:', deleteError);
      }
    }

    // Upload new image to Cloudinary using Promise wrapper
    const uploadPromise = new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'midwest-grocery/orders/payment-proofs',
          public_id: `order-${orderId}-${Date.now()}`,
          transformation: [
            { width: 1200, height: 1200, crop: 'limit', quality: 'auto' },
            { fetch_format: 'auto' }
          ]
        },
        (error, result) => {
          if (error) {
            console.error('Cloudinary upload error:', error);
            reject(new Error(`Failed to upload image to Cloudinary: ${error.message}`));
          } else {
            resolve(result);
          }
        }
      );

      // Handle stream errors
      stream.on('error', (streamError) => {
        console.error('Stream error:', streamError);
        reject(new Error(`Stream error: ${streamError.message}`));
      });

      // Pipe the file buffer to the stream
      if (req.file.buffer) {
        const bufferStream = new Readable();
        bufferStream.push(req.file.buffer);
        bufferStream.push(null);
        bufferStream.pipe(stream);
      } else {
        reject(new Error('File buffer is missing'));
      }
    });

    // Wait for upload to complete
    const result = await uploadPromise;

    // Update order with payment proof URL
    const updatedOrder = await Order.findByIdAndUpdate(
      orderId,
      {
        payment_proof_image_url: result.secure_url,
        payment_proof_public_id: result.public_id
      },
      { new: true, select: 'order_code payment_proof_image_url payment_proof_public_id' }
    );

    if (!updatedOrder) {
      // If database update fails, delete the uploaded image from Cloudinary
      try {
        await cloudinary.uploader.destroy(result.public_id);
      } catch (destroyError) {
        console.error('Failed to delete uploaded image from Cloudinary:', destroyError);
      }
      return res.status(500).json({ message: 'Failed to update order with payment proof URL' });
    }

    res.json({
      message: 'Payment proof uploaded successfully',
      order: {
        id: updatedOrder._id,
        order_code: updatedOrder.order_code,
        payment_proof_image_url: updatedOrder.payment_proof_image_url,
        has_payment_proof: !!updatedOrder.payment_proof_image_url
      }
    });
    
  } catch (error) {
    console.error('Error uploading payment proof:', error);
    console.error('Error stack:', error.stack);
    if (!res.headersSent) {
      res.status(500).json({ 
        message: 'Server error', 
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }
}

module.exports = { listOrders, updateOrderPayment, createOrder, getOrder, getOrderItems, uploadPaymentProof };