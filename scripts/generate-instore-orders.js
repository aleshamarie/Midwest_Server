#!/usr/bin/env node
/**
 * Generate synthetic In-Store orders based on existing SalesDailySummary data.
 *
 * - Uses dates from 2025-01-01 until "today" (server local time).
 * - For each day that has instore_sales > 0 and no existing In-Store orders,
 *   it will create several completed cash orders and matching OrderItem rows.
 *
 * Run:
 *   node scripts/generate-instore-orders.js
 *
 * Optional env:
 *   START_DATE=2025-01-01
 *   END_DATE=2025-12-31
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');

const connectDB = require('../src/config/mongodb');
const SalesDailySummary = require('../src/models/SalesDailySummary');
const Product = require('../src/models/Product');
const OrderStandalone = require('../src/models/Order_Standalone');
const OrderItem = require('../src/models/OrderItem');

dotenv.config();

const DEFAULT_START_DATE = process.env.START_DATE || '2025-01-01';
const DEFAULT_END_DATE = process.env.END_DATE || new Date().toISOString().slice(0, 10);

function getDateRange(startStr, endStr) {
  const start = new Date(startStr);
  const end = new Date(endStr);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error(`Invalid START_DATE or END_DATE: ${startStr} - ${endStr}`);
  }
  // Normalize to midnight
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(arr) {
  return arr[randomInt(0, arr.length - 1)];
}

/**
 * Distribute a target daily in-store sales total into N random order totals.
 * Returns an array of numbers that roughly sum to targetTotal.
 */
function splitDailyTotalIntoOrders(targetTotal, minOrders = 3, maxOrders = 10) {
  if (targetTotal <= 0) {
    return [];
  }

  const numOrders = randomInt(minOrders, maxOrders);
  const base = targetTotal / numOrders;
  const orders = [];

  for (let i = 0; i < numOrders; i += 1) {
    // Randomize around base +/- 40%
    const factor = 0.6 + Math.random() * 0.8; // 0.6–1.4
    const value = Math.max(50, base * factor); // at least 50 currency units
    orders.push(value);
  }

  // Scale so the sum is close to targetTotal
  const currentSum = orders.reduce((sum, v) => sum + v, 0);
  if (currentSum > 0) {
    const scale = targetTotal / currentSum;
    return orders.map((v) => Math.max(20, Math.round(v * scale)));
  }

  return orders;
}

/**
 * Create realistic line items for a single order so that their sum
 * is close to the desired orderTotal.
 */
function buildOrderItemsForTotal(products, orderTotal) {
  const items = [];
  let remaining = orderTotal;

  const maxItems = randomInt(1, 6);

  for (let i = 0; i < maxItems && remaining > 0; i += 1) {
    const product = randomChoice(products);
    let unitPrice = 0;
    let variant = null;

    if (product.variants && product.variants.length > 0) {
      variant = randomChoice(product.variants);
      unitPrice = variant.price || product.price || 0;
    } else {
      unitPrice = product.price || 0;
    }

    if (!unitPrice || unitPrice <= 0) {
      // Skip products with no price
      continue;
    }

    // Choose a quantity that keeps us under remaining
    const maxQty = Math.max(1, Math.floor(remaining / unitPrice));
    const qty = randomInt(1, Math.min(maxQty, 8));
    const lineTotal = unitPrice * qty;

    items.push({
      product,
      variant,
      quantity: qty,
      unit_price: unitPrice,
      total_price: lineTotal
    });

    remaining -= lineTotal;
  }

  // If we failed to generate any items, fall back to a single cheap item
  if (items.length === 0 && products.length > 0) {
    const product = randomChoice(products);
    let unitPrice = product.price || 0;
    let variant = null;
    if (product.variants && product.variants.length > 0) {
      variant = randomChoice(product.variants);
      unitPrice = variant.price || unitPrice;
    }
    if (!unitPrice || unitPrice <= 0) unitPrice = 50;

    items.push({
      product,
      variant,
      quantity: 1,
      unit_price: unitPrice,
      total_price: unitPrice
    });
  }

  const computedTotal = items.reduce((sum, it) => sum + it.total_price, 0);
  return { items, computedTotal };
}

function generateOrderCode(date, index) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const idx = String(index + 1).padStart(3, '0');
  // IS = In-Store
  return `IS${yyyy}${mm}${dd}-${idx}`;
}

function randomTimeWithinDay(date) {
  const d = new Date(date);
  const hour = randomInt(8, 20); // 8am–8pm
  const minute = randomInt(0, 59);
  const second = randomInt(0, 59);
  d.setHours(hour, minute, second, 0);
  return d;
}

