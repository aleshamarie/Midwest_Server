const fs = require('fs');
const { parse } = require('csv-parse');
const Product = require('../models/Product');
const SalesDailySummary = require('../models/SalesDailySummary');
const Order = require('../models/Order_Standalone');
const OrderItem = require('../models/OrderItem');

async function importProducts(req, res) {
  if (!req.file) return res.status(400).json({ message: 'CSV file required' });
  const filePath = req.file.path;
  let imported = 0;
  
  try {
    await new Promise((resolve, reject) => {
      const stream = fs.createReadStream(filePath)
        .pipe(parse({ columns: true, trim: true }))
        .on('data', async (row) => {
          stream.pause();
          try {
            // Map against export_items-1.csv
            const handle = row.Handle;
            const sku = row.SKU;
            const name = row.Name;
            if (!name) { stream.resume(); return; }
            const category = row.Category || null;
            const description = row.Description || null;
            const soldByWeight = (row['Sold by weight'] || 'N').toString().toUpperCase() === 'Y';
            const option1Name = row['Option 1 name'] || null;
            const option1Value = row['Option 1 value'] || null;
            const option2Name = row['Option 2 name'] || null;
            const option2Value = row['Option 2 value'] || null;
            const option3Name = row['Option 3 name'] || null;
            const option3Value = row['Option 3 value'] || null;
            const cost = parseFloat(row.Cost || 0) || 0;
            const barcode = row.Barcode || null;
            const includedSku = row['SKU of included item'] || null;
            const includedQty = parseInt(row['Quantity of included item'] || 0) || 0;
            const trackStock = (row['Track stock'] || 'Y').toString().toUpperCase() === 'Y';
            const available = (row['Available for sale [Midwest Grocery Store]'] || 'Y').toString().toUpperCase() === 'Y';
            const price = parseFloat(row['Price [Midwest Grocery Store]'] || 0) || 0;
            const stock = parseInt(row['In stock [Midwest Grocery Store]'] || 0) || 0;
            const lowStock = parseInt(row['Low stock [Midwest Grocery Store]'] || 5) || 5;
            const taxField = row['"Tax - ""VAT"" (12%)"'] || row['Tax - "VAT" (12%)'] || null;
            let taxLabel = null, taxRate = 0;
            if (taxField) { taxLabel = 'VAT'; taxRate = 12; }
            
            const productData = {
              handle,
              sku,
              name,
              category,
              description,
              sold_by_weight: soldByWeight,
              option1_name: option1Name,
              option1_value: option1Value,
              option2_name: option2Name,
              option2_value: option2Value,
              option3_name: option3Name,
              option3_value: option3Value,
              cost,
              barcode,
              included_sku: includedSku,
              included_qty: includedQty,
              track_stock: trackStock,
              available_for_sale: available,
              price,
              stock,
              low_stock_threshold: lowStock,
              tax_label: taxLabel,
              tax_rate: taxRate
            };
            
            await Product.findOneAndUpdate(
              { $or: [{ handle }, { sku }] },
              productData,
              { upsert: true, new: true }
            );
            imported += 1;
          } catch (_e) {
            console.error('Error importing product:', _e);
          }
          stream.resume();
        })
        .on('end', resolve)
        .on('error', reject);
    });
    
    res.json({ message: 'Products imported', imported });
  } catch (e) {
    console.error('Import failed:', e);
    res.status(500).json({ message: 'Import failed' });
  } finally {
    fs.unlink(filePath, () => {});
  }
}

