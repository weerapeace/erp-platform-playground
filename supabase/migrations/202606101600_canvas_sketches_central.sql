-- ของกลาง: กระดานวาด Excalidraw ผูกกับเอกสารใดก็ได้ (entity_type + entity_id) — 1 กระดานต่อเอกสาร
-- รันแล้วบน Supabase ผ่าน MCP apply_migration (canvas_sketches_central) 2026-06-10
-- ใช้ครั้งแรก: Design Sheets แท็บ "🖌 กระดาน" · โมดูลอื่นใช้ผ่าน components/canvas-sketch
create table if not exists erp_canvas_sketches (
  id             uuid primary key default gen_random_uuid(),
  entity_type    text not null,
  entity_id      text not null,
  scene          jsonb,                 -- ข้อมูลภาพวาด (elements/appState/files ของ Excalidraw)
  preview_r2_key text,                  -- ภาพถ่ายกระดาน PNG ใน R2 (ใบพิมพ์ใช้) — key ตายตัว บันทึกทับของเก่า
  updated_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (entity_type, entity_id)
);
create index if not exists erp_canvas_sketches_entity_idx on erp_canvas_sketches (entity_type, entity_id);
alter table erp_canvas_sketches enable row level security;
drop policy if exists erp_canvas_sketches_select on erp_canvas_sketches;
create policy erp_canvas_sketches_select on erp_canvas_sketches for select using (true);
