-- ไลน์บริษัท รอบ 2 — QR 3 ใบ (พนักงาน / ลูกค้า / แอดมิน) · เจ้าของเลือก 2026-11-21
--   1) พนักงาน: ผูกด้วย "รหัส+เบอร์" จาก QR โปสเตอร์ = ต้องให้ HR กดยืนยันก่อนเห็นเงินเดือน/ใบเตือน
--      ผูกด้วยบัตร QR ส่วนตัว (HR พิมพ์แจก) = ยืนยันแล้วในตัว
--   2) ลูกค้า: QR รวมใบเดียว → ลูกค้าพิมพ์ชื่อร้าน → แถว status 'pending' (ยังไม่มีร้าน) → พนักงานเลือกร้าน+ยืนยันในห้องแชต /chat
--      ปฏิเสธ = 'rejected' (เก็บไว้ ไม่ลบ) · QR รายร้าน = ผูกร้านทันที (linked_via 'shop_qr')
-- เพิ่มอย่างเดียว ไม่แก้ข้อมูลเดิม (ตอนสร้าง: line_memberships linked 0 แถว · line_customer_links 0 แถว)

alter table public.line_memberships
  add column if not exists link_method text,             -- invite (บัตร QR ส่วนตัว) · phone (รหัส+เบอร์)
  add column if not exists hr_confirmed_at timestamptz,  -- HR ยืนยันว่าเป็นตัวจริง (บัตร QR ส่วนตัว = ใส่ให้ตอนผูก)
  add column if not exists hr_confirmed_by text;
comment on column public.line_memberships.hr_confirmed_at is 'ไลน์บริษัท: HR ยืนยันตัวตนแล้ว — ผูกด้วยรหัส+เบอร์ต้องยืนยันก่อนเห็นเงินเดือน/ใบเตือน';

alter table public.line_customer_links alter column partner_id drop not null;
alter table public.line_customer_links drop constraint if exists line_customer_links_status_check;
alter table public.line_customer_links add constraint line_customer_links_status_check
  check (status in ('pending', 'linked', 'unlinked', 'blocked', 'rejected'));
alter table public.line_customer_links drop constraint if exists line_customer_links_partner_needed;
alter table public.line_customer_links add constraint line_customer_links_partner_needed
  check (partner_id is not null or status in ('pending', 'rejected'));
alter table public.line_customer_links
  add column if not exists requested_shop text,          -- ชื่อร้านที่ลูกค้าพิมพ์มา (QR รวม)
  add column if not exists requested_at timestamptz,
  add column if not exists decided_at timestamptz,       -- พนักงานยืนยัน/ปฏิเสธเมื่อไร
  add column if not exists decided_by text;

-- ไลน์ 1 คน ขอผูกค้างได้ทีละ 1 คำขอ
create unique index if not exists line_customer_links_pending_line_idx
  on public.line_customer_links (line_user_id) where status = 'pending';
