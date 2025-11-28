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
  const cleaned = value.toString().trim().replace(/[$,%\s,]/g, '');
  if (cleaned === '') return 0;
  const num = parseFloat(cleaned);
  return Number.isNaN(num) ? 0 : num;
};

const parseDate = (value) => {
  if (!value) return null;
  const str = value.toString().trim();
  if (!str) return null;

  // Accept MM/DD/YYYY or YYYY-MM-DD
  let month; let day; let year;
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(str)) {
    const parts = str.split(/[/-]/).map(Number);
    [month, day, year] = parts;
    if (year < 100) year += 2000;
  } else if (/^\d{4}[/-]\d{1,2}[/-]\d{1,2}$/.test(str)) {
    const parts = str.split(/[/-]/).map(Number);
    [year, month, day] = parts;
  } else {
    const parsed = new Date(str);
    if (Number.isNaN(parsed.getTime())) return null;
    parsed.setHours(0, 0, 0, 0);
    return parsed;
  }

  if (!month || !day || !year) return null;
  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const normalizeRowKeys = (row) => {
  const normalized = {};
  Object.entries(row).forEach(([key, value]) => {
    if (!key) return;
    const trimmedKey = key.trim();
    normalized[trimmedKey] = value;
    normalized[trimmedKey.toLowerCase()] = value;
  });
  return normalized;
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
          const normalizedRow = normalizeRowKeys(row);
          const summaryDate = parseDate(
            normalizedRow.Date ||
            normalizedRow.date ||
            normalizedRow['Summary Date'] ||
            normalizedRow['summary date']
          );
          if (!summaryDate) {
            skipped += 1;
            stream.resume();
            return;
          }

          const payload = {
            summary_date: summaryDate,
            gross_sales: parseNumber(
              normalizedRow['Gross Sales'] ??
              normalizedRow['Gross sales'] ??
              normalizedRow['gross sales']
            ),
            refunds: parseNumber(normalizedRow.Refunds ?? normalizedRow.refunds),
            discounts: parseNumber(normalizedRow.Discounts ?? normalizedRow.discounts),
            net_sales: parseNumber(
              normalizedRow['Net Sales'] ??
              normalizedRow['Net sales'] ??
              normalizedRow['net sales']
            ),
            cost_of_goods: parseNumber(
              normalizedRow['Cost of Goods'] ??
              normalizedRow['Cost of goods'] ??
              normalizedRow['cost of goods']
            ),
            gross_profit: parseNumber(
              normalizedRow['Gross Profit'] ??
              normalizedRow['Gross profit'] ??
              normalizedRow['gross profit']
            ),
            margin_percent: parseNumber(normalizedRow.Margin ?? normalizedRow.margin),
            taxes: parseNumber(normalizedRow.Taxes ?? normalizedRow.taxes)
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


