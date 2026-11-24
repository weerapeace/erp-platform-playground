-- 💌 เขียนการ์ดของขวัญจากหมายเหตุออเดอร์ (เจ้าของเลือกใน widget 2026-11-24 · แบบ A แม่แบบ + แก้ข้อความ · ข้อเสนอ 1-10)
-- หน้า /order-ops/gift-cards · API /api/order-gift-cards · กติกา lib/gift-card-design · คู่มือ docs/order-gift-cards.md
-- ทุกตาราง: deleted_at = ถังขยะ (ลบแบบเก็บไว้ก่อน) · อ่าน/เขียนผ่าน API (service role) เท่านั้น
-- เพิ่มอย่างเดียว ไม่แตะตารางออเดอร์/สต๊อก

-- แม่แบบการ์ด (ออกแบบลากวางครั้งเดียว ใช้ซ้ำทุกออเดอร์) · doc = ชิ้นบนการ์ด (ข้อความ/รูป/รูปทรง หน่วย มม.)
create table if not exists public.gift_card_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand_id uuid references public.brands(id) on delete set null,
  doc jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  sort_order int not null default 0,
  deleted_at timestamptz,
  created_by uuid,
  created_by_name text,
  updated_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists gift_card_templates_list_idx on public.gift_card_templates (sort_order, created_at) where deleted_at is null;

-- การ์ดของแต่ละออเดอร์ (ไม่ผูกออเดอร์ก็ได้ = การ์ดที่ลูกค้าขอทางแชต) · prev_doc = ย้อนการบันทึกครั้งล่าสุด 1 ขั้น
create table if not exists public.order_gift_cards (
  id uuid primary key default gen_random_uuid(),
  platform_order_id uuid references public.platform_orders(id) on delete set null,
  order_no text,
  platform text,
  brand_id uuid references public.brands(id) on delete set null,
  customer_note text,
  template_id uuid references public.gift_card_templates(id) on delete set null,
  doc jsonb not null default '{}'::jsonb,
  prev_doc jsonb,
  message text,
  note text,
  print_count int not null default 0,
  printed_at timestamptz,
  printed_by_name text,
  hand_written_at timestamptz,
  hand_written_by_name text,
  deleted_at timestamptz,
  created_by uuid,
  created_by_name text,
  updated_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists order_gift_cards_po_idx on public.order_gift_cards (platform_order_id);
create index if not exists order_gift_cards_list_idx on public.order_gift_cards (created_at desc) where deleted_at is null;

-- คัดแยกหมายเหตุ: ระบบเดาเอง (lib/gift-card-design classifyNote) · คนแก้ได้ต่อออเดอร์ = แถวนี้ (ไม่มีแถว = ใช้ที่ระบบเดา)
create table if not exists public.order_note_kinds (
  platform_order_id uuid primary key references public.platform_orders(id) on delete cascade,
  card boolean not null default false,
  engrave boolean not null default false,
  updated_by_name text,
  updated_at timestamptz not null default now()
);

-- ฟอนต์ของแบรนด์ที่อัปโหลดเอง (.ttf/.otf/.woff/.woff2) — ไฟล์อยู่ R2 · เสิร์ฟผ่าน /api/order-gift-cards/fonts/<id>
create table if not exists public.gift_card_fonts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  r2_key text not null,
  format text not null,
  size_bytes int,
  deleted_at timestamptz,
  created_by_name text,
  created_at timestamptz not null default now()
);

alter table public.gift_card_templates enable row level security;
alter table public.order_gift_cards enable row level security;
alter table public.order_note_kinds enable row level security;
alter table public.gift_card_fonts enable row level security;
revoke all on public.gift_card_templates, public.order_gift_cards, public.order_note_kinds, public.gift_card_fonts from anon, authenticated;

-- เมนูในแอป "ออเดอร์ออนไลน์" (marketplace) ต่อจาก คำสั่งพิเศษ · ใช้สิทธิ์ชุดงานหลังขาย (order_ops.*)
insert into public.erp_menu_items (href, icon, label, section, app_keys, sort_order, section_order, permission_key, is_active, show_in_sidebar, show_in_launcher)
select '/order-ops/gift-cards', 'i:gift-card', 'เขียนการ์ดของขวัญ', 'งานขายออนไลน์', array['marketplace'], 22, 20, 'order_ops.view', true, true, true
where not exists (select 1 from public.erp_menu_items where href = '/order-ops/gift-cards');
