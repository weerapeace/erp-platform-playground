-- 🔐 สิทธิ์เว็บไซต์: 6 กลุ่มงาน × ดู/แก้ + รายร้าน (ของกลาง lib/website-access · API lib/website-api-guard)
-- เดิม API เว็บไซต์ใช้ products.view / products.edit ทั้งหมด → ตำแหน่งที่มีสิทธิ์นั้นได้สิทธิ์ใหม่ครบ (ไม่มีใครเสียสิทธิ์ตอนเปลี่ยน)
-- เจ้าของตัดทีหลังที่หน้า /website/access (ตามตำแหน่ง + ยกเว้นรายคน)

insert into public.erp_permissions (key, label, category, description, is_dangerous, sort_order) values
  ('website.access',          'เว็บไซต์ · เข้าหน้าเว็บไซต์ (เห็นเมนู)', 'เว็บไซต์', 'ตั้งอัตโนมัติจากหน้าใครทำอะไรได้: เห็นอย่างน้อย 1 กลุ่ม', false, 2200),
  ('website.products.view',   'เว็บไซต์ · สินค้าบนเว็บ: ดู',            'เว็บไซต์', 'สินค้า หมวด คอลเลกชัน มาใหม่ ตารางไซส์ ชุดรูป', false, 2201),
  ('website.products.edit',   'เว็บไซต์ · สินค้าบนเว็บ: แก้',           'เว็บไซต์', null, false, 2202),
  ('website.design.view',     'เว็บไซต์ · หน้าตาเว็บ: ดู',              'เว็บไซต์', 'ดีไซน์ หน้าแรก หน้าเว็บ แปลภาษา', false, 2203),
  ('website.design.edit',     'เว็บไซต์ · หน้าตาเว็บ: แก้',             'เว็บไซต์', null, false, 2204),
  ('website.orders.view',     'เว็บไซต์ · ออเดอร์และลูกค้า: ดู',         'เว็บไซต์', 'ออเดอร์ คืน/เปลี่ยน สมาชิก รีวิว — มีข้อมูลส่วนตัวลูกค้า', false, 2205),
  ('website.orders.edit',     'เว็บไซต์ · ออเดอร์และลูกค้า: แก้',        'เว็บไซต์', null, false, 2206),
  ('website.promos.view',     'เว็บไซต์ · โปรโมชัน: ดู',                'เว็บไซต์', 'คูปอง โปรโมชัน ระดับสมาชิก', false, 2207),
  ('website.promos.edit',     'เว็บไซต์ · โปรโมชัน: แก้',               'เว็บไซต์', null, false, 2208),
  ('website.settings.view',   'เว็บไซต์ · ตั้งค่าร้าน: ดู',              'เว็บไซต์', 'ข้อมูลร้าน การจัดส่ง การชำระเงิน การเข้าสู่ระบบสมาชิก', false, 2209),
  ('website.settings.edit',   'เว็บไซต์ · ตั้งค่าร้าน: แก้',             'เว็บไซต์', 'รวมเปิด/ปิดเว็บ และรหัสเข้าสู่ระบบ Google/LINE/Facebook', true, 2210),
  ('website.stats.view',      'เว็บไซต์ · สถิติ: ดู',                   'เว็บไซต์', null, false, 2211)
on conflict (key) do nothing;

-- รายร้าน: website.shop.<slug> (ร้านที่สร้างใหม่ทีหลัง: หน้าตั้งค่าสร้างสิทธิ์ให้เองตอนติ๊ก)
insert into public.erp_permissions (key, label, category, description, is_dangerous, sort_order)
select 'website.shop.' || s.slug, 'เว็บไซต์ · เข้าร้าน ' || s.name, 'เว็บไซต์', null, false, 2220
from public.shops s
on conflict (key) do nothing;

-- ตำแหน่งที่เคยมี products.view → ได้ "ดู" ทุกกลุ่ม + เข้าหน้า + ทุกร้าน · products.edit → ได้ "แก้" ทุกกลุ่ม (เหมือนเดิมทุกอย่าง)
insert into public.erp_role_permissions (role_key, permission_key)
select rp.role_key, p.key
from public.erp_role_permissions rp
join public.erp_permissions p
  on p.key like 'website.%'
 and (case when rp.permission_key = 'products.edit' then p.key like 'website.%.edit'
           else p.key not like 'website.%.edit' end)
where rp.permission_key in ('products.view', 'products.edit')
on conflict do nothing;

-- เมนูเว็บไซต์เข้าแอป "จัดการงาน" (ยังอยู่ ช่องทางขาย/หน้าหลักเหมือนเดิม) + ใครเห็นเมนู = website.access
update public.erp_menu_items
set app_keys = case when 'tasks' = any(app_keys) then app_keys else array_append(app_keys, 'tasks') end,
    permission_key = 'website.access',
    app_overrides = coalesce(app_overrides, '{}'::jsonb) || jsonb_build_object('tasks', coalesce(app_overrides -> 'tasks', '{}'::jsonb) || '{"label":"เว็บไซต์","sort":25}'::jsonb)
where href = '/website';
