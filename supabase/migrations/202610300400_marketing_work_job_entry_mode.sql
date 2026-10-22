-- 🛠 โหมดทำงาน ↔ 📝 โหมดลงรายละเอียด (เจ้าของขอ 2026-10-22 "อยากให้เลือกได้ว่าถ้ากดสินค้า จะเข้าโหมดลงรายละเอียดอันไหน")
-- งานชุดรุ่นเก็บ key ของโหมดลงรายละเอียด (erp_modules.config.entry_modes ของ parent-skus-v2 / ชุดตั้งต้นใน lib/entry-modes)
--   กดการ์ดสินค้าในงานนั้น → ป๊อปสินค้าเปิดแล้วเข้าโหมดนั้นเลย · ว่าง = เปิดหน้าปกติ
alter table public.marketing_work_jobs
  add column if not exists entry_mode text;

-- งานลงเว็บที่มีอยู่แล้ว → เปิดในโหมด "ลงขายเว็บไซต์" (ค่าตั้งต้นเดียวกับงานลงเว็บที่สร้างใหม่)
update public.marketing_work_jobs set entry_mode = 'web' where kind = 'website' and entry_mode is null;
