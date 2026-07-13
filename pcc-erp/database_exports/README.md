# 📦 PCC ERP - Database Export / SQL Dump

**วันที่ Export:** 2026-07-08  
**Source:** Supabase Project `PCC POSTENTION ERP` (ap-northeast-1)

---

## 📁 รายการไฟล์

| ไฟล์ | ตาราง | จำนวน | คำอธิบาย |
|------|-------|--------|-----------|
| `00_run_all.sql` | — | — | Script หลักสำหรับ import ทุกไฟล์ตามลำดับ |
| `01_products_seed.sql` | `products` | **400 rows** | ข้อมูลสินค้าทั้งหมด (แผ่นพื้น เสาเข็ม กำแพงกันดิน ฯลฯ) |
| `02_raw_materials_seed.sql` | `raw_materials` | **18 rows** | วัตถุดิบ (ลวด เหล็กเส้น เมช) |
| `03_profiles_seed.sql` | `profiles` | **7 rows** | ข้อมูลผู้ใช้งานระบบ |

---

## ⚠️ ข้อควรระวังก่อน Import

### 1. ตาราง `profiles` — สำคัญมาก!
- `profiles.id` เชื่อมกับ `auth.users` ของ Supabase Auth
- ถ้าระบบปลายทาง **ใช้ Supabase Auth** → ต้องสร้าง auth users ก่อนด้วย email เดิม แล้วค่อย insert profiles
- ถ้าระบบปลายทาง **ไม่ใช้ Supabase** → อาจต้องตัดคอลัมน์ id และใช้ UUID ใหม่
- **Password ไม่ได้ export มาด้วย** เนื่องจากเก็บใน auth.users (hashed)

### 2. ลำดับการ Import
```
1. raw_materials  (ไม่มี dependencies)
2. profiles       (ไม่มี dependencies ภายใน ERP)
3. products       (ไม่มี dependencies ภายใน ERP)
```

### 3. ENUM Type สำหรับ `role`
ตาราง `profiles.role` ใช้ ENUM type ที่มีค่า:
```sql
'admin', 'planner', 'worker', 'qc', 'material', 'concrete', 'warehouse'
```
ต้องสร้าง type นี้ก่อน หรือแก้ไขให้เป็น TEXT ก่อน import

---

## 🚀 วิธีการ Import

### วิธีที่ 1: ผ่าน Supabase Dashboard SQL Editor
1. เปิด Supabase Dashboard ของระบบปลายทาง
2. ไปที่ **SQL Editor**
3. Copy เนื้อหาไฟล์ `01_products_seed.sql`, `02_raw_materials_seed.sql`, `03_profiles_seed.sql` แล้ว paste ทีละไฟล์

### วิธีที่ 2: ผ่าน psql CLI
```bash
# เชื่อมต่อกับ database ปลายทาง
psql "postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres"

# รันทีละไฟล์ตามลำดับ
\i /path/to/database_exports/02_raw_materials_seed.sql
\i /path/to/database_exports/03_profiles_seed.sql
\i /path/to/database_exports/01_products_seed.sql
```

### วิธีที่ 3: รันทั้งหมดพร้อมกัน (psql เท่านั้น)
```bash
psql "postgresql://..." -c "\cd /path/to/database_exports" -f 00_run_all.sql
```

---

## 📊 สรุปข้อมูล Products ตามหมวดหมู่

| หมวดหมู่ | จำนวน (ประมาณ) |
|----------|--------------|
| A13 แผ่นพื้น | ~200+ รายการ |
| A35 รั้วสำเร็จรูป | ~50+ รายการ |
| A36 เสา คาน บันได | ~50+ รายการ |
| A41 เสาเข็ม | ~30+ รายการ |
| A42 กำแพงกันดิน | ~30+ รายการ |
| A30/A31 ผนัง | ~20+ รายการ |
| อื่นๆ | ที่เหลือ |

---

## 📝 หมายเหตุ

- ข้อมูลที่ `is_active = false` ก็ถูก export มาด้วยเพื่อความครบถ้วน
- Timestamps ถูกเก็บใน timezone `+00` (UTC)
- ข้อมูล `qty_on_hand` ใน raw_materials เป็นข้อมูล ณ วันที่ export (2026-07-08)
- ตาราง `product_bom_items` (345 rows) ไม่ได้รวมในชุดนี้ — แจ้งหากต้องการเพิ่ม
