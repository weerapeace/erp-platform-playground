-- 🔗 ลิงก์สั้น (ของกลาง) — louismontini.co.th/go/<code> → ลิงก์ปลายทาง (ร้าน TikTok/Shopee/ฯลฯ)
-- เจ้าของเลือกจาก widget 2026-11-20: แบบ /go/ บนโดเมนเว็บร้าน · ย่ออัตโนมัติในแคปชั่น · นับคลิกแยกที่มา · QR · ตั้งชื่อเองได้ · ใช้ลิงก์เดิมซ้ำ
-- ใช้ผ่าน API หลังบ้านเท่านั้น (/api/short-links · service role) — เปิด RLS ไม่มี policy + ถอนสิทธิ์ anon/authenticated
-- เว็บร้านเรียก /api/public/short-links/<code> ของ ERP → RPC short_link_hit (service_role เท่านั้น)

create table if not exists public.short_links (
  id              uuid primary key default gen_random_uuid(),
  -- รหัสท้ายลิงก์: ตัวเล็ก a-z 0-9 และ - (2-40 ตัว) · ไม่ซ้ำตลอดกาล (ลบแล้วก็ไม่ปล่อยให้คนอื่นใช้ซ้ำ กันลิงก์เก่าพาไปผิดที่)
  code            text not null unique check (code ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  -- ปลายทาง: เฉพาะ http/https (กันลิงก์ javascript:/data:)
  target_url      text not null check (target_url ~* '^https?://[^\s]+$' and char_length(target_url) <= 2000),
  label           text null check (label is null or char_length(label) <= 200),
  -- มาจากงานไหน (content / line / quotation / manual) + id เอกสาร — ไว้กดกลับไปดูต้นทาง
  source_module   text null,
  source_id       text null,
  custom_code     boolean not null default false,   -- ตั้งชื่อเอง (ไม่ใช่สุ่ม)
  is_active       boolean not null default true,     -- ปิดชั่วคราว (กดแล้วไปหน้าแรกร้าน)
  deleted_at      timestamptz null,                  -- ถังขยะ (กู้คืนได้)
  click_count     integer not null default 0,
  last_clicked_at timestamptz null,
  created_by      uuid null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
-- ใช้ลิงก์เดิมซ้ำ: หาจากปลายทางเดียวกัน (ที่ยังไม่ลบ)
create index if not exists short_links_target_idx on public.short_links (target_url) where deleted_at is null;
create index if not exists short_links_created_idx on public.short_links (created_at desc);

-- นับคลิกรายวัน × ที่มา (facebook / instagram / line / tiktok / qr / other) — ไม่เก็บ IP/ข้อมูลส่วนตัว
create table if not exists public.short_link_click_daily (
  link_id  uuid not null references public.short_links(id) on delete cascade,
  day      date not null,
  source   text not null check (source ~ '^[a-z_]{1,20}$'),
  clicks   integer not null default 0,
  primary key (link_id, day, source)
);

alter table public.short_links enable row level security;
alter table public.short_link_click_daily enable row level security;
revoke all on public.short_links from anon, authenticated;
revoke all on public.short_link_click_daily from anon, authenticated;

-- กดลิงก์ 1 ครั้ง: หา → นับ → คืนปลายทาง (null = ไม่มี/ปิด/ลบ)
create or replace function public.short_link_hit(p_code text, p_source text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid; v_url text; v_src text;
begin
  select id, target_url into v_id, v_url
    from public.short_links
   where code = lower(btrim(p_code)) and is_active and deleted_at is null;
  if v_id is null then return null; end if;
  v_src := case when coalesce(p_source, '') ~ '^[a-z_]{1,20}$' then p_source else 'other' end;
  update public.short_links set click_count = click_count + 1, last_clicked_at = now() where id = v_id;
  insert into public.short_link_click_daily (link_id, day, source, clicks)
  values (v_id, (now() at time zone 'Asia/Bangkok')::date, v_src, 1)
  on conflict (link_id, day, source) do update set clicks = public.short_link_click_daily.clicks + 1;
  return v_url;
end $$;
revoke all on function public.short_link_hit(text, text) from public, anon, authenticated;
grant execute on function public.short_link_hit(text, text) to service_role;

-- สิทธิ์: สร้าง (ย่อลิงก์ในแคปชั่น/งานต่าง ๆ) · จัดการ (แก้ปลายทาง/ปิด/ลบ ลิงก์ของคนอื่น)
insert into public.erp_permissions (key, label, category, description, is_dangerous)
values
  ('short_links.create', 'สร้างลิงก์สั้น (ย่อลิงก์)', 'tasks', 'ย่อลิงก์ร้านในแคปชั่น/งานต่าง ๆ เป็น louismontini.co.th/go/... และดูยอดคลิก', false),
  ('short_links.manage', 'จัดการลิงก์สั้นทั้งหมด', 'tasks', 'แก้ปลายทาง ปิด ลบ กู้คืน ลิงก์สั้นของทุกคน', false)
on conflict (key) do nothing;
insert into public.erp_role_permissions (role_key, permission_key)
select r.role_key, r.permission_key from (values
  ('manager','short_links.create'),('manager','short_links.manage'),
  ('staff','short_links.create')
) as r(role_key, permission_key)
on conflict (role_key, permission_key) do nothing;
