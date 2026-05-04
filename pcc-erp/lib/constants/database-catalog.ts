export interface ColumnDefinition {
  name: string
  type: string
  nullable: boolean
  default?: string
  description: string
  references?: {
    table: string
    column: string
  }
}

export interface TableDefinition {
  name: string
  description: string
  columns: ColumnDefinition[]
}

export interface EnumDefinition {
  name: string
  values: string[]
  description: string
}

export const DATABASE_CATALOG: {
  tables: TableDefinition[]
  enums: EnumDefinition[]
} = {
  tables: [
    {
      name: 'profiles',
      description: 'ข้อมูลผู้ใช้งานระบบและบทบาทหน้าที่ เชื่อมโยงกับ Supabase Auth',
      columns: [
        { name: 'id', type: 'UUID', nullable: false, description: 'Primary Key (References auth.users)' },
        { name: 'email', type: 'TEXT', nullable: false, description: 'อีเมลผู้ใช้งาน' },
        { name: 'full_name', type: 'TEXT', nullable: false, description: 'ชื่อ-นามสกุล' },
        { name: 'role', type: 'user_role', nullable: false, default: "'worker'", description: 'บทบาท (admin, planner, worker, qc)' },
        { name: 'employee_code', type: 'TEXT', nullable: true, description: 'รหัสพนักงาน (Unique)' },
        { name: 'avatar_url', type: 'TEXT', nullable: true, description: 'URL รูปโปรไฟล์' },
        { name: 'is_active', type: 'BOOLEAN', nullable: false, default: 'true', description: 'สถานะการใช้งานคัดกรองการเข้าถึง' },
        { name: 'created_at', type: 'TIMESTAMPTZ', nullable: false, default: 'NOW()', description: 'วันเวลาที่บันทึกข้อมูล' },
      ],
    },
    {
      name: 'products',
      description: 'ฐานข้อมูลสินค้า มาตราฐานขนาด และปริมาณคอนกรีตที่ใช้',
      columns: [
        { name: 'id', type: 'UUID', nullable: false, default: 'uuid_generate_v4()', description: 'Primary Key' },
        { name: 'code', type: 'TEXT', nullable: false, description: 'รหัสสินค้า (Unique)' },
        { name: 'name', type: 'TEXT', nullable: false, description: 'ชื่อสินค้า' },
        { name: 'category', type: 'TEXT', nullable: false, description: 'หมวดหมู่สินค้า' },
        { name: 'size', type: 'TEXT', nullable: false, description: 'ขนาดหรือสเปก' },
        { name: 'unit', type: 'TEXT', nullable: false, default: "'ชิ้น'", description: 'หน่วยนับ' },
        { name: 'concrete_per_unit', type: 'NUMERIC(8,4)', nullable: false, default: '0', description: 'ปริมาณคอนกรีตที่ใช้ต่อหน่วย (ลบ.ม.)' },
        { name: 'bom_code', type: 'TEXT', nullable: true, description: 'รหัสสูตรการผลิต' },
        { name: 'wip_code', type: 'TEXT', nullable: true, description: 'รหัสคลังโครงเหล็ก' },
        { name: 'is_active', type: 'BOOLEAN', nullable: false, default: 'true', description: 'สถานะพร้อมใช้งาน' },
        { name: 'created_at', type: 'TIMESTAMPTZ', nullable: false, default: 'NOW()', description: 'วันเวลาที่บันทึกข้อมูล' },
      ],
    },
    {
      name: 'production_plans',
      description: 'ตารางแผนการผลิตรายวัน (Master Plan)',
      columns: [
        { name: 'id', type: 'UUID', nullable: false, default: 'uuid_generate_v4()', description: 'Primary Key' },
        { name: 'plan_date', type: 'DATE', nullable: false, description: 'วันที่ของแผน (Unique)' },
        { name: 'created_by', type: 'UUID', nullable: true, description: 'ผู้จัดทำแผน', references: { table: 'profiles', column: 'id' } },
        { name: 'status', type: 'plan_status', nullable: false, default: "'draft'", description: 'สถานะแผนงาน' },
        { name: 'total_qty', type: 'INTEGER', nullable: false, default: '0', description: 'จำนวนชิ้นงานรวม' },
        { name: 'total_concrete', type: 'NUMERIC(10,2)', nullable: false, default: '0', description: 'ปริมาณคอนกรีตรวม' },
        { name: 'created_at', type: 'TIMESTAMPTZ', nullable: false, default: 'NOW()', description: 'วันเวลาที่สร้างแผน' },
      ],
    },
    {
      name: 'production_plan_items',
      description: 'รายการสินค้าที่ต้องผลิตภายใต้แผนงานรายวัน',
      columns: [
        { name: 'id', type: 'UUID', nullable: false, default: 'uuid_generate_v4()', description: 'Primary Key' },
        { name: 'plan_id', type: 'UUID', nullable: false, description: 'ID แผนการผลิต', references: { table: 'production_plans', column: 'id' } },
        { name: 'product_id', type: 'UUID', nullable: false, description: 'ID สินค้า', references: { table: 'products', column: 'id' } },
        { name: 'bed', type: 'bed_name', nullable: false, description: 'เตียงผลิต' },
        { name: 'qty_target', type: 'INTEGER', nullable: false, default: '1', description: 'จำนวนเป้าหมาย' },
        { name: 'status', type: 'job_status', nullable: false, default: "'pending'", description: 'สถานะปัจจุบัน' },
      ],
    },
    {
      name: 'production_orders',
      description: 'ใบสั่งผลิต (Production Order) สำหรับใช้ในกระบวนการหน้างาน',
      columns: [
        { name: 'id', type: 'UUID', nullable: false, default: 'uuid_generate_v4()', description: 'Primary Key' },
        { name: 'order_number', type: 'TEXT', nullable: false, description: 'เลขที่ใบสั่งผลิต (Auto-generated)' },
        { name: 'plan_id', type: 'UUID', nullable: false, description: 'ID แผนการผลิต', references: { table: 'production_plans', column: 'id' } },
        { name: 'confirmed_by', type: 'UUID', nullable: true, description: 'ผู้อนุมัติแผน', references: { table: 'profiles', column: 'id' } },
        { name: 'status', type: 'TEXT', nullable: false, default: "'active'", description: 'สถานะใบสั่งผลิต' },
        { name: 'created_at', type: 'TIMESTAMPTZ', nullable: false, default: 'NOW()', description: 'วันที่ออกใบสั่งผลิต' },
      ],
    },
    {
      name: 'job_orders',
      description: 'งานแต่ละชิ้นงานที่ถูกส่งไปมอบคุณหน้าที่ให้พนักงานหน้างาน (Casting Job)',
      columns: [
        { name: 'id', type: 'UUID', nullable: false, default: 'uuid_generate_v4()', description: 'Primary Key' },
        { name: 'order_id', type: 'UUID', nullable: false, description: 'ID ใบสั่งผลิต', references: { table: 'production_orders', column: 'id' } },
        { name: 'plan_item_id', type: 'UUID', nullable: false, description: 'ID รายการในแผน', references: { table: 'production_plan_items', column: 'id' } },
        { name: 'worker_id', type: 'UUID', nullable: true, description: 'พนักงานผู้รับผิดชอบ', references: { table: 'profiles', column: 'id' } },
        { name: 'bed', type: 'bed_name', nullable: false, description: 'เตียงทำงาน' },
        { name: 'qty_target', type: 'INTEGER', nullable: false, default: '1', description: 'จำนวนเป้าหมาย' },
        { name: 'qty_cast', type: 'INTEGER', nullable: false, default: '0', description: 'จำนวนที่เทปูนเสร็จแล้ว' },
        { name: 'status', type: 'job_status', nullable: false, default: "'pending'", description: 'สถานะงานล่าสุด' },
        { name: 'started_at', type: 'TIMESTAMPTZ', nullable: true, description: 'วันเวลาที่เริ่มงาน' },
        { name: 'cast_at', type: 'TIMESTAMPTZ', nullable: true, description: 'วันเวลาที่เทปูนเสร็จ' },
        { name: 'expected_demold_at', type: 'TIMESTAMPTZ', nullable: true, description: 'วันเวลาที่คาดว่าจะถอดแบบได้' },
        { name: 'demolded_at', type: 'TIMESTAMPTZ', nullable: true, description: 'วันเวลาที่ถอดแบบจริง' },
        { name: 'photo_cast_url', type: 'TEXT', nullable: true, description: 'ลิงก์รูปถ่ายขณะเทปูน' },
        { name: 'photo_ready_url', type: 'TEXT', nullable: true, description: 'ลิงก์รูปถ่ายพร้อมถอดแบบ' },
        { name: 'created_at', type: 'TIMESTAMPTZ', nullable: false, default: 'NOW()', description: 'วันเวลาที่สร้างรายการ' },
      ],
    },
    {
      name: 'demolding_records',
      description: 'บันทึกการถอดแบบและตรวจสอบคุณภาพชิ้นงาน',
      columns: [
        { name: 'id', type: 'UUID', nullable: false, default: 'uuid_generate_v4()', description: 'Primary Key' },
        { name: 'job_order_id', type: 'UUID', nullable: false, description: 'ID งานเทปูน', references: { table: 'job_orders', column: 'id' } },
        { name: 'worker_id', type: 'UUID', nullable: false, description: 'พนักงานผู้บันทึก', references: { table: 'profiles', column: 'id' } },
        { name: 'qty_good', type: 'INTEGER', nullable: false, default: '0', description: 'จำนวนชิ้นงานปกติ' },
        { name: 'qty_defect', type: 'INTEGER', nullable: false, default: '0', description: 'จำนวนชิ้นงานเสีย' },
        { name: 'defect_reason', type: 'defect_reason', nullable: true, description: 'สาเหตุสินค้าเสีย' },
        { name: 'defect_detail', type: 'TEXT', nullable: true, description: 'รายละเอียดเพิ่มเติม' },
        { name: 'photo_url', type: 'TEXT', nullable: true, description: 'ลิงก์รูปถ่ายผลงาน' },
      ],
    },
    {
      name: 'fg_inventory',
      description: 'คลังสินค้าสำเร็จรูป (Finished Goods Inventory)',
      columns: [
        { name: 'id', type: 'UUID', nullable: false, default: 'uuid_generate_v4()', description: 'Primary Key' },
        { name: 'product_id', type: 'UUID', nullable: false, description: 'ID สินค้า', references: { table: 'products', column: 'id' } },
        { name: 'qty', type: 'INTEGER', nullable: false, default: '0', description: 'จำนวนสินค้าคงเหลือ' },
        { name: 'last_updated_by', type: 'UUID', nullable: true, description: 'ผู้บันทึกล่าสุด', references: { table: 'profiles', column: 'id' } },
        { name: 'updated_at', type: 'TIMESTAMPTZ', nullable: false, default: 'NOW()', description: 'วันที่อัปเดตล่าสุด' },
      ],
    },
    {
      name: 'raw_materials',
      description: 'คลังวัตถุดิบและอุปกรณ์สนับสนุนการผลิต',
      columns: [
        { name: 'id', type: 'UUID', nullable: false, default: 'uuid_generate_v4()', description: 'Primary Key' },
        { name: 'name', type: 'TEXT', nullable: false, description: 'ชื่อวัตถุดิบ' },
        { name: 'category', type: 'TEXT', nullable: false, description: 'หมวดหมู่' },
        { name: 'unit', type: 'TEXT', nullable: false, description: 'หน่วยนับ' },
        { name: 'qty_on_hand', type: 'NUMERIC(12,3)', nullable: false, default: '0', description: 'จำนวนคงเหลือปัจจุบัน' },
        { name: 'min_stock', type: 'NUMERIC(12,3)', nullable: false, default: '0', description: 'ระดับแตือนภัยสต็อกต่ำ' },
      ],
    },
    {
      name: 'wip_inventory',
      description: 'คลังชิ้นงานกึ่งสำเร็จรูป (Work in Progress) เช่น โครงเหล็ก',
      columns: [
        { name: 'id', type: 'UUID', nullable: false, default: 'uuid_generate_v4()', description: 'Primary Key' },
        { name: 'product_id', type: 'UUID', nullable: false, description: 'ID สินค้า', references: { table: 'products', column: 'id' } },
        { name: 'wip_code', type: 'TEXT', nullable: false, description: 'รหัส WIP' },
        { name: 'qty', type: 'INTEGER', nullable: false, default: '0', description: 'จำนวนคงเหลือ' },
      ],
    },
    {
      name: 'activity_logs',
      description: 'ประวัติการทำรายการต่างๆ ในระบบเพื่อใช้ตรวจสอบ (Audit Trail)',
      columns: [
        { name: 'id', type: 'UUID', nullable: false, default: 'uuid_generate_v4()', description: 'Primary Key' },
        { name: 'user_id', type: 'UUID', nullable: true, description: 'ผู้ทำรายการ', references: { table: 'profiles', column: 'id' } },
        { name: 'action_type', type: 'TEXT', nullable: false, description: 'ประเภทเหตุการณ์ (เช่น login, create_plan)' },
        { name: 'entity_type', type: 'TEXT', nullable: false, description: 'ประเภทข้อมูลที่เกี่ยวข้อง' },
        { name: 'entity_id', type: 'UUID', nullable: true, description: 'ID ของข้อมูลที่อ้างถึง' },
        { name: 'detail', type: 'TEXT', nullable: true, description: 'รายละเอียดเพิ่มเติม' },
        { name: 'created_at', type: 'TIMESTAMPTZ', nullable: false, default: 'NOW()', description: 'วันเวลาที่เกิดเหตุการณ์' },
      ],
    },
  ],
  enums: [
    {
      name: 'user_role',
      values: ['admin', 'planner', 'worker', 'qc'],
      description: 'บทบาทหน้าที่ในระบบ ซึ่งจะกำหนดสิทธิ์ในการเข้าถึงฟีเจอร์ต่างๆ',
    },
    {
      name: 'plan_status',
      values: ['draft', 'confirmed', 'completed'],
      description: 'สถานะของแผนการผลิตรายวัน',
    },
    {
      name: 'job_status',
      values: ['pending', 'casting', 'curing', 'ready_demold', 'demolded', 'cancelled'],
      description: 'ขั้นตอนสถานะการผลิตตั้งแต่เริ่มต้นจนถึงถอดแบบเสร็จสิ้น',
    },
    {
      name: 'defect_reason',
      values: ['crack', 'chip', 'honeycomb', 'other'],
      description: 'ลักษณะหรือสาเหตุของความเสียหายที่พบจากการ QC',
    },
    {
      name: 'bed_name',
      values: ['A', 'B', 'C', 'D', 'E', 'F'],
      description: 'ชื่อเตียงผลิตในโรงงาน (Manufacturing Beds)',
    },
  ],
}
