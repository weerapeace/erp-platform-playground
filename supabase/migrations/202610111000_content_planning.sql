-- วางแผนคอนเทนต์ (หน้า /marketing/content-plan) — ใช้ข้อมูลชุดเดียวกับปฏิทินคอนเทนต์เดิม (erp_creative_content)
-- เพิ่มช่องฝั่ง "แผน": แนวคอนเทนต์ · เป้าหมาย · บรีฟ · รูปอ้างอิง
-- แนวคอนเทนต์ (pillar) เก็บในตารางป้ายการตลาดเดิม marketing_sku_labels ด้วย kind = 'pillar' (ตั้งค่าเพิ่ม/แก้/ลบได้ที่หน้าตั้งค่า)

alter table public.marketing_sku_labels drop constraint if exists marketing_sku_labels_kind_chk;
alter table public.marketing_sku_labels add constraint marketing_sku_labels_kind_chk check (kind in ('status', 'badge', 'pillar'));

alter table public.erp_creative_content
  add column if not exists pillar_id uuid references public.marketing_sku_labels(id) on delete set null,
  add column if not exists goal text,
  add column if not exists brief text,
  add column if not exists ref_image_keys text[] not null default '{}';

do $$ begin
  alter table public.erp_creative_content add constraint erp_creative_content_goal_chk
    check (goal is null or goal in ('awareness', 'sales', 'education', 'engagement'));
exception when duplicate_object then null; end $$;

create index if not exists ix_erp_creative_content_pillar on public.erp_creative_content (pillar_id);

-- แนวคอนเทนต์ตั้งต้น (เจ้าของเห็นชอบ 2026-10-11)
insert into public.marketing_sku_labels (name, icon, color, description, sort_order, kind) values
  ('โชว์สินค้า', '🛍️', '#2563eb', 'เน้นตัวสินค้า รายละเอียด สี ขนาด', 10, 'pillar'),
  ('ไลฟ์สไตล์', '👗', '#db2777', 'ใช้จริง แมตช์ชุด บรรยากาศ', 20, 'pillar'),
  ('รีวิว/UGC', '⭐', '#f59e0b', 'รีวิวลูกค้า คนใช้จริง', 30, 'pillar'),
  ('สอนใช้/ทริค', '💡', '#0d9488', 'How-to เคล็ดลับ วิธีจัดกระเป๋า', 40, 'pillar'),
  ('โปรโมชั่น', '🏷️', '#dc2626', 'ลดราคา แคมเปญ marketplace', 50, 'pillar'),
  ('เบื้องหลัง', '🎬', '#7c3aed', 'ขั้นตอนผลิต ทีมงาน ที่มา', 60, 'pillar'),
  ('เทรนด์', '🔥', '#ea580c', 'ตามกระแส มีม เพลงฮิต', 70, 'pillar')
on conflict do nothing;

-- เมนูในแอปการตลาด (ข้อมูลคอนเทนต์ต้องมีสิทธิ์ tasks.view)
insert into public.erp_menu_items (section, section_order, sort_order, icon, label, href, show_in_sidebar, show_in_launcher, permission_key, is_active, app_keys)
select 'การตลาด', 59, 13, '🗓️', 'วางแผนคอนเทนต์', '/marketing/content-plan', true, false, 'tasks.view', true, array['marketing']
where not exists (select 1 from public.erp_menu_items where href = '/marketing/content-plan');
