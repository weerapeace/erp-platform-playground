-- รายการหมวดหมู่ "ให้เลือก" ของแพลตฟอร์ม (เช่น LINE SHOPPING) — นำเข้าจากไฟล์ template → ใช้ทำ dropdown เลือกหมวด
-- (แยกจากตาราง platform_categories เดิมที่เป็นการแมปหมวดกลาง — อันนี้คือ "ตัวเลือกดิบ" ของแต่ละแพลตฟอร์ม)
-- external_id = รหัสหมวดของแพลตฟอร์ม (LINE categoryId) · name_en/th = path เต็ม (มี " > ")
create table if not exists public.platform_category_options (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null references public.erp_platforms(id) on delete cascade,
  external_id text not null,
  name_en text,
  name_th text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (platform_id, external_id)
);
create index if not exists idx_platform_category_options_platform on public.platform_category_options(platform_id);
alter table public.platform_category_options enable row level security;
drop policy if exists platform_category_options_sel on public.platform_category_options;
create policy platform_category_options_sel on public.platform_category_options for select to authenticated using (true);
