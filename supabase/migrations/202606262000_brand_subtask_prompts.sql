-- prompt ต่อแบรนด์ (override) — แบรนด์ตั้ง prompt เองต่อชนิดงานย่อย · ไม่ตั้ง = ใช้ค่าจากเทมเพลต/registry
create table if not exists public.erp_brand_subtask_prompts (
  brand_id uuid not null,
  subtask_type text not null,
  prompt_template text,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (brand_id, subtask_type)
);
alter table public.erp_brand_subtask_prompts enable row level security;
drop policy if exists brand_subtask_prompts_sel on public.erp_brand_subtask_prompts;
create policy brand_subtask_prompts_sel on public.erp_brand_subtask_prompts for select to authenticated using (true);