async function importSales(req, res) {
  if (!req.file) return res.status(400).json({ message: 'CSV file required' });
  const filePath = req.file.path;
  let imported = 0;
  
  try {
    await new Promise((resolve, reject) => {
      const stream = fs.createReadStream(filePath)
        .pipe(parse({ columns: true, trim: true }))
        .on('data', async (row) => {
          stream.pause();
          try {
            // Map sales summary CSV to daily summary table
            const date = row.Date; // e.g., 2/6/25
            const gross = parseFloat(row['Gross sales'] || 0) || 0;
            const refunds = parseFloat(row['Refunds'] || 0) || 0;
            const discounts = parseFloat(row['Discounts'] || 0) || 0;
            const net = parseFloat(row['Net sales'] || 0) || 0;
            const cog = parseFloat(row['Cost of goods'] || 0) || 0;
            const profit = parseFloat(row['Gross profit'] || 0) || 0;
            const marginStr = (row['Margin'] || '0').toString().replace('%','');
            const margin = parseFloat(marginStr || 0) || 0;
            const taxes = parseFloat(row['Taxes'] || 0) || 0;
            
            // Normalize date to YYYY-MM-DD
            const summaryDate = new Date(date);
            const yyyy = summaryDate.getFullYear();
            const mm = String(summaryDate.getMonth()+1).padStart(2,'0');
            const dd = String(summaryDate.getDate()).padStart(2,'0');
            const isoDate = `${yyyy}-${mm}-${dd}`;
            
            const salesData = {
              summary_date: new Date(isoDate),
              gross_sales: gross,
              refunds: refunds,
              discounts: discounts,
              net_sales: net,
              cost_of_goods: cog,
              gross_profit: profit,
              margin_percent: margin,
              taxes: taxes
            };
            
            await SalesDailySummary.findOneAndUpdate(
              { summary_date: new Date(isoDate) },
              salesData,
              { upsert: true, new: true }
            );
            imported += 1;
          } catch (_e) {
            console.error('Error importing sales:', _e);
          }
          stream.resume();
        })
        .on('end', resolve)
        .on('error', reject);
    });
    
    res.json({ message: 'Sales imported', imported });
  } catch (e) {
    console.error('Import failed:', e);
    res.status(500).json({ message: 'Import failed' });
  } finally {
    fs.unlink(filePath, () => {});
  }
}

/**
 * Import item-level sales summary CSV as a single In-Store order with items.
 * Expected columns (from item-sales-summary-*.csv):
 * - Item name, SKU, Category, Items sold, Gross sales, Items refunded, Refunds, Discounts, Net sales, Cost of goods, Gross profit, Margin, Taxes
 *
 * Query params:
 * - date: (optional) ISO date to use as order date (YYYY-MM-DD). Defaults to today.
 * - note: (optional) extra text appended to the order name.
 */
