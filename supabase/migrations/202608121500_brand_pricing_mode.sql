-- แบรนด์นี้ "มีราคาขายในระบบ" ไหม (ใช้ในหน้าแผนผู้บริหาร)
--   own = แบรนด์เราเอง ขายเอง → ราคาขาย (skus_v2.list_price) คือรายได้จริง ต้องตั้งให้ครบ
--   oem = รับจ้างผลิตให้ลูกค้า → ราคาคิดกันต่อออเดอร์ ไม่ต้องเตือนว่า "ยังไม่ตั้งราคา"
-- แยกจาก brands.is_customer_job (ของเดิมใช้ซ่อนแบรนด์จากงาน/แพลตฟอร์ม) เพื่อไม่ให้แก้ที่นี่ไปกระทบหน้าอื่น
alter table public.brands
  add column if not exists pricing_mode text not null default 'own'
    check (pricing_mode in ('own', 'oem'));

comment on column public.brands.pricing_mode is 'own = แบรนด์เราเอง มีราคาขายในระบบ · oem = รับจ้างผลิต ราคาต่อออเดอร์';

-- ตั้งค่าเริ่มต้นให้ตรงของจริง: แบรนด์ที่เคยติ๊ก "งานลูกค้า" ไว้ = OEM
update public.brands set pricing_mode = 'oem' where is_customer_job is true and pricing_mode = 'own';
