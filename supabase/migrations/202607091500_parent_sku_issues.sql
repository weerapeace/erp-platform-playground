-- รายการปัญหาของสินค้า ผูกที่ Parent SKU (แชร์ทุกสี/ตัวลูก) — Phase 1
-- โชว์+เพิ่มได้จากป๊อป QC 3 จุด + หน้า Parent SKU (เฟส 2) + ใบสั่งผลิต (เฟส 3)
create table if not exists parent_sku_issues (
  id uuid primary key default gen_random_uuid(),
  parent_sku_id uuid not null references parent_skus_v2(id) on delete cascade,
  reason_id uuid references qc_defect_reasons(id),   -- เลือกจากสาเหตุกลาง (ถ้ามี)
  problem_text text not null,                        -- ข้อความที่โชว์ (ชื่อสาเหตุ หรือพิมพ์เอง)
  source text not null default 'manual',             -- manual | qc
  note text,
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  is_active boolean not null default true
);
create index if not exists idx_parent_sku_issues_parent on parent_sku_issues(parent_sku_id) where is_active;
alter table parent_sku_issues enable row level security;
drop policy if exists "read parent_sku_issues" on parent_sku_issues;
create policy "read parent_sku_issues" on parent_sku_issues for select using (true);