async function generateInstoreOrdersForDay(date, summary, products) {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  // Skip if this day already has in-store orders
  const existingCount = await OrderStandalone.countDocuments({
    type: 'In-Store',
    createdAt: { $gte: dayStart, $lte: dayEnd }
  });

  if (existingCount > 0) {
    console.log(
      `  - Skipping ${dayStart.toISOString().slice(0, 10)} (already has ${existingCount} In-Store orders)`
    );
    return { createdOrders: 0, createdItems: 0 };
  }

  const dayLabel = dayStart.toISOString().slice(0, 10);

  let instoreTotal = 0;
  if (summary) {
    instoreTotal =
      summary.instore_sales ||
      summary.net_sales ||
      summary.gross_sales ||
      0;
  }

  // If there is no summary or instore_total is 0/undefined,
  // generate a reasonable random daily total so you still get data.
  if (!instoreTotal || instoreTotal <= 0) {
    instoreTotal = randomInt(300, 1500);
    console.log(
      `  - No instore_sales for ${dayLabel}, using random total ${instoreTotal.toFixed(2)}`
    );
  }

  const orderTotals = splitDailyTotalIntoOrders(instoreTotal);
  if (orderTotals.length === 0) {
    console.log(
      `  - Skipping ${dayStart.toISOString().slice(0, 10)} (could not split daily total)`
    );
    return { createdOrders: 0, createdItems: 0 };
  }

  let createdOrders = 0;
  let createdItems = 0;

  for (let i = 0; i < orderTotals.length; i += 1) {
    const targetTotal = orderTotals[i];
    const { items, computedTotal } = buildOrderItemsForTotal(products, targetTotal);

    if (items.length === 0) {
      // No items => skip this order
      // eslint-disable-next-line no-continue
      continue;
    }

    const createdAt = randomTimeWithinDay(dayStart);
    const orderCode = generateOrderCode(dayStart, i);

    const totalPrice = computedTotal;
    const discount = 0;
    const netTotal = totalPrice - discount;

    const orderDoc = new OrderStandalone({
      order_code: orderCode,
      name: 'Walk-in Customer',
      contact: '',
      address: '',
      status: 'Completed',
      type: 'In-Store',
      payment: 'Cash',
      ref: '',
      totalPrice,
      discount,
      net_total: netTotal,
      device_id: 'INSTORE',
      createdAt,
      updatedAt: createdAt
    });

    await orderDoc.save();

    const orderItemsDocs = items.map((it) => ({
      order_id: orderDoc._id,
      product_id: it.product._id,
      quantity: it.quantity,
      unit_price: it.unit_price,
      total_price: it.total_price,
      product_name: it.product.name,
      product_sku: it.product.sku || (it.variant && it.variant.sku) || '',
      product_category: it.product.category || '',
      variant_id: it.variant ? it.variant._id : undefined,
      variant_name: it.variant ? it.variant.name : undefined,
      created_at: createdAt,
      createdAt,
      updatedAt: createdAt
    }));

    if (orderItemsDocs.length > 0) {
      await OrderItem.insertMany(orderItemsDocs);
      createdItems += orderItemsDocs.length;
    }

    createdOrders += 1;
  }

  console.log(
    `  - Created ${createdOrders} In-Store orders and ${createdItems} items for ${dayLabel} (instore_total=${instoreTotal.toFixed(2)})`
  );

  return { createdOrders, createdItems };
}

async function main() {
  const { start, end } = getDateRange(DEFAULT_START_DATE, DEFAULT_END_DATE);

  console.log('Generating synthetic In-Store orders...');
  console.log(`Date range: ${start.toISOString().slice(0, 10)} -> ${end.toISOString().slice(0, 10)}`);

  try {
    await connectDB();

    const products = await Product.find({ available_for_sale: true }).limit(500).lean();
    if (!products || products.length === 0) {
      console.error('No products found (available_for_sale = true). Cannot generate orders.');
      process.exitCode = 1;
      return;
    }

    console.log(`Loaded ${products.length} products to use for order items.`);

    const summaries = await SalesDailySummary.find({
      summary_date: { $gte: start, $lte: end }
    })
      .sort({ summary_date: 1 })
      .lean();

    if (!summaries || summaries.length === 0) {
      console.log('No SalesDailySummary records found in the specified date range. Generating random daily totals for all days.');
    } else {
      console.log(`Found ${summaries.length} SalesDailySummary records in date range.`);
    }

    // Build quick lookup map: 'YYYY-MM-DD' -> summary
    const summaryByDate = new Map();
    if (summaries && summaries.length > 0) {
      summaries.forEach((s) => {
        const key = new Date(s.summary_date).toISOString().slice(0, 10);
        summaryByDate.set(key, s);
      });
    }

    let totalOrders = 0;
    let totalItems = 0;

    // Iterate every calendar day in the range, regardless of whether
    // there is a SalesDailySummary row; if there is, we use its values.
    let cursor = new Date(start);
    cursor.setHours(0, 0, 0, 0);

    while (cursor <= end) {
      const key = cursor.toISOString().slice(0, 10);
      const summaryForDay = summaryByDate.get(key) || null;

      // eslint-disable-next-line no-await-in-loop
      const { createdOrders, createdItems } = await generateInstoreOrdersForDay(
        cursor,
        summaryForDay,
        products
      );
      totalOrders += createdOrders;
      totalItems += createdItems;

      cursor.setDate(cursor.getDate() + 1);
    }

    console.log('\nFinished generating In-Store orders.');
    console.log(`Total orders created: ${totalOrders}`);
    console.log(`Total order items created: ${totalItems}`);
  } catch (err) {
    console.error('Failed to generate In-Store orders:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed.');
  }
}

main();


