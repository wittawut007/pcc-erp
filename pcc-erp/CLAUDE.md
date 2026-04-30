# 🚀 PCC-ERP Project Context

@AGENTS.md
@PRODUCTION_WORKFLOW.md

## 📌 Project Overview
- **Project Name:** PCC-ERP (Enterprise Resource Planning)
- **Description:** ระบบ ERP สำหรับบริหารจัดการภายในองค์กร จัดการคลังสินค้า และการผลิต
- **Core Stack:** Next.js (App Router), Supabase (PostgreSQL + Auth), Tailwind CSS, TypeScript.

## 📂 Architecture & Directory Guide
เพื่อให้ AI เข้าใจโครงสร้างโปรเจกต์ที่แบ่งโซนผู้ใช้งานชัดเจน:
- `/app/(admin)/*`: เป็นพื้นที่สำหรับ "ผู้ดูแลระบบ" (Admin) ใช้จัดการข้อมูล Master data เช่น `data-catalog`, `inventory`, `users`
- `/app/(worker)/*`: เป็นพื้นที่สำหรับ "พนักงานปฏิบัติการ" (Worker) ระบบต้องใช้งานง่าย โหลดเร็ว เน้นไปที่ `WorkerClient.tsx`
- `/components/*`: เก็บ UI Components ที่ใช้ซ้ำได้ (Re-usable)
- `/lib/*` หรือ `/utils/*`: เก็บฟังก์ชันตัวช่วย (Helper functions)
- `/supabase/*`: (ถ้ามี) เก็บไฟล์ Database Migrations และ Type definitions

## 💻 Common Terminal Commands
หาก AI จำเป็นต้องรันคำสั่งใน Terminal ให้ใช้คำสั่งเหล่านี้:
- **Start Dev Server:** `npm run dev`
- **Linter & Type Check:** `npm run lint`
- **Install Package:** `npm install <package-name>` (หลีกเลี่ยงการใช้ yarn หรือ pnpm เว้นแต่โปรเจกต์จะใช้อยู่แล้ว)

## 🎯 Current Milestone (เป้าหมายปัจจุบัน)
- [ ] กำลังโฟกัสที่การสร้างระบบสำหรับ Worker และการจัดการ Role ของ User
*(หมายเหตุ: คุณสามารถเข้ามาแก้หัวข้อนี้ได้เรื่อยๆ เพื่อให้ AI โฟกัสงานปัจจุบัน)*