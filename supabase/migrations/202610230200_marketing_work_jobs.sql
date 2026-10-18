-- 🛠 โหมดทำงาน ของหน้า SKU การตลาด — "งาน" ที่รวมหลายรุ่น + เช็กลิสต์ต่อรุ่น
--   เช่น งาน Clearance (ใส่ส่วนลด ฿/% ต่อรุ่น + ทำรูป/แก้ Lazada/แก้ Shopee) · งานลงเว็บไซต์ (ถ่ายรูป/เขียนรายละเอียด/ขึ้นเว็บ)
--   ราคาใหม่ "เก็บในงาน" เท่านั้น — ไม่แก้ราคาใน ERP (เจ้าของเลือก 2026-10-18)
--   เข้าถึงผ่าน API (service role) เท่านั้น → เปิด RLS ไม่มี policy + ถอนสิทธิ์ anon/authenticated

create table public.marketing_work_jobs (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  kind            text not null default 'custom' check (kind in ('clearance', 'website', 'custom')),
  -- ขั้นตอนของงานนี้ [{ "key": "s1", "label": "แก้ราคา Lazada" }] — ทุกรุ่นในงานใช้ชุดเดียวกัน
  steps           jsonb not null default '[]'::jsonb,
  -- ใส่รุ่นเข้างานแล้วติดป้ายหลักนี้ให้อัตโนมัติ (งาน Clearance = ป้าย Clearance Products) · null = ไม่ติด
  auto_label_id   uuid references public.marketing_sku_labels(id) on delete set null,
  assignee_id     uuid,
  assignee_name   text,
  due_date        date,
  status          text not null default 'open' check (status in ('open', 'done', 'archived')),
  note            text,
  created_by      uuid,
  created_by_name text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.marketing_work_job_items (
  id              uuid primary key default gen_random_uuid(),
  job_id          uuid not null references public.marketing_work_jobs(id) on delete cascade,
  parent_sku_id   uuid not null references public.parent_skus_v2(id) on delete cascade,
  -- ราคาเต็มตอนใส่เข้างาน (ราคาขายของสี/แบบที่ยังเปิด: ต่ำสุด–สูงสุด) · แก้เองได้ถ้าไม่มี/ไม่ตรง
  base_price_min  numeric(12, 2),
  base_price_max  numeric(12, 2),
  discount_value  numeric(12, 2),
  discount_unit   text not null default 'percent' check (discount_unit in ('baht', 'percent')),
  -- ขั้นตอนที่ทำแล้ว { "s1": { "at": "...", "by": "ชื่อ" } }
  step_done       jsonb not null default '{}'::jsonb,
  note            text,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (job_id, parent_sku_id)
);

create index marketing_work_job_items_job_idx on public.marketing_work_job_items (job_id, sort_order);
create index marketing_work_job_items_parent_idx on public.marketing_work_job_items (parent_sku_id);
create index marketing_work_jobs_status_idx on public.marketing_work_jobs (status, due_date);

alter table public.marketing_work_jobs enable row level security;
alter table public.marketing_work_job_items enable row level security;
revoke all on public.marketing_work_jobs from anon, authenticated;
revoke all on public.marketing_work_job_items from anon, authenticated;

comment on table public.marketing_work_jobs is 'งานของโหมดทำงาน หน้า SKU การตลาด (Clearance / ลงเว็บ / อื่น ๆ) — 1 งาน หลายรุ่น';
comment on table public.marketing_work_job_items is 'รุ่นในงาน + ส่วนลด (เก็บในงาน ไม่แก้ราคา ERP) + ขั้นตอนที่ทำแล้ว';
