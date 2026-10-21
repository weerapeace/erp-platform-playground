-- 🧾 ใบกำกับภาษีเต็มรูปของออเดอร์เว็บ (ชุด 4 · 2026-10-22)
-- tax_invoice = ข้อมูลที่ลูกค้าขอตอนสั่ง (ชื่อ/เลขผู้เสียภาษี/สาขา/ที่อยู่ · lib/website-tax-invoice cleanTaxInvoice)
-- tax_invoice_no/_at/_company_id = ร้านกด "ออกใบกำกับ" ใน ERP แล้ว (เลขชุดของเว็บแยกจากใบสั่งขาย กันเลขชน: <รหัสบริษัท>-TI<ปปดด>-00001)
alter table public.store_orders add column if not exists tax_invoice jsonb;
alter table public.store_orders add column if not exists tax_invoice_no text;
alter table public.store_orders add column if not exists tax_invoice_at timestamptz;
alter table public.store_orders add column if not exists tax_invoice_company_id uuid references public.companies(id) on delete set null;
create unique index if not exists store_orders_tax_invoice_no_uidx on public.store_orders (tax_invoice_no) where tax_invoice_no is not null;

comment on column public.store_orders.tax_invoice is 'ลูกค้าขอใบกำกับภาษีเต็มรูป {kind, name, taxId, branch, address, email?}';
comment on column public.store_orders.tax_invoice_no is 'เลขที่ใบกำกับภาษี (ออกจาก ERP) — ชุดเลขของเว็บ ไม่ปนกับใบสั่งขาย';
