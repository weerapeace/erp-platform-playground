-- ไลน์บริษัท เฟส 0 — ตารางผูก "คนในไลน์" กับ "ร้านลูกค้า" (partners_v2)
--   ร้านเดียวผูกได้หลายคน (เจ้าของร้าน · ฝ่ายจัดซื้อ ฯลฯ) · ไลน์ 1 คนผูกได้ทีละ 1 ร้าน
--   ถอนผูก = เก็บแถวไว้ (status unlinked + unlinked_at) ไม่ลบ · บล็อก = status blocked (บอทไม่ให้ดูข้อมูลร้าน)
--   ใช้คู่กับ line_memberships (ฝั่งพนักงาน) — ตัวแยกคน lib/line-identity อ่านทั้งสองตาราง
--   เข้าถึงผ่าน API ฝั่งเซิร์ฟเวอร์เท่านั้น (RLS เปิด ไม่มี policy + ถอนสิทธิ์ anon/authenticated)

create table if not exists public.line_customer_links (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners_v2(id) on delete restrict,
  line_user_id text not null check (line_user_id ~ '^U[0-9a-f]{32}$'),
  line_display_name text,
  line_picture_url text,
  contact_name text,                       -- ชื่อที่พนักงานตั้งให้ เช่น "คุณนก ฝ่ายจัดซื้อ" (แก้ได้)
  status text not null default 'linked' check (status in ('linked', 'unlinked', 'blocked')),
  linked_via text,                         -- invite (ลิงก์เชิญรายร้าน) · manual
  linked_at timestamptz not null default now(),
  unlinked_at timestamptz,
  blocked_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ไลน์ 1 คน = ร้านเดียวในเวลาเดียวกัน (แถวที่ถอนผูกแล้วไม่นับ)
create unique index if not exists line_customer_links_active_line_idx
  on public.line_customer_links (line_user_id) where status in ('linked', 'blocked');
create index if not exists line_customer_links_partner_idx on public.line_customer_links (partner_id);

alter table public.line_customer_links enable row level security;
revoke all on public.line_customer_links from anon, authenticated;

comment on table public.line_customer_links is 'ไลน์บริษัท: คนในไลน์ ↔ ร้านลูกค้า (หลายคนต่อร้าน) · เข้าถึงผ่าน server เท่านั้น · lib/line-identity';
