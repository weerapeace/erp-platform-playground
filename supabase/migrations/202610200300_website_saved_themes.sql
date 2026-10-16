-- 💾 ธีมที่บันทึกไว้ของหน้าดีไซน์เว็บ (แท็บ "สี") — บันทึกหน้าตาที่ปรับแล้วไว้ใช้ซ้ำ/ใช้กับร้านอื่น
-- scope = 'colors' (เฉพาะสี) | 'full' (ทั้งชุดหน้าตา: สี ฟอนต์ ตัวอักษร รูปทรง การ์ด หัวเว็บ หน้าตาหน้าสินค้า)
-- theme = เฉพาะส่วนหน้าตา (lib/website-saved-themes themeLookOf) — ไม่มีโลโก้/เมนู/ท้ายเว็บ/เนื้อหาร้าน
-- shop_id = ร้านที่บันทึก (ทุกร้านเห็นและใช้ได้ — หน้าจอแยกกลุ่ม "ร้านนี้ / ร้านอื่น")
-- เข้าถึงผ่าน API ฝั่งเซิร์ฟเวอร์เท่านั้น (/api/website/saved-themes · service role) → เปิด RLS ไม่ตั้ง policy
-- แบบเดียวกับ website_section_templates · ตารางใหม่ ไม่แตะข้อมูลเดิม

create table if not exists public.website_saved_themes (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references public.shops(id) on delete set null,
  name text not null check (char_length(name) between 1 and 80),
  scope text not null check (scope in ('colors', 'full')),
  theme jsonb not null,
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists website_saved_themes_shop_idx on public.website_saved_themes (shop_id, updated_at desc);

alter table public.website_saved_themes enable row level security;

comment on table public.website_saved_themes is 'ธีมที่บันทึกไว้ของเว็บร้าน (บันทึก/ใช้/แก้ชื่อ/ลบ ผ่าน /api/website/saved-themes) ใช้ข้ามร้านได้';
comment on column public.website_saved_themes.theme is 'เฉพาะส่วนหน้าตาของธีม (colors/fonts/typography/shape/card/header-look/page/product-look) ไม่มีเนื้อหาร้าน';
