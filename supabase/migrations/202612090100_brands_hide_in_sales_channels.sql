-- 🛒 แบรนด์: สวิตช์ "ซ่อนในช่องทางขาย" — เจ้าของขอ 2026-11-13 ("ทำตามแผนเลย")
-- เดิม: แอปช่องทางขายซ่อนแบรนด์ที่เป็น "งานลูกค้า" อัตโนมัติ (ผูกกับ is_customer_job)
-- ใหม่: สวิตช์แยกของตัวเอง — ซ่อนแบรนด์ไหนก็ได้ (เช่น แบรนด์เราที่ยังไม่มีร้าน) / โชว์แบรนด์ลูกค้าที่ขายออนไลน์ได้
-- ซ่อน = ไม่โชว์ในตัวเลือกแบรนด์ของแอปช่องทางขาย · ข้อมูลร้าน/ออเดอร์/สินค้าเดิมไม่หาย
alter table public.brands add column if not exists hide_in_sales_channels boolean not null default false;

-- คงพฤติกรรมเดิม: แบรนด์งานลูกค้าที่มีอยู่ = ซ่อนไว้ก่อน (ปิดสวิตช์เองได้ทีหลัง)
update public.brands set hide_in_sales_channels = true where is_customer_job is true and hide_in_sales_channels = false;

comment on column public.brands.hide_in_sales_channels is
  'ซ่อนในแอปช่องทางขาย (ตัวเลือกแบรนด์ของหน้าแพลตฟอร์ม/ลงสินค้า/ออเดอร์) — ไม่ลบข้อมูล · ตั้งที่ /master/brands · เปิดงานลูกค้า = เปิดให้อัตโนมัติ';
