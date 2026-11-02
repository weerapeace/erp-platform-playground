-- ✍ หมายเหตุที่พิมพ์เองบนหน้าพิมพ์ (ของกลาง) — เจ้าของขอ 2026-11-02: "อยากได้ column เพิ่ม สำหรับใส่หมายเหตุเอง" + เลือก "จำไว้ ทั้งทีมเห็น"
--   ช่อง "พิมพ์เอง" ในใบพิมพ์แบบรายการ (lib/list-print blank = text) · ใช้ครั้งแรก: สรุปสั่งซื้อ / รอรับ (/print/purchasing-orders)
--   ทำไมไม่ใช้ช่อง note เดิม: purchase_order_lines_v2.note ส่วนใหญ่เป็นสำเนาชื่อสินค้า · purchase_requests_v2.note เป็นข้อความระบบ "จากใบสั่งผลิต MO-…"
--   1 แถว = ข้อความ 1 ช่อง ของ 1 แถวในใบ (report_key + row_key + col_key) · ลบข้อความ = ลบแถว
--   row_key = รหัสแถวที่รายงานกำหนด (เช่น "r:PO-2026-00253|MN1801/18MM#N") — คงที่ไม่ว่าจะจัดกลุ่ม/รวมแถวแบบไหน
--   เข้าถึงผ่าน API (/api/print-notes) ด้วย service role เท่านั้น · ทุกการแก้เขียน audit_logs
create table if not exists public.print_row_notes (
  report_key text not null,
  row_key text not null,
  col_key text not null,
  body text not null,
  updated_by uuid,
  updated_by_name text,
  updated_at timestamptz not null default now(),
  primary key (report_key, row_key, col_key)
);

alter table public.print_row_notes enable row level security;
revoke all on public.print_row_notes from anon, authenticated;
