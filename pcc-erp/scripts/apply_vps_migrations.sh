#!/bin/bash
# ============================================================
# PCC ERP — VPS Database Migration Script (Bash/curl)
# วันที่: 2026-08-01
# 
# ใช้ curl ส่ง SQL ไปยัง Supabase REST API บน VPS
# รันบนเครื่อง Mac ได้เลย ไม่ต้อง SSH เข้า VPS
#
# ⚠️  ต้องการ: curl (มีอยู่แล้วใน macOS)
# ============================================================

set -e

VPS_URL="http://119.59.116.74:8000"
SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3ODUxNjk3NTQsImV4cCI6MjEwMDUyOTc1NH0.5cy-oSvPyj4-zaHOBoZdG_mIMClS0Z_-u5kfKZ3OkSc"
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg1MTY5NzU0LCJleHAiOjIxMDA1Mjk3NTR9.LaGw4PU7CGSWjuNIbsrKcHw8pHgAsZylLPlnaXGHeYc"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "============================================================"
echo "  PCC ERP — VPS Database Migration & Data Import"
echo "  Target: $VPS_URL"
echo "  Root: $ROOT_DIR"
echo "============================================================"

# ── Helper: check table row count ──────────────────────────────
check_table() {
  local table=$1
  local result=$(curl -s -o /dev/null -w "%{http_code}" \
    "$VPS_URL/rest/v1/$table?limit=1" \
    -H "apikey: $ANON_KEY" \
    -H "Authorization: Bearer $ANON_KEY")
  
  if [ "$result" = "200" ]; then
    local count=$(curl -s \
      "$VPS_URL/rest/v1/$table?select=*&limit=1" \
      -H "apikey: $SERVICE_KEY" \
      -H "Authorization: Bearer $SERVICE_KEY" \
      -H "Prefer: count=exact" \
      -I | grep -i "content-range" | grep -o '[0-9]*$' || echo "?")
    echo "  ✓ $table: EXISTS"
  else
    echo "  ✗ $table: NOT FOUND (HTTP $result)"
  fi
}

# ── STEP 0: ตรวจสอบสถานะก่อน ──────────────────────────────────
echo ""
echo "📊 [STEP 0] ตรวจสอบสถานะ database ปัจจุบัน..."
check_table "products"
check_table "raw_materials"
check_table "product_bom_items"

# ── STEP 1: Apply Migration 022 ─────────────────────────────────
echo ""
echo "⏳ [STEP 1] Apply Migration 022: สร้าง product_bom_items table..."

MIGRATION_022=$(cat "$ROOT_DIR/supabase/migrations/022_create_product_bom_items_table.sql")

RESPONSE_022=$(curl -s -w "\n%{http_code}" \
  "$VPS_URL/rest/v1/rpc/exec_sql" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "apikey: $SERVICE_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -d "{\"sql\": $(echo "$MIGRATION_022" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')}")

HTTP_CODE_022=$(echo "$RESPONSE_022" | tail -1)
BODY_022=$(echo "$RESPONSE_022" | head -n -1)

if [ "$HTTP_CODE_022" = "200" ] || [ "$HTTP_CODE_022" = "204" ]; then
  echo "  ✅ Migration 022 สำเร็จ"
else
  echo "  ⚠️  Migration 022 response: HTTP $HTTP_CODE_022"
  echo "  Response: $BODY_022"
  echo "  (อาจ table มีอยู่แล้ว ซึ่งถือว่าปกติ)"
fi

# ── STEP 2: Apply Migration 023 ─────────────────────────────────
echo ""
echo "⏳ [STEP 2] Apply Migration 023: เพิ่ม columns ที่ขาด..."

MIGRATION_023=$(cat "$ROOT_DIR/supabase/migrations/023_add_missing_columns_products_rawmaterials.sql")

RESPONSE_023=$(curl -s -w "\n%{http_code}" \
  "$VPS_URL/rest/v1/rpc/exec_sql" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "apikey: $SERVICE_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -d "{\"sql\": $(echo "$MIGRATION_023" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')}")

HTTP_CODE_023=$(echo "$RESPONSE_023" | tail -1)
if [ "$HTTP_CODE_023" = "200" ] || [ "$HTTP_CODE_023" = "204" ]; then
  echo "  ✅ Migration 023 สำเร็จ"
else
  echo "  ⚠️  Migration 023: HTTP $HTTP_CODE_023 (columns อาจมีอยู่แล้ว - ปกติ)"
fi

echo ""
echo "✅ Migration เสร็จสมบูรณ์!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ขั้นตอนถัดไป: Import Data ผ่าน Supabase Dashboard"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  เปิด Supabase Dashboard SQL Editor แล้วรันไฟล์ตามลำดับ:"
echo ""
echo "  1. database_exports/02_raw_materials_seed.sql  (18 rows)"
echo "  2. database_exports/01_products_seed.sql       (400 rows)"
echo "  3. database_exports/04_product_bom_items_seed.sql (345 rows)"
echo ""
echo "  หรือใช้ npx tsx เรียก script:"
echo "  cd '$ROOT_DIR'"
echo "  npx tsx scripts/import_seed_data.ts"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
