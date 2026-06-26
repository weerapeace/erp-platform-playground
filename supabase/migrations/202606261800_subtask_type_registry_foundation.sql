-- ====================================================================
-- Subtask Type Registry — ฐานราก: registry + คอลัมน์ subtask + sync ledger + สิทธิ์
-- additive ล้วน (ตารางใหม่ + คอลัมน์ nullable) — ไม่กระทบของเดิม
-- ====================================================================

create table if not exists public.erp_subtask_types (
  key text primary key,
  label_th text not null,
  label_en text,
  icon text,
  color text,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  is_builtin boolean not null default false,
  accepts_text boolean not null default false,
  accepts_image boolean not null default false,
  accepts_multi_image boolean not null default false,
  accepts_link boolean not null default false,
  accepts_file boolean not null default false,
  requires_approval boolean not null default true,
  approve_target text not null default 'none',   -- none | sku_media | sku_description | description_media | cover
  has_copy_prompt boolean not null default false,
  applies_to text[] not null default '{parent,sku}',
  default_required boolean not null default false,
  default_due_offset_days integer,
  default_assignee_id uuid,
  prompt_template text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.erp_subtask_types enable row level security;
drop policy if exists subtask_types_sel on public.erp_subtask_types;
create policy subtask_types_sel on public.erp_subtask_types for select to authenticated using (true);

insert into public.erp_subtask_types
  (key, label_th, label_en, icon, color, sort_order, is_builtin,
   accepts_text, accepts_image, accepts_multi_image, accepts_link, accepts_file,
   requires_approval, approve_target, has_copy_prompt, applies_to, default_due_offset_days, prompt_template)
values
  ('images','งานรูปภาพ','Images','🖼️','violet',10,true,
   false,true,true,true,false, true,'sku_media',true,'{parent,sku}',2,
   'ช่วยถ่าย/แต่งรูปสินค้าให้ {{parent_sku}} ({{product_name}}) แบรนด์ {{brand_name}} สี {{colors}} วัสดุ {{materials}} สำหรับ {{platforms}} — แนบรูปอ้างอิง: {{approved_image_urls}}'),
  ('description_text','งานเขียนคำอธิบาย','Description Text','📝','blue',20,true,
   true,false,false,false,false, true,'sku_description',true,'{parent,sku}',2,
   'ช่วยเขียนคำอธิบายสินค้าให้ {{parent_sku}} ({{product_name}}) แบรนด์ {{brand_name}} ราคา {{price}} collection {{collection}} สี {{colors}} วัสดุ {{materials}} สำหรับ {{platforms}}. รูปแบบผลลัพธ์: {{output_format}}. หมายเหตุ: {{notes}}'),
  ('description_image','งานรูปคำอธิบาย','Description Image','🧷','emerald',30,true,
   false,true,true,true,false, true,'description_media',true,'{parent,sku}',2,
   'ช่วยทำรูปประกอบคำอธิบายสินค้าให้ {{parent_sku}} ({{product_name}}) แบรนด์ {{brand_name}} — อ้างอิง: {{approved_image_urls}} หมายเหตุ {{notes}}'),
  ('custom','งานอื่น ๆ','Custom Task','🧰','slate',40,true,
   true,true,true,true,true, false,'none',false,'{parent,sku}',null,null)
on conflict (key) do nothing;

alter table public.erp_creative_subtasks add column if not exists subtask_type text;
alter table public.erp_creative_subtasks add column if not exists config jsonb not null default '{}'::jsonb;

create table if not exists public.erp_subtask_sync (
  id uuid primary key default gen_random_uuid(),
  subtask_id uuid not null,
  task_id uuid,
  type_key text,
  target_kind text not null,
  target_table text not null,
  target_id uuid not null,
  ref text,
  prev_value text,
  new_value text,
  mode text,
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  reversed_at timestamptz
);
create index if not exists idx_subtask_sync_subtask on public.erp_subtask_sync(subtask_id);
create index if not exists idx_subtask_sync_active on public.erp_subtask_sync(active) where active;
alter table public.erp_subtask_sync enable row level security;
drop policy if exists subtask_sync_sel on public.erp_subtask_sync;
create policy subtask_sync_sel on public.erp_subtask_sync for select to authenticated using (true);

insert into public.erp_permissions (key, label, category, is_dangerous, sort_order) values
  ('task_template.view','ดูเทมเพลตงาน','📋 งานจัดการ (Tasks)',false,610),
  ('task_template.create','สร้างเทมเพลตงาน','📋 งานจัดการ (Tasks)',false,611),
  ('task_template.edit','แก้เทมเพลตงาน','📋 งานจัดการ (Tasks)',false,612),
  ('task_template.delete','ลบ/เก็บเทมเพลตงาน','📋 งานจัดการ (Tasks)',true,613),
  ('task_subtask.approve','อนุมัติงานย่อย','📋 งานจัดการ (Tasks)',false,620),
  ('task_subtask.revise','ขอแก้งานย่อย','📋 งานจัดการ (Tasks)',false,621),
  ('task_subtask.cancel','ยกเลิกงานย่อย','📋 งานจัดการ (Tasks)',true,622),
  ('product_media.sync','ส่งรูปเข้าสินค้า (media sync)','📋 งานจัดการ (Tasks)',true,630),
  ('sku_description.sync','ส่งคำอธิบายเข้าสินค้า','📋 งานจัดการ (Tasks)',true,631)
on conflict (key) do nothing;

insert into public.erp_role_permissions (role_key, permission_key)
select r.role_key, r.permission_key from (values
  ('manager','task_template.view'),('manager','task_template.create'),('manager','task_template.edit'),('manager','task_template.delete'),
  ('manager','task_subtask.approve'),('manager','task_subtask.revise'),('manager','task_subtask.cancel'),
  ('manager','product_media.sync'),('manager','sku_description.sync'),
  ('staff','task_template.view'),
  ('PR_manager','task_template.view')
) as r(role_key, permission_key)
on conflict (role_key, permission_key) do nothing;
