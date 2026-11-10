-- ขนส่งในศูนย์ออเดอร์ ขั้น 1 (โหมดจำลอง) — เจ้าของอนุมัติ 2026-11-10 ("Approve phase 1")
-- เพิ่มช่อง/ตารางใหม่เท่านั้น ไม่แก้ข้อมูลเดิม
--
-- platform_orders
--   ship_to     ที่อยู่ผู้รับ {name, phone, address, subdistrict, district, province, postal} — ออเดอร์ช่องทางของเรา (LINE/แชต/โทร)
--   shipping    ข้อมูลการจองขนส่ง (รูปเดียวกับ lib/shippop ShippopInfo + provider) — เลขพัสดุ สถานะ ประวัติ ค่าส่ง เก็บปลายทาง
--   cod_amount  ยอดเก็บเงินปลายทาง (0 = ไม่เก็บ)
-- shipping_profiles (ใหม่) — จุดส่งของต่อแบรนด์: ชื่อ/ที่อยู่ผู้ส่งบนใบปะหน้า · กล่อง/น้ำหนักตั้งต้น · ขนส่งที่ใช้บ่อย
--   RLS เปิด ไม่มี policy = เข้าได้ผ่าน API ฝั่งเซิร์ฟเวอร์ (service role) เท่านั้น
--   (กุญแจ SHIPPOP ต่อบริษัท = ขั้น 2 · ยังไม่เก็บที่นี่)
--
-- ⚠️ ยังไม่ได้ทำ (รอเจ้าของตัดสิน): ถอนสิทธิ์อ่านตรงของ authenticated บน platform_orders / platform_order_items
--    ตอนนี้ policy platform_orders_sel ให้ผู้ใช้ที่ล็อกอินอ่านตรงได้ · ทุกหน้าอ่านผ่าน API ฝั่งเซิร์ฟเวอร์อยู่แล้ว (ตรวจ 2026-11-10)

alter table public.platform_orders
  add column if not exists ship_to jsonb,
  add column if not exists shipping jsonb,
  add column if not exists cod_amount numeric not null default 0;

create index if not exists idx_platform_orders_shipping_tracking
  on public.platform_orders ((shipping->>'trackingCode')) where shipping is not null;

create table if not exists public.shipping_profiles (
  brand_id uuid primary key references public.brands(id) on delete cascade,
  sender_name text,
  sender_phone text,
  sender_address text,
  sender_subdistrict text,
  sender_district text,
  sender_province text,
  sender_postal text,
  default_box text not null default '20x30x10',
  default_weight_g integer not null default 500,
  default_courier text,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
alter table public.shipping_profiles enable row level security;

comment on column public.platform_orders.ship_to is 'ที่อยู่ผู้รับ {name,phone,address,subdistrict,district,province,postal}';
comment on column public.platform_orders.shipping is 'ข้อมูลการจองขนส่ง (lib/shippop ShippopInfo + provider)';
comment on column public.platform_orders.cod_amount is 'ยอดเก็บเงินปลายทาง (0 = ไม่เก็บ)';
comment on table public.shipping_profiles is 'จุดส่งของต่อแบรนด์ (ที่อยู่ผู้ส่ง/กล่อง/น้ำหนักตั้งต้น) — ศูนย์ออเดอร์ › ขนส่ง';
