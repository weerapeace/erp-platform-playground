-- 🖨 ประวัติการพิมพ์เอกสาร (ของกลาง) — เจ้าของขอ 2026-10-31: "อยากให้เพิ่มประวัติ พิมพ์ใบงาน (บางทีพิมพ์หลายรอบ) และมีป้ายด้วยว่า พิมพ์ใบงานแล้ว"
--   เริ่มที่ใบสั่งงานผลิต (doc_type = 'mo') · เอกสารอื่น (ใบสั่งซื้อ / ใบส่งของ ฯลฯ) ใช้ต่อได้ด้วย doc_type ของตัวเอง
--   ทำไมไม่ใช้ audit_logs: บอร์ดต้องนับป้าย "พิมพ์แล้ว" ของทุกใบรอจ่าย (300+ ใบ) ทุกครั้งที่เปิด — ตารางเล็กแยก + index ตรงจุด = ไม่ทำบอร์ดช้า
--   1 แถว = พิมพ์ 1 ครั้งของ 1 ใบ (พิมพ์รวมหลายใบ = หลายแถว · batch_size = พิมพ์พร้อมกันกี่ใบ)
--   variant: print = กดพิมพ์ / Ctrl+P / บันทึก PDF จากหน้าต่างพิมพ์ · pdf = โหลด/เปิดไฟล์ PDF (เทมเพลต pdfme) · link = เปิดไฟล์พิมพ์ในแท็บใหม่ / ส่งลิงก์
--   qty_at_print = จำนวนสั่งผลิตตอนพิมพ์ (จำนวนเปลี่ยนทีหลัง = ป้ายเตือนว่าใบที่ช่างถืออยู่เป็นฉบับเก่า)
--   เข้าถึงผ่าน API (/api/print-logs, /api/mo/work-board) ด้วย service role เท่านั้น
create table if not exists public.print_logs (
  id uuid primary key default gen_random_uuid(),
  doc_type text not null,
  doc_id text not null,
  doc_no text,
  variant text not null default 'print' check (variant in ('print', 'pdf', 'link')),
  batch_size integer not null default 1,
  qty_at_print numeric,
  printed_by uuid,
  printed_by_name text,
  printed_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);
create index if not exists print_logs_doc_idx on public.print_logs (doc_type, doc_id, printed_at desc);

alter table public.print_logs enable row level security;
revoke all on public.print_logs from anon, authenticated;
