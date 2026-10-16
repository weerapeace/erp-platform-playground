-- 🧭 แม่แบบแผงเมนูใหญ่ (Mega menu) — บันทึกแผงที่จัดไว้แล้ว (แบบ A/B/C + คอลัมน์/แท็บ/ลิงก์/รูป) ไว้ใช้ซ้ำกับเมนูอื่น/ร้านอื่น
-- panel = แผง 1 อัน (ผ่าน normalizeMegaPanel แล้ว · lib/website-mega-menu)
-- shop_id = ร้านที่บันทึก (ทุกร้านเห็นและใช้ได้ — หน้าจอแยกกลุ่ม "ร้านนี้ / ร้านอื่น")
-- เข้าถึงผ่าน API ฝั่งเซิร์ฟเวอร์เท่านั้น (/api/website/menu-templates · service role) → เปิด RLS ไม่ตั้ง policy
-- แบบเดียวกับ website_section_templates / website_saved_themes · ตารางใหม่ ไม่แตะข้อมูลเดิม

create table if not exists public.website_menu_templates (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references public.shops(id) on delete set null,
  name text not null check (char_length(name) between 1 and 80),
  template text not null check (template in ('A', 'B', 'C')),
  panel jsonb not null,
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists website_menu_templates_shop_idx on public.website_menu_templates (shop_id, updated_at desc);

alter table public.website_menu_templates enable row level security;

comment on table public.website_menu_templates is 'แม่แบบแผงเมนูใหญ่ของเว็บร้าน (บันทึก/ใช้/แก้ชื่อ/ลบ ผ่าน /api/website/menu-templates) ใช้ข้ามร้านได้';
comment on column public.website_menu_templates.panel is 'แผงเมนู 1 อัน (template/layout/blocks/tabs) — ใช้แล้วได้สำเนา';
