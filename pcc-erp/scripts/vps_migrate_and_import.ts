#!/usr/bin/env node
// ============================================================
// PCC ERP — VPS Database Migration & Data Import Script
// วันที่: 2026-08-01
// ใช้ Supabase REST API ด้วย service_role key เพื่อ:
//   1. Apply migration 022 (สร้าง product_bom_items table)
//   2. Apply migration 023 (เพิ่ม columns ที่ขาด)
//   3. Import raw_materials (18 rows)
//   4. Import products (400 rows)
//   5. Import product_bom_items (345 rows)
// ============================================================

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const SUPABASE_URL = 'http://119.59.116.74:8000';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3ODUxNjk3NTQsImV4cCI6MjEwMDUyOTc1NH0.5cy-oSvPyj4-zaHOBoZdG_mIMClS0Z_-u5kfKZ3OkSc';

// ใช้ service_role เพื่อ bypass RLS
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

// Helper: รัน SQL ผ่าน Supabase RPC (ถ้ามี exec_sql function) หรือผ่าน REST
async function executeSql(sql: string, label: string): Promise<void> {
  console.log(`\n⏳ ${label}...`);
  
  // ใช้ fetch โดยตรงไปยัง PostgreSQL REST endpoint
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ sql }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`❌ Error in ${label}: ${error}`);
    throw new Error(error);
  }

  console.log(`✅ ${label} สำเร็จ`);
}

// Helper: parse INSERT statements จาก SQL file
function parseSqlFile(filePath: string): string[] {
  const content = readFileSync(filePath, 'utf8');
  // แยก SQL statements ที่เป็น INSERT เท่านั้น
  return content
    .split('\n')
    .filter(line => line.trim().startsWith('INSERT INTO') || line.trim().startsWith('SET session_replication_role'))
    .join('\n')
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .map(s => s + ';');
}

async function checkTableExists(tableName: string): Promise<{ exists: boolean; rowCount: number }> {
  const { data, error } = await supabase.from(tableName).select('*', { count: 'exact', head: true });
  if (error && error.code === 'PGRST205') {
    return { exists: false, rowCount: 0 };
  }
  return { exists: true, rowCount: (data as any)?.length ?? 0 };
}

async function main() {
  console.log('============================================================');
  console.log('  PCC ERP — VPS Database Migration & Data Import');
  console.log('  Target: http://119.59.116.74:8000');
  console.log('============================================================');

  // ── STEP 0: ตรวจสอบสถานะปัจจุบัน ──────────────────────────
  console.log('\n📊 ตรวจสอบสถานะ database ปัจจุบัน...');
  
  const tables = ['products', 'raw_materials', 'product_bom_items'];
  for (const table of tables) {
    const status = await checkTableExists(table);
    if (status.exists) {
      const { count } = await supabase.from(table).select('*', { count: 'exact', head: true });
      console.log(`  ✓ ${table}: EXISTS (${count ?? 0} rows)`);
    } else {
      console.log(`  ✗ ${table}: NOT FOUND`);
    }
  }

  // ── STEP 1: Apply Migration 022 (สร้าง product_bom_items) ──
  const migration022 = readFileSync(
    join(ROOT, 'supabase/migrations/022_create_product_bom_items_table.sql'), 'utf8'
  );
  await executeSql(migration022, 'Migration 022: สร้าง product_bom_items table');

  // ── STEP 2: Apply Migration 023 (เพิ่ม missing columns) ────
  const migration023 = readFileSync(
    join(ROOT, 'supabase/migrations/023_add_missing_columns_products_rawmaterials.sql'), 'utf8'
  );
  await executeSql(migration023, 'Migration 023: เพิ่ม columns ที่ขาด');

  // ── STEP 3: ตรวจสอบหลัง migration ──────────────────────────
  console.log('\n📊 ตรวจสอบหลัง apply migration...');
  for (const table of tables) {
    const status = await checkTableExists(table);
    console.log(`  ${status.exists ? '✓' : '✗'} ${table}: ${status.exists ? 'EXISTS' : 'NOT FOUND'}`);
  }

  console.log('\n✅ Migration เสร็จสมบูรณ์!');
  console.log('\n⚠️  ขั้นตอนถัดไป: Import data ผ่าน Supabase Dashboard SQL Editor');
  console.log('    ดูไฟล์: database_exports/VPS_import_guide.sql');
}

main().catch(console.error);
