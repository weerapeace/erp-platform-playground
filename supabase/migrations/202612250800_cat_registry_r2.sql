-- 🐾 ทะเบียนแมว รอบ 2-4 — อาหาร/ทราย/สต็อก/ซื้อเข้า · หาหมอ · ค่าใช้จ่ายอื่น · ค่าตั้ง (ตารางมื้อ + แจ้งเตือน LINE)
--
-- เจ้าของสั่ง 2026-11-24 "ทำต่อจนเสร็จเลย" (ต่อจากรอบ 1 migration 202612250600) · คู่มือ docs/cat-registry.md
-- สต็อก "ไม่ต้องตัดเอง": คงเหลือ = นับล่าสุด (stock_base_qty ณ stock_base_at) + ซื้อเข้าหลังจากนั้น − ใช้ต่อวัน × จำนวนวัน
--   (lib/cats-supplies.ts) → ลบ/กู้คืนใบซื้อเข้า สต็อกตามเองอัตโนมัติ ไม่มีตัวเลขค้างผิด
-- ทุกตาราง: ลบแบบเก็บไว้ก่อน (is_active + deleted_at) · RLS เปิด ไม่มี policy (เข้าผ่าน API เท่านั้น)

create table if not exists public.cat_supplies (
  id               uuid primary key default gen_random_uuid(),
  type             text not null check (type in ('dry_food', 'wet_food', 'litter')),
  wet_kind         text check (wet_kind in ('gravy', 'jelly')),          -- อาหารเปียก: เกรวี่ / เจลลี่ (สต็อกนับแยกกัน)
  brand            text not null,
  flavor           text,                                                  -- รสชาติ / รุ่น
  unit             text not null default 'bag' check (unit in ('bag', 'pouch', 'can')),   -- เม็ด/ทราย = ถุง · เปียก = ซอง/กระป๋อง
  pack_size        numeric(10,2) check (pack_size is null or pack_size > 0),      -- เม็ด: กรัมต่อถุง · ทราย: ขนาดถุง (ลิตร/กก. ตามป้าย)
  pack_size_unit   text,                                                  -- 'g' | 'L' | 'kg' (ป้ายโชว์)
  unit_size_g      numeric(10,2) check (unit_size_g is null or unit_size_g > 0),  -- เปียก: กรัมต่อชิ้น
  units_per_pack   integer check (units_per_pack is null or units_per_pack between 1 and 500),   -- เปียก: กี่ชิ้นต่อแพ็ค
  price            numeric(12,2) check (price is null or price >= 0),     -- เม็ด/ทราย: ราคาต่อถุง · เปียก: ราคาตาม price_per
  price_per        text not null default 'pack' check (price_per in ('piece', 'pack')),
  daily_g          numeric(10,2) check (daily_g is null or daily_g >= 0), -- เม็ด: กรัมต่อวัน (รวมทุกตัว)
  pack_lasts_days  numeric(10,2) check (pack_lasts_days is null or pack_lasts_days > 0),   -- ทราย: 1 ถุงใช้ได้กี่วัน
  stock_base_qty   numeric(10,2) not null default 0 check (stock_base_qty >= 0),   -- นับล่าสุด (ถุง หรือ ชิ้น)
  stock_base_at    timestamptz not null default now(),
  shop_url         text,
  shop_name        text,
  cat_ids          uuid[],                                                -- แมวที่กินของนี้ (ว่าง = ทุกตัว) — ใช้แบ่งค่าใช้จ่ายรายตัว
  note             text,
  sort_order       integer not null default 0,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
comment on table public.cat_supplies is 'ทะเบียนแมว: อาหารเม็ด/เปียก/ทราย + ราคา + อัตราใช้ + สต็อกฐาน · lib/cats-supplies.ts';

create table if not exists public.cat_purchases (
  id          uuid primary key default gen_random_uuid(),
  supply_id   uuid not null references public.cat_supplies(id) on delete cascade,
  date        date not null,
  qty         numeric(10,2) not null check (qty > 0),                -- หน่วยเดียวกับสต็อก (ถุง หรือ ชิ้น)
  packs       numeric(10,2) check (packs is null or packs > 0),      -- (เปียก) ซื้อกี่แพ็ค — ไว้โชว์
  price_paid  numeric(12,2) check (price_paid is null or price_paid >= 0),
  note        text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index if not exists cat_purchases_supply_idx on public.cat_purchases (supply_id, created_at desc);
comment on table public.cat_purchases is 'ทะเบียนแมว: ซื้อเข้า (บวกสต็อกเอง + นับเป็นค่าใช้จ่าย)';

create table if not exists public.cat_vet_visits (
  id              uuid primary key default gen_random_uuid(),
  cat_id          uuid not null references public.cats(id) on delete cascade,
  date            date not null,
  clinic_id       uuid references public.cat_clinics(id) on delete set null,
  symptoms        text,
  diagnosis       text,
  medicines       text,
  cost            numeric(12,2) check (cost is null or cost >= 0),
  receipt_r2_key  text,
  note            text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index if not exists cat_vet_visits_cat_idx on public.cat_vet_visits (cat_id, date desc);
comment on table public.cat_vet_visits is 'ทะเบียนแมว: บันทึกป่วย/ไปหาหมอ + รูปใบเสร็จ';

create table if not exists public.cat_expenses (
  id          uuid primary key default gen_random_uuid(),
  cat_id      uuid references public.cats(id) on delete set null,     -- ว่าง = ส่วนกลาง (แบ่งเท่ากันทุกตัวในสรุป)
  category    text not null check (category in ('snack', 'toy', 'grooming', 'vet', 'other')),
  date        date not null,
  amount      numeric(12,2) not null check (amount >= 0),
  note        text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index if not exists cat_expenses_date_idx on public.cat_expenses (date desc);
comment on table public.cat_expenses is 'ทะเบียนแมว: ค่าใช้จ่ายอื่น (ขนม/ของเล่น/อาบน้ำตัดขน/ค่าหมอ/อื่นๆ)';

-- ค่าตั้งของแอป (key → jsonb): meal_plan = ตารางมื้อเปียก · notify = แจ้งเตือน LINE
create table if not exists public.cat_settings (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
comment on table public.cat_settings is 'ทะเบียนแมว: ค่าตั้ง (meal_plan · notify) · lib/cats-supplies.ts cleanMealPlan / cleanNotify';

alter table public.cat_supplies enable row level security;
alter table public.cat_purchases enable row level security;
alter table public.cat_vet_visits enable row level security;
alter table public.cat_expenses enable row level security;
alter table public.cat_settings enable row level security;
