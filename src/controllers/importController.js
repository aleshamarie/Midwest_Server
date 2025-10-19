const fs = require('fs');
const { parse } = require('csv-parse');
const Product = require('../models/Product');
const SalesDailySummary = require('../models/SalesDailySummary');

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

module.exports = { importProducts, importSales };


