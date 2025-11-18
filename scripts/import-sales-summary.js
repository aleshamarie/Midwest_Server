#!/usr/bin/env node
/*
  CLI: Import Shopify-style sales summary CSVs into MongoDB sales_daily_summary
  Usage:
    node scripts/import-sales-summary.js "C:/path/to/SALES-SUMMARY.csv"
*/

const fs = require('fs');
const { parse } = require('csv-parse');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

const connectDB = require('../src/config/mongodb');
const SalesDailySummary = require('../src/models/SalesDailySummary');

dotenv.config();

const parseNumber = (value = 0) => {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  const cleaned = value.toString().replace(/[$,%\s,]/g, '');
  const num = parseFloat(cleaned);
  return Number.isNaN(num) ? 0 : num;
};

const parseDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
};

async function importSalesSummaries(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  console.log('Starting sales summary import from:', filePath);

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath)
      .pipe(parse({ columns: true, trim: true }))
      .on('data', async (row) => {
        stream.pause();
        try {
          const summaryDate = parseDate(row.Date || row.date);
          if (!summaryDate) {
            skipped += 1;
            stream.resume();
            return;
          }

          const payload = {
            summary_date: summaryDate,
            gross_sales: parseNumber(row['Gross Sales'] ?? row['Gross sales']),
            refunds: parseNumber(row['Refunds']),
            discounts: parseNumber(row['Discounts']),
            net_sales: parseNumber(row['Net Sales'] ?? row['Net sales']),
            cost_of_goods: parseNumber(row['Cost of Goods'] ?? row['Cost of goods']),
            gross_profit: parseNumber(row['Gross Profit'] ?? row['Gross profit']),
            margin_percent: parseNumber(row['Margin']),
            taxes: parseNumber(row['Taxes'])
          };

          await SalesDailySummary.findOneAndUpdate(
            { summary_date: payload.summary_date },
            payload,
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );

          imported += 1;
        } catch (error) {
          errors += 1;
          console.error('Error processing row:', error.message);
        }
        stream.resume();
      })
      .on('end', resolve)
      .on('error', reject);
  });

  console.log('\nSales summary import finished!');
  console.log(`- Imported/Updated: ${imported}`);
  console.log(`- Skipped: ${skipped}`);
  console.log(`- Errors: ${errors}`);
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.log('Usage: node scripts/import-sales-summary.js "C:/path/to/SALES-SUMMARY.csv"');
    process.exit(1);
  }

  try {
    await connectDB();
    await importSalesSummaries(filePath);
  } catch (error) {
    console.error('Import failed:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed.');
  }
}

main();


