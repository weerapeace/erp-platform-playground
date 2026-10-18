-- 🕘 ระบบเก็บเวอร์ชันกลาง (Record Versions) — ต่อยอดตาราง entity_field_history ที่มีอยู่แล้ว (เดิมว่าง ไม่มีใครเขียน)
--
-- เป้าหมาย: ทุกครั้งที่เปลี่ยน "คำอธิบาย/ชื่อ" หรือ "รูป" ของ Parent SKU / SKU → เก็บค่าเก่าไว้ ดู/เทียบ/ย้อนกลับได้
--   kind = 'field'  → ค่าข้อความของคอลัมน์ (field_key = ชื่อคอลัมน์ เช่น description) · old_value/new_value = jsonb
--   kind = 'image'  → รูปที่ถูกแทน/ถูกลบ (field_key = cover | gallery | description_images) · r2_key = ไฟล์รูปเก่า
-- ไฟล์รูปที่อยู่ในเวอร์ชันจะไม่ถูกย้ายเข้าถังขยะ R2 (lib/r2-refs นับคอลัมน์ r2_key นี้เป็น "ยังมีคนใช้")
-- เขียน/อ่านผ่าน API ฝั่ง server (service role) เท่านั้น — RLS เปิดอยู่แล้ว ไม่มี policy = ผู้ใช้ทั่วไปอ่านตรงไม่ได้
-- field_id (FK → entity_field_definitions) คงไว้สำหรับฟิลด์เสริม · คอลัมน์มาตรฐานใช้ field_key แทน (field_id = null)

alter table public.entity_field_history add column if not exists field_key   text;
alter table public.entity_field_history add column if not exists kind        text not null default 'field';
alter table public.entity_field_history add column if not exists r2_key      text;
alter table public.entity_field_history add column if not exists source      text;
alter table public.entity_field_history add column if not exists task_id     uuid;
alter table public.entity_field_history add column if not exists actor_name  text;
alter table public.entity_field_history add column if not exists meta        jsonb not null default '{}'::jsonb;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'entity_field_history_kind_check') then
    alter table public.entity_field_history
      add constraint entity_field_history_kind_check check (kind in ('field', 'image'));
  end if;
end $$;

create index if not exists idx_entity_field_history_field_key
  on public.entity_field_history (entity_type, entity_id, field_key, changed_at desc);
create index if not exists idx_entity_field_history_r2_key
  on public.entity_field_history (r2_key) where r2_key is not null;
create index if not exists idx_entity_field_history_task
  on public.entity_field_history (task_id) where task_id is not null;

comment on column public.entity_field_history.field_key  is 'ชื่อคอลัมน์ (kind=field) หรือ cover/gallery/description_images (kind=image)';
comment on column public.entity_field_history.kind       is 'field = ค่าข้อความ · image = รูปเก่าที่ถูกแทน/ลบ';
comment on column public.entity_field_history.r2_key     is 'ไฟล์รูปเก่า (kind=image) — กันไม่ให้ไฟล์ถูกย้ายเข้าถังขยะ R2';
comment on column public.entity_field_history.source     is 'มาจากไหน: master_edit / gallery_delete / description_image_remove / restore';
comment on column public.entity_field_history.task_id    is 'งาน Creative ที่เป็นต้นเหตุ (ถ้าแก้จากในงาน)';
