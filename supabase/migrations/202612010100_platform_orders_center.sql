-- ศูนย์ออเดอร์แพลตฟอร์ม เฟส A (2026-11-10 · เจ้าของอนุมัติแผน "Approve, start")
-- เพิ่มช่องเท่านั้น ไม่แก้/ลบข้อมูลเดิม · ตารางมีอยู่แล้วทั้งคู่ → ใช้ add column if not exists (กันกับดัก create table if not exists)
--
-- platform_orders
--   platform_status      สถานะดิบบนร้าน เช่น Shopee READY_TO_SHIP (สถานะในระบบยังอยู่ที่ status · แปลงด้วย lib/platform-order-status)
--   ship_by_at           ต้องส่งภายใน (Shopee ship_by_date) — การ์ด "เลยกำหนด/ต้องส่งวันนี้"
--   package_no           เลขพัสดุภายในของร้าน (Shopee package_number) ใช้ขอใบปะหน้า
--   invoice_so_id        ใบขาย (ใบกำกับภาษี) ที่ออกจากออเดอร์นี้ — ออกผ่านใบขายเพื่อให้อยู่ในรายงานภาษีขายชุดเดียวกัน
--   tax_invoice_request  ข้อมูลผู้ขอใบกำกับ (รูปเดียวกับ lib/website-tax-invoice TaxInvoiceRequest)
-- platform_accounts
--   tax_invoice_company_id  บริษัทที่ออกใบกำกับของร้านนี้ (ไม่เดาบริษัทให้ — ใบกำกับผิดบริษัท = ปัญหาภาษี)

alter table public.platform_orders
  add column if not exists platform_status text,
  add column if not exists ship_by_at timestamptz,
  add column if not exists package_no text,
  add column if not exists invoice_so_id uuid references public.erp_playground_sales_orders(id) on delete set null,
  add column if not exists tax_invoice_request jsonb;

create index if not exists idx_platform_orders_source_status on public.platform_orders (source, status);
create index if not exists idx_platform_orders_ship_by on public.platform_orders (ship_by_at) where ship_by_at is not null;

alter table public.platform_accounts
  add column if not exists tax_invoice_company_id uuid references public.companies(id) on delete set null;

comment on column public.platform_orders.platform_status is 'สถานะดิบบนร้าน (เช่น Shopee READY_TO_SHIP) · สถานะในระบบอยู่ที่ status';
comment on column public.platform_orders.ship_by_at is 'ต้องส่งภายใน (จากร้าน)';
comment on column public.platform_orders.package_no is 'เลขพัสดุภายในของร้าน (Shopee package_number)';
comment on column public.platform_orders.invoice_so_id is 'ใบขาย/ใบกำกับภาษีที่ออกจากออเดอร์นี้';
comment on column public.platform_orders.tax_invoice_request is 'ข้อมูลผู้ขอใบกำกับภาษี (kind,name,taxId,branch,address,email)';
comment on column public.platform_accounts.tax_invoice_company_id is 'บริษัทที่ออกใบกำกับภาษีของร้านนี้';
