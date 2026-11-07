-- ค่าแรงตัด/ปลอก/วาด คิดตามจำนวนชิ้นวัตถุดิบ (แท็บตีราคา ใบงานออกแบบ) — เจ้าของขอ 2026-11-07 · applied ผ่าน Supabase MCP แล้ว
--   ราคาตัดต่อชิ้น 3 ระดับ (ใช้ตัวที่ละเอียดกว่าก่อน): แก้ในใบ (บรรทัด) → ตามวัสดุ (ทะเบียนวัสดุตีราคา) → ราคากลาง (design_cost_presets kind cut_rate)
-- โค้ด: lib/design-cost-presets.ts (cutLaborRows) · docs/design-cost-presets.md

-- 1) ราคาตัดต่อชิ้นของวัสดุ (ตัดยาก = สูง · ตัดง่าย = ต่ำ) — ว่าง = ใช้ราคากลาง · แก้ที่ป๊อป "จัดการวัสดุตีราคา"
alter table public.design_price_items add column if not exists cut_rate numeric(10, 2) check (cut_rate is null or cut_rate >= 0);
comment on column public.design_price_items.cut_rate is 'ราคาค่าตัด/ปลอก/วาด ต่อชิ้น ของวัสดุนี้ (ว่าง = ใช้ราคากลาง design_cost_presets kind cut_rate)';

-- 2) ต่อบรรทัดตีราคา: แก้ราคาตัดเฉพาะใบนี้ + นับ/ไม่นับเป็นงานตัด (null = อัตโนมัติ: อะไหล่ไม่นับ)
alter table public.design_sheet_cost_lines add column if not exists cut_rate numeric(10, 2) check (cut_rate is null or cut_rate >= 0);
alter table public.design_sheet_cost_lines add column if not exists cut_skip boolean;
comment on column public.design_sheet_cost_lines.cut_rate is 'ราคาตัดต่อชิ้นเฉพาะบรรทัดนี้ (ว่าง = ตามวัสดุ / ราคากลาง)';
comment on column public.design_sheet_cost_lines.cut_skip is 'ไม่นับเป็นงานตัด (true) / นับ (false) / null = อัตโนมัติ (อะไหล่ไม่นับ)';

-- 3) ราคากลางค่าตัดต่อชิ้น = ชนิดใหม่ในตารางราคากลาง
alter table public.design_cost_presets drop constraint if exists design_cost_presets_kind_check;
alter table public.design_cost_presets add constraint design_cost_presets_kind_check
  check (kind in ('labor_cut', 'cut_rate', 'oh_fixed', 'bag', 'box', 'carton', 'parcel', 'other'));
