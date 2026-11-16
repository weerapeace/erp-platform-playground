-- ศูนย์งานแก้แอป (2026-11-16 · เจ้าของอนุญาตในแชต)
-- งานแก้ผูกกับ "หน้าไหน · ของกลางตัวไหน · จุดไหนในแผนผังการทำงาน"
-- ตาราง issue_reports ว่าง (0 แถว) ตอนเพิ่ม → ไม่กระทบข้อมูลเดิม
alter table public.issue_reports
  add column if not exists page_path text,
  add column if not exists parts jsonb not null default '[]'::jsonb,
  add column if not exists flow_refs jsonb not null default '[]'::jsonb;

create index if not exists issue_reports_page_path_idx on public.issue_reports (page_path);

comment on column public.issue_reports.page_path is 'หน้าที่ขอแก้ เช่น /quotations';
comment on column public.issue_reports.parts is 'ของกลางที่เกี่ยว: ["components/data-table", ...] (key ใน lib/shared-parts-registry)';
comment on column public.issue_reports.flow_refs is 'จุดในแผนผัง: [{"kind":"n","ref":"qt"}] (lib/flow-map)';