async function importItemSalesAsOrder(req, res) {
  if (!req.file) return res.status(400).json({ message: 'CSV file required' });
  const filePath = req.file.path;

  const singleDateParam = (req.query.date || '').trim();
  const startDateParam = (req.query.startDate || '').trim();
  const endDateParam = (req.query.endDate || '').trim();
  const note = (req.query.note || '').trim();

  // Helper to normalize a Date to midnight
  const normalizeDate = (d) => {
    const nd = new Date(d);
    nd.setHours(0, 0, 0, 0);
    return nd;
  };

  // Determine if we are in "range mode" (random dates) or "single date" mode
  let rangeMode = false;
  let startDate = null;
  let endDate = null;

  if (startDateParam && endDateParam) {
    const s = new Date(startDateParam);
    const e = new Date(endDateParam);
    if (!Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime()) && s <= e) {
      startDate = normalizeDate(s);
      endDate = normalizeDate(e);
      rangeMode = true;
    }
  }

  let singleDate = normalizeDate(new Date());
  if (singleDateParam) {
    const d = new Date(singleDateParam);
    if (!Number.isNaN(d.getTime())) {
      singleDate = normalizeDate(d);
    }
  }

  // Helper: random date between start and end (inclusive), normalized to midnight
  const randomDateBetween = (s, e) => {
    const t1 = s.getTime();
    const t2 = e.getTime();
    const rand = t1 + Math.floor(Math.random() * (t2 - t1 + 1));
    return normalizeDate(new Date(rand));
  };

  const rows = [];
  let importErrors = 0;

  try {
    // Parse entire CSV into memory (summary file)
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(parse({ columns: true, trim: true }))
        .on('data', (row) => {
          rows.push(row);
        })
        .on('end', resolve)
        .on('error', reject);
    });

    if (!rows.length) {
      return res.status(400).json({ message: 'CSV has no data rows' });
    }

    // First map rows to products + item payloads
    const mappedItems = [];
    for (const row of rows) {
      try {
        const itemName = (row['Item name'] || row['Item Name'] || '').trim();
        const sku = (row.SKU || '').trim();
        const category = (row.Category || '').trim();
        const qty = Number(row['Items sold'] || row['Items Sold'] || 0) || 0;
        const gross = Number(row['Gross sales'] || row['Gross Sales'] || row['Net sales'] || 0) || 0;

        if (!itemName || !qty || !gross) {
          continue; // skip empty or zero rows
        }

        // Try to find product by SKU first, then by name
        const product = await Product.findOne(
          sku
            ? { $or: [{ sku }, { name: itemName }] }
            : { name: itemName }
        );

        if (!product) {
          importErrors += 1;
          continue;
        }

        const unitPrice = qty ? gross / qty : gross;

        mappedItems.push({
          product,
          itemName,
          sku,
          category,
          qty,
          gross,
          unitPrice
        });
      } catch (err) {
        console.error('Error mapping item-sales row:', err);
        importErrors += 1;
      }
    }

    if (!mappedItems.length) {
      return res.status(400).json({ message: 'No rows could be mapped to existing products' });
    }

    // Group items into one or more orders
    const ordersToCreate = [];

    if (rangeMode) {
      // Create multiple orders, grouping by randomly assigned date
      const ordersByDate = new Map(); // key: iso date, value: { date, items: [] }

      mappedItems.forEach((m) => {
        const d = randomDateBetween(startDate, endDate);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const iso = `${yyyy}-${mm}-${dd}`;

        if (!ordersByDate.has(iso)) {
          ordersByDate.set(iso, { date: d, items: [] });
        }
        ordersByDate.get(iso).items.push(m);
      });

      ordersByDate.forEach((entry, iso) => {
        ordersToCreate.push({
          date: entry.date,
          labelSuffix: `(${iso})`,
          items: entry.items
        });
      });
    } else {
      // Single-date mode: all items in one order
      const yyyy = singleDate.getFullYear();
      const mm = String(singleDate.getMonth() + 1).padStart(2, '0');
      const dd = String(singleDate.getDate()).padStart(2, '0');
      const iso = `${yyyy}-${mm}-${dd}`;

      ordersToCreate.push({
        date: singleDate,
        labelSuffix: `(${iso})`,
        items: mappedItems
      });
    }

    const createdOrders = [];
    let totalItemsInserted = 0;

    for (const [index, orderGroup] of ordersToCreate.entries()) {
      const { date, labelSuffix, items } = orderGroup;

      let totalGross = 0;
      const orderItemsPayload = items.map((m) => {
        totalGross += m.gross;
        return {
          product_id: m.product._id,
          product_name: m.product.name,
          product_sku: m.product.sku || m.sku || null,
          product_category: m.product.category || m.category || null,
          quantity: m.qty,
          unit_price: m.unitPrice,
          total_price: m.gross
        };
      });

      const discountTotal = 0;
      const netTotal = totalGross - discountTotal;

      const orderName = `Imported In-Store Sales${note ? ` - ${note}` : ''} ${labelSuffix}`;

      const order = await Order.create({
        order_code: `IMPORT-${Date.now()}-${index}`,
        name: orderName,
        contact: '',
        address: '',
        status: 'Completed',
        type: 'In-Store',
        payment: 'Cash',
        ref: null,
        totalPrice: totalGross,
        discount: discountTotal,
        net_total: netTotal,
        device_id: 'IMPORT-CSV',
        fcm_token: null,
        createdAt: date,
        updatedAt: date
      });

      const itemsToInsert = orderItemsPayload.map((item) => ({
        ...item,
        order_id: order._id
      }));

      await OrderItem.insertMany(itemsToInsert);
      totalItemsInserted += itemsToInsert.length;

      createdOrders.push({
        order_id: order._id,
        order_code: order.order_code,
        date: date.toISOString().slice(0, 10),
        items: itemsToInsert.length,
        total_gross: totalGross,
        net_total: netTotal
      });
    }

    res.json({
      message: rangeMode
        ? 'Item-level sales imported as multiple In-Store orders with random dates'
        : 'Item-level sales imported as In-Store order',
      orders_created: createdOrders.length,
      orders: createdOrders,
      items_imported: totalItemsInserted,
      errors: importErrors
    });
  } catch (e) {
    console.error('Import item-sales failed:', e);
    res.status(500).json({ message: 'Import failed' });
  } finally {
    fs.unlink(filePath, () => {});
  }
}

module.exports = { importProducts, importSales, importItemSalesAsOrder };


