#!/usr/bin/env node
// ============================================================
// PCC ERP — VPS Seed Data Import Script
// วันที่: 2026-08-01
//
// Script นี้ import ข้อมูลจาก database_exports/ เข้า VPS
// ผ่าน Supabase REST API (upsert เพื่อป้องกัน duplicate)
//
// วิธีรัน:
//   cd /Users/necxa/new\ design\ system/pcc-erp
//   npx tsx scripts/import_seed_data.ts
// ============================================================

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const SUPABASE_URL = 'http://119.59.116.74:8000';
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3ODUxNjk3NTQsImV4cCI6MjEwMDUyOTc1NH0.5cy-oSvPyj4-zaHOBoZdG_mIMClS0Z_-u5kfKZ3OkSc';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
  db: { schema: 'public' }
});

// ── Helper: parse INSERT rows จาก SQL file ──────────────────────
function parseSqlToRows(filePath: string): Record<string, unknown>[] {
  const content = readFileSync(filePath, 'utf8');
  const rows: Record<string, unknown>[] = [];

  // Match all INSERT INTO ... VALUES (...) statements
  const insertRegex = /INSERT INTO public\.\w+ \(([^)]+)\) VALUES \((.+)\);/g;
  let match;

  while ((match = insertRegex.exec(content)) !== null) {
    const columns = match[1].split(',').map(c => c.trim());
    const valuesStr = match[2];

    // Parse values (handle quoted strings, NULLs, booleans, numbers)
    const values = parseValues(valuesStr);

    if (columns.length === values.length) {
      const row: Record<string, unknown> = {};
      columns.forEach((col, i) => {
        row[col] = values[i];
      });
      rows.push(row);
    }
  }

  return rows;
}

// Parse SQL values string into JS values array
function parseValues(valuesStr: string): unknown[] {
  const values: unknown[] = [];
  let i = 0;
  let current = '';

  while (i < valuesStr.length) {
    const char = valuesStr[i];

    if (char === "'" ) {
      // String value
      let str = '';
      i++; // skip opening quote
      while (i < valuesStr.length) {
        if (valuesStr[i] === "'" && valuesStr[i+1] === "'") {
          str += "'";
          i += 2;
        } else if (valuesStr[i] === "'") {
          i++; // skip closing quote
          break;
        } else {
          str += valuesStr[i];
          i++;
        }
      }
      values.push(str);
      // skip comma and whitespace
      while (i < valuesStr.length && (valuesStr[i] === ',' || valuesStr[i] === ' ')) i++;
    } else if (valuesStr.startsWith('NULL', i)) {
      values.push(null);
      i += 4;
      while (i < valuesStr.length && (valuesStr[i] === ',' || valuesStr[i] === ' ')) i++;
    } else if (valuesStr.startsWith('true', i)) {
      values.push(true);
      i += 4;
      while (i < valuesStr.length && (valuesStr[i] === ',' || valuesStr[i] === ' ')) i++;
    } else if (valuesStr.startsWith('false', i)) {
      values.push(false);
      i += 5;
      while (i < valuesStr.length && (valuesStr[i] === ',' || valuesStr[i] === ' ')) i++;
    } else if (char === ',' || char === ' ') {
      if (current.trim()) {
        const num = parseFloat(current.trim());
        values.push(isNaN(num) ? current.trim() : num);
        current = '';
      }
      i++;
    } else {
      current += char;
      i++;
    }
  }

  if (current.trim()) {
    const num = parseFloat(current.trim());
    values.push(isNaN(num) ? current.trim() : num);
  }

  return values;
}

// ── Helper: upsert rows in batches ───────────────────────────────
async function upsertBatch(
  tableName: string,
  rows: Record<string, unknown>[],
  batchSize: number = 50
): Promise<void> {
  console.log(`\n⏳ Importing ${rows.length} rows into ${tableName}...`);
  let inserted = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase
      .from(tableName)
      .upsert(batch, { onConflict: 'id' });

    if (error) {
      console.error(`  ❌ Error at batch ${Math.floor(i/batchSize) + 1}: ${error.message}`);
      // continue with next batch
    } else {
      inserted += batch.length;
      process.stdout.write(`  ✓ ${inserted}/${rows.length} rows\r`);
    }
  }

  console.log(`\n  ✅ ${tableName}: ${inserted} rows imported`);
}

async function main() {
  console.log('============================================================');
  console.log('  PCC ERP — VPS Seed Data Import');
  console.log(`  Target: ${SUPABASE_URL}`);
  console.log('============================================================');

  // ── ตรวจสอบ connection ────────────────────────────────────────
  console.log('\n🔍 ตรวจสอบ connection...');
  const { data: pingData, error: pingError } = await supabase
    .from('products')
    .select('id')
    .limit(1);

  if (pingError && pingError.code !== 'PGRST116') {
    console.error('❌ Cannot connect to Supabase:', pingError.message);
    process.exit(1);
  }
  console.log('  ✅ Connected to VPS Supabase');

  // ── ตรวจสอบ row counts ก่อน import ────────────────────────────
  console.log('\n📊 จำนวนข้อมูลก่อน import:');
  const tables = ['raw_materials', 'products', 'product_bom_items'];
  for (const t of tables) {
    const { count } = await supabase.from(t).select('*', { count: 'exact', head: true });
    console.log(`  ${t}: ${count ?? 'N/A'} rows`);
  }

  // ── STEP 1: Import raw_materials ──────────────────────────────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const rawMaterialsPath = join(ROOT, 'database_exports/02_raw_materials_seed.sql');
  const rawMaterialsRows = parseSqlToRows(rawMaterialsPath);
  await upsertBatch('raw_materials', rawMaterialsRows, 18); // small batch, all 18

  // ── STEP 2: Import products ────────────────────────────────────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const productsPath = join(ROOT, 'database_exports/01_products_seed.sql');
  const productsRows = parseSqlToRows(productsPath);
  await upsertBatch('products', productsRows, 50);

  // ── STEP 3: Import product_bom_items ──────────────────────────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const bomPath = join(ROOT, 'database_exports/04_product_bom_items_seed.sql');
  const bomRows = parseSqlToRows(bomPath);
  await upsertBatch('product_bom_items', bomRows, 50);

  // ── ตรวจสอบ row counts หลัง import ────────────────────────────
  console.log('\n📊 จำนวนข้อมูลหลัง import:');
  for (const t of tables) {
    const { count } = await supabase.from(t).select('*', { count: 'exact', head: true });
    const icon = (count ?? 0) > 0 ? '✅' : '❌';
    console.log(`  ${icon} ${t}: ${count ?? 0} rows`);
  }

  console.log('\n============================================================');
  console.log('  Import เสร็จสมบูรณ์!');
  console.log('============================================================\n');
}

main().catch(console.error);
