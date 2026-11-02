-- เทมเพลตบรีฟ ("รายการงานที่ต้องการ" ในป๊อปโพสต์) — กดเลือกแล้วเติมโน้ต + Ref ให้ (Ref ใช้ตัวเดิม ไม่อัปซ้ำ)
-- ใช้ร่วมทุกแบรนด์ (brand_id ว่าง) หรือติดแบรนด์ได้ (แบรนด์ของโพสต์ขึ้นก่อน) · แก้ได้ทุกคนที่มีสิทธิ์ tasks.edit (ผ่าน API)
create table if not exists public.erp_creative_brief_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tags text[] not null default '{}',
  brief text,                                        -- HTML จากกล่องพิมพ์จัดรูปแบบ (ช่องเดียวกับ erp_creative_content.brief)
  ref_image_keys text[] not null default '{}',       -- รูป Ref (คีย์ R2 เดิม — ใช้ซ้ำ ไม่อัปใหม่)
  ref_links jsonb not null default '[]'::jsonb,      -- ลิงก์ Ref [{url,label?}]
  brand_id uuid references public.brands(id) on delete set null,   -- ว่าง = ใช้ได้ทุกแบรนด์
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists erp_creative_brief_templates_brand_idx on public.erp_creative_brief_templates (brand_id);

-- อ่าน/เขียนผ่าน API (service role) เท่านั้น
alter table public.erp_creative_brief_templates enable row level security;

comment on table public.erp_creative_brief_templates is 'เทมเพลตบรีฟของโพสต์คอนเทนต์ (โน้ต + Ref) — เลือกแล้วต่อท้ายบรีฟของโพสต์';
