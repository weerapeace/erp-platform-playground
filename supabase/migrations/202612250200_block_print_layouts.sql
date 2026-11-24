-- 🧱 บล็อกพิมพ์ — แท็บ "จัดวางในบล็อก" (เจ้าของเลือกใน widget 2026-11-24: ข้อเสนอ 1-6 · สีใช้แยกส่วนบนจอ PDF ดำล้วน)
--   layouts jsonb = [{id, name, w, h, items:[{id, t, x, y, w, h, pieceId?, text?, font?, weight?, d?, dw?, dh?, color, fill, stroke, strokeColor, flip?}]}]
--   1 งานมีหลายบล็อกได้ · ตำแหน่ง/ขนาด หน่วย มม. วัดจากมุมซ้ายบนของบล็อก · ตรวจด้วย cleanLayouts (lib/block-print-layout.ts)
--   ข้อความเก็บเป็นเส้นแล้ว (d) — PDF/SVG ไม่ต้องมีฟอนต์ · เพิ่มคอลัมน์อย่างเดียว ไม่แตะข้อมูลเดิม
alter table public.block_print_jobs
  add column if not exists layouts jsonb not null default '[]'::jsonb;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'block_print_jobs_layouts_array') then
    alter table public.block_print_jobs add constraint block_print_jobs_layouts_array check (jsonb_typeof(layouts) = 'array');
  end if;
end $$;
