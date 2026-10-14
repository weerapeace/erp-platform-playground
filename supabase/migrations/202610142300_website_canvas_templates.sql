-- 📐 แม่แบบผืนผ้าใบอิสระ (Section canvas ของเว็บร้าน) — บันทึกผืนที่จัดแล้วไว้ใช้ซ้ำกับหน้าอื่น/ร้านอื่น
-- data = เนื้อผืน (height, bgImageKey, mobileAlign, mobileMode, mobileHeight, style, items[]) รูปแบบเดียวกับบล็อก canvas
-- shop_id = ร้านที่บันทึก (ร้านอื่นเห็นและใช้ได้ด้วย — แยกกลุ่ม "ร้านนี้ / ร้านอื่น" ในหน้าจอ)
-- เข้าถึงผ่าน API ฝั่งเซิร์ฟเวอร์เท่านั้น (/api/website/canvas-templates · service role) → เปิด RLS ไม่ตั้ง policy
-- ตารางใหม่ ไม่แตะข้อมูลเดิม

create table if not exists public.website_canvas_templates (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references public.shops(id) on delete set null,
  name text not null check (char_length(name) between 1 and 80),
  data jsonb not null,
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists website_canvas_templates_shop_idx on public.website_canvas_templates (shop_id, updated_at desc);

alter table public.website_canvas_templates enable row level security;

comment on table public.website_canvas_templates is 'แม่แบบผืนผ้าใบอิสระของเว็บร้าน (บันทึก/ใช้ซ้ำ/แก้ชื่อ/บันทึกทับ/ลบ ผ่าน /api/website/canvas-templates)';
comment on column public.website_canvas_templates.data is 'เนื้อผืน: height, bgImageKey, mobileAlign, mobileMode, mobileHeight, style, items[]';
