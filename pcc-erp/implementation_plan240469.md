# แผนการปรับปรุง Roles และ Workflow ระบบ PCC-ERP

อ้างอิงจากความต้องการใหม่ ระบบจะถูกปรับเปลี่ยน Roles ผู้ใช้งานและ Flow การทำงานทั้งหมดเพื่อให้สอดคล้องกับกระบวนการจริง 6 ขั้นตอน

## User Review Required

> [!WARNING]
> การปรับเปลี่ยนนี้จะกระทบกับ Database Schema เดิม (เช่น `UserRole`, `JobOrder`, `DemoldingRecord`) รวมถึงสิทธิ์การเข้าถึงหน้าต่างๆ โปรดตรวจสอบว่าฟิลด์ที่จะเพิ่มใหม่ตรงตามความต้องการหรือไม่

## Open Questions

> [!IMPORTANT]
> 1. **การคำนวณวัตถุดิบ (BOM):** ระบบมีสูตรคำนวณเหล็ก/คอนกรีตอยู่แล้ว หรือ Planner จะเป็นคนกรอกจำนวนที่ต้องเบิกเองในแต่ละแผนการผลิต?
> 2. **หน้าจอ Concrete และ Material:** พนักงาน 2 กลุ่มนี้จะใช้งานผ่าน PC (Desktop Layout) หรือ Mobile Layout?
> 3. **ขั้นตอนการถอดแบบ:** เดิมที Worker เป็นคนบันทึกการถอดแบบ (Demolding) เปลี่ยนเป็น QC ทำหน้าที่นี้ทั้งหมด รวมถึงบันทึกของดี/ของเสีย ใช่หรือไม่?

---

## Proposed Changes

### 1. ปรับปรุงสิทธิ์ผู้ใช้งาน (Roles & Permissions)

#### [MODIFY] `lib/supabase/types.ts`
- อัปเดต `UserRole` เป็น: `'admin' | 'planner' | 'material' | 'warehouse' | 'worker' | 'qc' | 'concrete'`

#### [MODIFY] `lib/rbac.ts`
- อัปเดต `ROLE_PERMISSIONS` เพื่อจำกัดสิทธิ์หน้าจอให้ผู้ใช้แต่ละกลุ่ม:
  - `material`: เข้าถึงหน้าจอด้านการเบิกจ่ายวัตถุดิบ
  - `concrete`: เข้าถึงหน้าจอตรวจสอบการสั่งคอนกรีต
  - `qc`: จำกัดการเข้าใช้งานให้เป็นแบบ Mobile Layout คล้าย Worker

### 2. ปรับปรุง Database Schema (เตรียมทำ Migration)

- **`PlanMaterial` (New Table):** สำหรับเก็บข้อมูลความต้องการใช้วัตถุดิบ (เช่น เหล็ก) ของแต่ละ Plan และสถานะการเบิกจ่ายโดย `Material`
- **`JobOrder` (Update):** เพิ่มฟิลด์:
  - `rebar_prepared_at`: เวลาที่ Worker ยืนยันการผูกเหล็ก
  - `concrete_ordered_at`: เวลาที่ Worker สั่งคอนกรีต
  - `concrete_status`: สถานะการจ่ายคอนกรีต (`pending`, `supplied`) โดย `Concrete` เป็นผู้อัปเดต
  - `pour_inspected_at`: เวลาที่ QC ยืนยันการเทคอนกรีต
- **`DemoldingRecord` / `QCInspection` (Update):** เปลี่ยนผู้รับผิดชอบจาก Worker เป็น QC ในการบันทึกยอดดี/เสีย 
- **`FGReceipt` (New Table / Update):** เพิ่มขั้นตอนให้ `Warehouse` เป็นผู้กดยืนยันรับสินค้าเข้าคลังหลังจากที่ QC ตรวจสอบเสร็จ

### 3. ปรับปรุง Workflow ในแอปพลิเคชัน (UI/UX)

#### ขั้นตอนที่ 1: Planner (Desktop)
- **[MODIFY] Planner Page:** เพิ่มแท็บหรือ Modal ให้ Planner ทำการคำนวณและสรุปรายการวัตถุดิบ (เช่น เหล็กเส้น) ที่ต้องใช้ในแผนการผลิตนั้นๆ

#### ขั้นตอนที่ 2: Material (Desktop/Tablet)
- **[NEW] Material Dashboard:** หน้าจอสำหรับให้พนักงานคลังวัตถุดิบดูเอกสารใบเบิกจาก Planner และกดยืนยันการจ่ายวัตถุดิบออกจากคลัง (`RawMaterial` inventory deduction).

#### ขั้นตอนที่ 3: Worker (Mobile)
- **[MODIFY] WorkerClient.tsx:** 
  - เพิ่มปุ่ม **"ยืนยันการวางเหล็กโครงสร้าง"**
  - เพิ่มปุ่ม **"สั่งคอนกรีต"** (กดแล้วสถานะส่งต่อไปให้พนักงานผสมคอนกรีต)

#### ขั้นตอนที่ 4: Concrete (Mobile/Desktop)
- **[NEW] Concrete Dashboard:** หน้าจอแสดงคิวการสั่งคอนกรีตจาก Worker พนักงานผสมคอนกรีตจะกดยืนยันเมื่อทำการผสมและจ่ายคอนกรีตเสร็จสิ้นในแต่ละรอบ

#### ขั้นตอนที่ 5: QC (Mobile)
- **[NEW] QC Mobile App (`app/(worker)/qc`):** 
  - สร้าง Layout แบบ Mobile เช่นเดียวกับ Worker ให้ QC เดินตรวจหน้าลาน
  - เพิ่มฟังก์ชันยืนยันการเทคอนกรีต
  - เพิ่มฟังก์ชันตรวจการตัดยก/ถอดแบบ นับจำนวนของดี/เสีย และระบุสาเหตุ

#### ขั้นตอนที่ 6: Warehouse (Desktop)
- **[MODIFY] Warehouse / Inventory Page:** เปลี่ยนจากการเพิ่มเข้าคลังอัตโนมัติ เป็นการแสดงรายการสินค้าที่ผ่าน QC แล้ว เพื่อให้คลังสินค้านับยอดจริงและกดยืนยันเข้าคลัง (FG) หลัก

---

## Verification Plan

### Manual Verification
1. **Login Flow:** ทดสอบล็อกอินด้วย 7 Roles และตรวจสอบการ Redirection
2. **End-to-End Workflow:** จำลองการสร้างแผน (Planner) -> จ่ายของ (Material) -> วางเหล็กและสั่งปูน (Worker) -> จ่ายปูน (Concrete) -> ตรวจสอบ (QC) -> รับเข้าคลัง (Warehouse)
3. **Mobile Layout:** ตรวจสอบ Responsive ของหน้า Worker และ QC ให้ใช้งานบนหน้าจอมือถือได้สะดวก
