-- ติ๊กเลือกว่าบรรทัดไหน "นับรวมในยอดสรุป" (ค่าเริ่มต้น = รวม → ของเดิมทั้งหมดไม่กระทบ)
alter table public.design_sheet_supplier_lines
  add column if not exists in_total boolean not null default true;
comment on column public.design_sheet_supplier_lines.in_total is 'นับรวมในยอดสรุป/กำไร/ส่งใบเสนอราคาไหม (ติ๊กที่หน้าจอ)';
