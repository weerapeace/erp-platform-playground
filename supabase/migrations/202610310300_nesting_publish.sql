-- ============================================================
-- จัดเรียงงานพิมพ์ — เฟส 3 "ส่งเข้าคลังงานพิมพ์" (เจ้าของอนุมัติ 2026-10-25)
--
-- ส่งงาน = ตัวช่วยในเครื่องอัป PDF/รูปตัวอย่างขึ้น Drive (Printed/<ประเภท>/<โฟลเดอร์ย่อย>/<ชื่องาน>)
--          แล้ว ERP สร้าง/อัปเดตการ์ดในคลังไฟล์ หมวดงานพิมพ์ (assets.source = 'print')
-- 3 ช่องนี้ไว้จำว่างานนี้ส่งไปแล้ว → ส่งซ้ำ = ทับไฟล์เดิม + อัปเดตการ์ดเดิม (ไม่ได้การ์ดซ้ำ)
-- ============================================================

alter table public.erp_nesting_jobs
  add column if not exists asset_id uuid references public.assets(id) on delete set null,  -- การ์ดในคลังไฟล์ที่ส่งไป
  add column if not exists drive_folder_url text,                                          -- โฟลเดอร์ Drive ที่เก็บไฟล์พิมพ์
  add column if not exists published_at timestamptz;                                       -- ส่งล่าสุดเมื่อไหร่
